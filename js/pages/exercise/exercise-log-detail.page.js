import { formatLocalDateTime } from '../../core/datetime.js';
import { escapeHtml } from './exercise-view.js';

function displayValue(field, value) {
  if (value === undefined || value === null || value === '') return '-';
  if (field.type === 'boolean') return value ? '예' : '아니오';
  return `${value}${field.unit ? ` ${field.unit}` : ''}`;
}

export async function renderExerciseLogDetail(context, id) {
  const { root, services, navigate, setTitle, showToast, showError, isCurrent } = context;
  setTitle('운동 기록');
  const [detail, timezone] = await Promise.all([services.exerciseLog.getDetail(id), services.exerciseQuery.getTimezone()]);
  if (!isCurrent()) return;
  const { log, exerciseType, template } = detail;
  root.innerHTML = `
    <section class="card">
      <div class="detail-title"><span class="detail-icon">${escapeHtml(exerciseType.icon ?? '●')}</span><div><h2>${escapeHtml(exerciseType.name)}</h2><p>${escapeHtml(formatLocalDateTime(log.performed_at, timezone))} · 양식 v${template.version}</p></div></div>
      <dl class="detail-list">${[...template.fields].sort((a,b) => a.sort_order - b.sort_order).map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(displayValue(field, log.values?.[field.key]))}</dd></div>`).join('')}</dl>
      <div class="memo-box"><strong>메모</strong><p>${log.memo ? escapeHtml(log.memo) : '메모 없음'}</p></div>
    </section>
    <div class="form-actions"><button id="delete-log" class="button button-danger" type="button">삭제</button><button id="edit-log" class="button" type="button">수정</button></div>
    <button id="back-exercise" class="button button-secondary full-width-button" type="button">운동으로 돌아가기</button>
  `;
  root.querySelector('#edit-log')?.addEventListener('click', () => navigate(`/exercise/log/${id}/edit`));
  root.querySelector('#back-exercise')?.addEventListener('click', () => navigate('/exercise'));
  root.querySelector('#delete-log')?.addEventListener('click', async () => {
    if (!window.confirm('이 운동 기록을 삭제하시겠습니까?')) return;
    try {
      await services.exerciseLog.softDelete(id, log.revision);
      showToast('운동 기록을 삭제했습니다.'); navigate('/exercise');
    } catch (error) { showError('운동 기록 삭제에 실패했습니다.', error); }
  });
}
