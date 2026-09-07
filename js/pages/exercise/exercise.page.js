import { formatLocalDateTime } from '../../core/datetime.js';
import { escapeHtml } from './exercise-view.js';

export async function renderExerciseMain(context) {
  const { root, services, navigate, setTitle, isCurrent } = context;
  setTitle('운동');
  root.innerHTML = '<section class="card empty-state" aria-busy="true"><div><strong>운동 기록을 불러오는 중</strong></div></section>';
  const [types, summary, recent, timezone] = await Promise.all([
    services.exerciseQuery.listActiveTypes(),
    services.exerciseQuery.getWeeklySummary(),
    services.exerciseQuery.listRecentLogs({ limit: 20 }),
    services.exerciseQuery.getTimezone()
  ]);
  if (!isCurrent()) return;
  let selectedTypeId = null;

  const draw = async () => {
    const [filteredSummary, filteredLogs] = await Promise.all([
      services.exerciseQuery.getWeeklySummary({ exerciseTypeId: selectedTypeId }),
      services.exerciseQuery.listRecentLogs({ exerciseTypeId: selectedTypeId, limit: 20 })
    ]);
    if (!isCurrent()) return;
    const filterButtons = types.length > 0 ? `
      <button class="filter-chip ${selectedTypeId === null ? 'active' : ''}" data-filter="">전체</button>
      ${types.map((type) => `<button class="filter-chip ${selectedTypeId === type.id ? 'active' : ''}" data-filter="${type.id}">${escapeHtml(type.icon ?? '●')} ${escapeHtml(type.name)}</button>`).join('')}
    ` : '';
    root.innerHTML = `
      <section class="card exercise-hero">
        <div class="section-heading"><div><h2>이번 주</h2><p>${selectedTypeId ? '선택한 운동' : '전체 운동'} 기준</p></div><button id="exercise-manage" class="button button-secondary compact-button" type="button">운동 관리</button></div>
        <div class="metric-row"><div><strong>${filteredSummary.count}</strong><span>회</span></div><div><strong>${filteredSummary.durationMinutes}</strong><span>분</span></div></div>
      </section>
      <section class="card"><button class="button button-secondary" id="exercise-trash">삭제 기록</button> <button class="button" id="exercise-passes">이용권 관리</button> <button class="button button-secondary" id="exercise-schedules">예약 · 캘린더</button></section>
      <section class="filter-strip">${filterButtons}<button id="exercise-type-add" class="filter-chip add-chip" type="button">+ 운동 추가</button></section>
      <section class="card">
        <div class="section-heading"><h2>최근 기록</h2><button id="exercise-log-add" class="button compact-button" type="button" ${types.length === 0 ? 'disabled' : ''}>+ 운동 기록</button></div>
        <div class="record-list">
          ${filteredLogs.length === 0 ? '<p class="inline-empty">아직 운동 기록이 없습니다.</p>' : filteredLogs.map(({ log, exerciseType }) => `
            <button class="record-item" data-log-id="${log.id}" type="button">
              <span class="record-icon">${escapeHtml(exerciseType?.icon ?? '●')}</span>
              <span class="record-main"><strong>${escapeHtml(exerciseType?.name ?? '삭제된 운동')}</strong><small>${escapeHtml(formatLocalDateTime(log.performed_at, timezone))}</small>${log.memo ? `<small class="record-memo">${escapeHtml(log.memo)}</small>` : ''}</span>
              <span class="record-value">${log.values?.duration_minutes ? `${escapeHtml(log.values.duration_minutes)}분` : '›'}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
    root.querySelector('#exercise-trash').addEventListener('click', async () => { const rows = await services.exerciseQuery.listRecentLogs({ includeDeleted: true, limit: Number.MAX_SAFE_INTEGER }); if (!isCurrent()) return; root.innerHTML = '<section class="card"><h2>삭제 기록</h2>' + rows.filter(({ log }) => log.deleted_at !== null).map(({ log, exerciseType }) => `<p><button class="button" data-deleted-log="${log.id}">${escapeHtml(exerciseType?.name)} · ${escapeHtml(formatLocalDateTime(log.performed_at, timezone))}</button></p>`).join('') + '</section>'; root.querySelectorAll('[data-deleted-log]').forEach((b) => b.addEventListener('click', () => navigate(`/exercise/log/${b.dataset.deletedLog}`))); });
    root.querySelector('#exercise-passes').addEventListener('click', () => navigate('/exercise/passes'));
    root.querySelector('#exercise-schedules').addEventListener('click', () => navigate('/calendar'));
    root.querySelector('#exercise-manage')?.addEventListener('click', () => navigate('/exercise/manage'));
    root.querySelector('#exercise-type-add')?.addEventListener('click', () => navigate('/exercise/type/new'));
    root.querySelector('#exercise-log-add')?.addEventListener('click', () => navigate('/exercise/log/new'));
    root.querySelectorAll('[data-log-id]').forEach((node) => node.addEventListener('click', () => navigate(`/exercise/log/${node.dataset.logId}`)));
    root.querySelectorAll('[data-filter]').forEach((node) => node.addEventListener('click', () => {
      selectedTypeId = node.dataset.filter || null;
      void draw();
    }));
  };
  await draw();
}
