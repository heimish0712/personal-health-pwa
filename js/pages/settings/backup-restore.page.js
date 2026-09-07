import { setNavigationGuard } from '../../router.js';

const labels = {
  profiles: 'Profile', exercise_types: '운동 종류', exercise_templates: '운동 양식', exercise_logs: '운동 기록',
  exercise_schedules: '예약', passes: '이용권', pass_usage_logs: '이용 내역', diet_logs: '식단',
  calendar_event_links: 'Google 일정 연결',
  diet_photos: '사진', weight_logs: '체중', inbody_logs: '인바디', user_settings: '사용자 설정'
};
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export function mountBackupSettings(root, { services, showToast, isCurrent, reload = () => window.location.reload() }) {
  const section = document.createElement('section');
  section.className = 'card';
  section.id = 'backup-settings';
  section.innerHTML = `<h2>데이터 백업</h2>
    <p>현재 Profile의 사진이 있으면 ZIP v2, 사진이 없으면 JSON v1으로 보관합니다. 기존 JSON v1과 사진 포함 ZIP v2를 복원할 수 있습니다. 백업 파일은 암호화되지 않습니다.</p>
    <div class="form-actions backup-actions"><button id="backup-export" class="button" type="button">백업 내보내기</button><button id="backup-select" class="button button-secondary" type="button">백업 복원</button></div>
    <input id="backup-file" type="file" accept=".json,.zip,application/json,application/zip" hidden aria-label="백업 JSON 또는 ZIP 파일 선택">
    <p id="backup-status" class="section-description" role="status" aria-live="polite"></p>
    <div id="backup-preview"></div><hr><h3>데이터 초기화</h3><p>모든 Profile의 기록을 지우고 기본 Profile과 운동으로 돌아갑니다. 기기 정보는 유지합니다.</p><button id="data-reset" class="button button-danger" type="button">전체 데이터 초기화</button><div id="data-operation"></div>`;
  root.append(section);
  const status = section.querySelector('#backup-status');
  const previewRoot = section.querySelector('#backup-preview');
  const fileInput = section.querySelector('#backup-file');
  let busy = false;
  let preview = null;
  let pending = null;
  const operationRoot = section.querySelector('#data-operation');
  services.backupImport.discardPreview();
  setNavigationGuard(() => !busy && !pending);
  function setBusy(value) {
    busy = value;
    section.setAttribute('aria-busy', String(value));
    section.querySelectorAll('button, input').forEach((node) => { node.disabled = value || Boolean(pending && !node.closest('#data-operation'));  });
    const restore = section.querySelector('#backup-confirm');
    if (restore) restore.disabled = value || Boolean(pending) || !preview?.pristine;
  }
  function errorMessage(error) {
    const message = typeof error?.code === 'string' && /^(BACKUP_|RESTORE_|RESET_)/.test(error.code)
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
        : '현재 데이터가 있어 일반 복원은 차단됩니다. 강제 복원은 모든 Profile의 현재 기록을 백업 내용으로 완전히 교체합니다. 병합하지 않습니다.'}</p>
      <div class="form-actions backup-actions"><button id="backup-cancel" class="button button-secondary" type="button">취소</button><button id="backup-confirm" class="button" type="button" ${preview.pristine ? '' : 'disabled'}>복원</button></div>${!preview.pristine ? '<button id="backup-force" class="button button-danger full-width-button" type="button">강제 복원</button>' : ''}</div>`;
    section.querySelector('#backup-force')?.addEventListener('click', () => startReplacement('replace'));
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
  function download(result) {
    const url = URL.createObjectURL(result.blob ?? new Blob([result.content], { type: 'application/json;charset=utf-8' }));
    try {
      const link = document.createElement('a'); link.href = url; link.download = result.filename;
      section.append(link); link.click(); link.remove();
    } finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
  }
  function cancelReplacement() {
    if (busy) return;
    services.backupImport.cancelReplacement(); pending = null; operationRoot.innerHTML = ''; setBusy(false);
    status.textContent = '취소했습니다. 현재 데이터는 변경되지 않았습니다.';
  }
  async function executeReplacement(file = null) {
    setBusy(true);
    try {
      await services.backupImport.confirmReplacement(pending.id, file);
      pending = null; preview = null; operationRoot.innerHTML = ''; previewRoot.innerHTML = '';
      status.textContent = '완료되었습니다. 앱을 다시 불러옵니다.'; setBusy(false); reload();
    } catch (error) {
      errorMessage(error);
      if (error.code === 'RESTORE_VERIFY_FAILED') {
        pending = null; preview = null; previewRoot.innerHTML = '';
        operationRoot.innerHTML = '<button id="data-reload" class="button" type="button">앱 다시 열기</button>';
        section.querySelector('#data-reload').addEventListener('click', reload);
      }
    } finally { if (isCurrent()) setBusy(false); }
  }
  function startReplacement(kind) {
    if (busy || pending) return;
    pending = { kind };
    operationRoot.innerHTML = `<div class="form-section" role="region" aria-label="데이터 교체 확인"><h3>${kind === 'reset' ? '초기화 전에 현재 데이터를 백업하시겠습니까?' : '현재 기록이 모두 백업 파일의 내용으로 교체됩니다.'}</h3><p>모든 Profile의 기록·사진·이용권·예약·삭제 이력을 ${kind === 'reset' ? '삭제하고 기본 상태로 초기화합니다.' : '교체합니다. 병합하지 않습니다.'}</p><div class="form-stack"><button id="data-backup-first" class="button" type="button">${kind === 'reset' ? '예 · 백업 후 초기화' : '현재 데이터를 먼저 백업하고 강제 복원'}</button><button id="data-without-backup" class="button button-danger" type="button">${kind === 'reset' ? '아니오 · 백업 없이 초기화' : '백업 없이 강제 복원'}</button><button id="data-cancel" class="button button-secondary" type="button">취소</button></div></div>`;
    section.querySelector('#data-cancel').addEventListener('click', cancelReplacement);
    const prepare = async (backupFirst) => {
      if (busy) return;
      if (!backupFirst && !window.confirm(kind === 'reset' ? '백업 없이 모든 기록을 초기화합니다. 계속하시겠습니까?' : '현재 기록이 모두 백업 파일의 내용으로 교체됩니다. 백업 없이 계속하시겠습니까?')) return;
      setBusy(true);
      try {
        const prepared = await services.backupImport.prepareReplacement({ kind, previewId: preview?.id, backupFirst });
        pending = prepared;
        if (!backupFirst) { await executeReplacement(); return; }
        download(prepared.backup);
        status.textContent = '백업을 생성했습니다. 다운로드한 파일을 보관한 뒤 아래에서 다시 선택하세요. 파일 확인 전에는 데이터를 변경하지 않습니다.';
        operationRoot.innerHTML = '<div class="form-section"><h3>다운로드한 백업 확인</h3><p>방금 내려받은 JSON 또는 ZIP을 선택하면 무결성과 현재 데이터 일치를 검증한 후 요청한 초기화/강제 복원을 실행합니다.</p><label for="replacement-file">저장된 백업 파일 확인 후 실행</label><input id="replacement-file" type="file" accept=".json,.zip,application/json,application/zip"><button id="data-cancel" class="button button-secondary" type="button">취소</button></div>';
        section.querySelector('#data-cancel').addEventListener('click', cancelReplacement);
        section.querySelector('#replacement-file').addEventListener('change', async (event) => { if (!busy && event.target.files?.[0]) await executeReplacement(event.target.files[0]); });
      } catch (error) { errorMessage(error); }
      finally { if (isCurrent()) setBusy(false); }
    };
    section.querySelector('#data-backup-first').addEventListener('click', () => prepare(true));
    section.querySelector('#data-without-backup').addEventListener('click', () => prepare(false));
    setBusy(false); operationRoot.scrollIntoView({ block: 'nearest' });
  }
  section.querySelector('#data-reset').addEventListener('click', () => startReplacement('reset'));
  section.querySelector('#backup-export').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true); status.textContent = '백업 생성 및 검증 중입니다…';
    try {
      const result = await services.backupExport.exportCurrentProfile();
      if (!isCurrent()) return;
      download(result);
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
