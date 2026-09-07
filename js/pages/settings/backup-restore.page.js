import { setNavigationGuard } from '../../router.js';

const labels = {
  profiles: 'Profile', exercise_types: '운동 종류', exercise_templates: '운동 양식', exercise_logs: '운동 기록',
  exercise_schedules: '예약', passes: '이용권', pass_usage_logs: '이용 내역', diet_logs: '식단',
  diet_photos: '사진', weight_logs: '체중', inbody_logs: '인바디', user_settings: '사용자 설정'
};
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export function mountBackupSettings(root, { services, showToast, isCurrent, reload = () => window.location.reload() }) {
  const section = document.createElement('section');
  section.className = 'card';
  section.id = 'backup-settings';
  section.innerHTML = `<h2>데이터 백업</h2>
    <p>현재 Profile의 기록을 JSON v1 파일로 보관합니다. 현재 버전은 사진 파일을 지원하지 않습니다. 백업 파일은 암호화되지 않습니다.</p>
    <div class="form-actions backup-actions"><button id="backup-export" class="button" type="button">백업 내보내기</button><button id="backup-select" class="button button-secondary" type="button">백업 복원</button></div>
    <input id="backup-file" type="file" accept=".json,application/json" hidden aria-label="백업 JSON 파일 선택">
    <p id="backup-status" class="section-description" role="status" aria-live="polite"></p>
    <div id="backup-preview"></div>`;
  root.append(section);
  const status = section.querySelector('#backup-status');
  const previewRoot = section.querySelector('#backup-preview');
  const fileInput = section.querySelector('#backup-file');
  let busy = false;
  let preview = null;
  services.backupImport.discardPreview();
  setNavigationGuard(() => !busy);
  function setBusy(value) {
    busy = value;
    section.setAttribute('aria-busy', String(value));
    section.querySelectorAll('button, input').forEach((node) => { node.disabled = value; });
    const restore = section.querySelector('#backup-confirm');
    if (restore) restore.disabled = value || !preview?.pristine;
  }
  function errorMessage(error) {
    const message = typeof error?.code === 'string' && /^(BACKUP_|RESTORE_)/.test(error.code)
      ? error.message : '백업 작업을 완료하지 못했습니다. 다시 시도해 주세요.';
    status.textContent = `${message}${error?.code ? ` (오류코드: ${error.code})` : ''}`;
  }
  function renderPreview() {
    previewRoot.innerHTML = `<div class="form-section"><h3>백업 파일 확인</h3>
      <dl class="diagnostic-list">
      <div><dt>백업 생성</dt><dd>${escape(new Date(preview.exportedAt).toLocaleString('ko-KR'))}</dd></div>
      <div><dt>생성 앱 / Schema</dt><dd>v${escape(preview.source.appVersion)} / v${preview.source.schemaVersion}</dd></div>
      <div><dt>Profile</dt><dd>${escape(preview.profile.display_name)} · ${escape(preview.profile.id.slice(0, 8))}…</dd></div>
      ${Object.entries(labels).map(([name, label]) => `<div><dt>${label}</dt><dd>${preview.counts[name]}건${preview.deletedCounts[name] ? ` · 삭제 ${preview.deletedCounts[name]}건 포함` : ''}</dd></div>`).join('')}
      <div><dt>무결성 / 파일 호환성</dt><dd class="status-normal">정상</dd></div></dl>
      <p class="section-description ${preview.pristine ? '' : 'warning-text'}">${preview.pristine
        ? '초기 상태에 복원할 수 있습니다. 자동 생성된 Profile과 기본 운동을 백업의 원본 데이터로 교체합니다.'
        : '현재 데이터 또는 변경된 설정이 있어 복원 실행은 차단됩니다. 기존 데이터와 병합하거나 덮어쓰지 않습니다.'}</p>
      <div class="form-actions backup-actions"><button id="backup-cancel" class="button button-secondary" type="button">취소</button><button id="backup-confirm" class="button" type="button" ${preview.pristine ? '' : 'disabled'}>복원</button></div></div>`;
    section.querySelector('#backup-cancel').addEventListener('click', () => {
      if (busy) return;
      services.backupImport.discardPreview(); preview = null; previewRoot.innerHTML = ''; fileInput.value = ''; status.textContent = '복원을 취소했습니다.';
    });
    section.querySelector('#backup-confirm').addEventListener('click', async () => {
      if (busy || !preview?.pristine) return;
      setBusy(true); status.textContent = '복원 중입니다. 완료될 때까지 앱을 닫지 마세요.';
      try {
        await services.backupImport.restorePreview(preview.id);
        preview = null; previewRoot.innerHTML = '';
        status.textContent = '복원이 완료되었습니다. 앱을 다시 불러옵니다.';
        setBusy(false); reload();
      } catch (error) {
        errorMessage(error);
        if (error.code === 'RESTORE_VERIFY_FAILED') {
          preview = null; previewRoot.innerHTML = '<button id="backup-reload" class="button full-width-button" type="button">앱 다시 열기</button>';
          section.querySelector('#backup-reload').addEventListener('click', reload);
        } else if (error.code === 'RESTORE_TARGET_NOT_PRISTINE') { preview.pristine = false; renderPreview(); }
      } finally { if (isCurrent()) setBusy(false); }
    });
  }
  section.querySelector('#backup-export').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true); status.textContent = '백업 생성 및 검증 중입니다…';
    try {
      const result = await services.backupExport.exportCurrentProfile();
      if (!isCurrent()) return;
      const url = URL.createObjectURL(new Blob([result.content], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = result.filename;
      section.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      const counts = result.document.counts;
      status.textContent = `백업을 생성했습니다. 운동 기록 ${counts.exercise_logs}건 · 운동 종류 ${counts.exercise_types}건 · 양식 ${counts.exercise_templates}건. 다운로드한 파일이 보관되었는지 확인해 주세요.`;
      showToast('백업을 생성했습니다.');
    } catch (error) { if (isCurrent()) errorMessage(error); }
    finally { if (isCurrent()) setBusy(false); }
  });
  section.querySelector('#backup-select').addEventListener('click', () => { if (!busy) { fileInput.value = ''; fileInput.click(); } });
  fileInput.addEventListener('change', async () => {
    if (busy || !fileInput.files?.[0]) return;
    preview = null; previewRoot.innerHTML = ''; setBusy(true); status.textContent = '백업 파일을 검증하고 있습니다…';
    try {
      const result = await services.backupImport.inspectFile(fileInput.files[0]);
      if (!isCurrent()) { services.backupImport.discardPreview(); return; }
      preview = result; renderPreview(); status.textContent = '파일 검증을 완료했습니다. 아래 내용을 확인해 주세요.';
    } catch (error) { if (isCurrent()) errorMessage(error); }
    finally { if (isCurrent()) setBusy(false); }
  });
}
