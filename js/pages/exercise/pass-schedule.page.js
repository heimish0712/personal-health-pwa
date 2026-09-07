import { initialRecordTime } from '../../router.js';
import { dateKey } from '../../core/pass-rules.js';
import { escapeHtml as e, renderDynamicFields, readDynamicValues, bindDirtyInputs } from './exercise-view.js';
import { nowLocalInput, utcIsoToLocalInput, formatLocalDateTime } from '../../core/datetime.js';
import { DirtyFormGuard } from '../../components/dirty-form-guard.js';
import { setNavigationGuard, clearNavigationGuard } from '../../router.js';

export async function passOptions(services, typeId, selected = null, { performedAtLocal, selectFirst = false } = {}) {
  const passes = performedAtLocal ? await services.activity.availablePasses(typeId, performedAtLocal) : await services.activity.passes(typeId);
  if (selectFirst) selected = passes[0]?.id ?? null;
  return '<option value="">차감 없음</option>' + passes.filter((p) => p.status === 'active' || p.id === selected).map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${e(p.name)} · 잔여 ${p.remaining}회 · ${e(p.start_date)} ~ ${e(p.expiry_date)}${p.status === 'inactive' ? ' · 비활성' : ''}</option>`).join('');
}
function guardForm(root) {
  const guard = new DirtyFormGuard(); bindDirtyInputs(root, () => guard.markDirty());
  setNavigationGuard(({ unloading }) => unloading ? !guard.isDirty() : guard.canLeave()); return guard;
}
function action(context, selector, work) {
  context.root.querySelectorAll(selector).forEach((button) => button.addEventListener('click', async () => {
    if (button.disabled) return; button.disabled = true;
    try { await work(button); } catch (error) { context.showError('작업에 실패했습니다.', error); }
    finally { button.disabled = false; }
  }));
}
async function scheduleNotice(services) {
  try {
    const state = await services.googleCalendar?.status();
    if (state?.enabled && state.pending) return '예약은 저장됐지만 Google Calendar 반영은 대기 중입니다. 설정에서 재인증·재시도할 수 있습니다.';
  } catch { return '예약은 저장됐습니다. Google Calendar 상태는 설정에서 확인하세요.'; }
  return '저장했습니다.';
}
function submit(context, selector, work) {
  const form = context.root.querySelector(selector), guard = guardForm(form); let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy) return; busy = true;
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { await work(); guard.markClean(); clearNavigationGuard(); context.showToast(selector === '#schedule-form' ? await scheduleNotice(context.services) : '저장했습니다.'); context.navigate(context.returnRoute ?? (selector === '#pass-form' ? '/exercise/passes' : '/calendar')); }
    catch (error) { context.showError('저장에 실패했습니다.', error); }
    finally { busy = false; button.disabled = false; }
  });
}
const buttons = '<div class="form-actions"><button type="button" class="button button-secondary" data-back>취소</button><button type="submit" class="button">저장</button></div>';

export async function renderPasses(context) {
  const { root, services, isCurrent, setTitle } = context; setTitle('이용권 관리');
  const types = await services.exerciseQuery.listAllTypes({ includeDeleted: true });
  const groups = await Promise.all(types.map(async (type) => ({ type, passes: await services.activity.passes(type.id) })));
  if (!isCurrent()) return;
  root.innerHTML = `<section class="card"><h2>이용권</h2><p>잔여횟수는 유효 사용내역으로 계산합니다. 예약만으로는 차감되지 않습니다.</p><button class="button" id="new-pass">+ 이용권</button></section>` + groups.map(({ type, passes }) => passes.map((p) => `<section class="card"><h2>${e(p.name)}</h2><p>${e(type.name)} · ${p.status === 'active' ? '활성' : '비활성'} · <strong>잔여 ${p.remaining} / ${p.total_count}회</strong></p><p>${e(p.start_date)} ~ ${e(p.expiry_date)}</p><p>${e(p.memo)}</p><button class="button" data-edit-pass="${p.id}">수정</button> <button class="button button-secondary" data-toggle-pass="${p.id}" data-status="${p.status}" data-revision="${p.revision}">${p.status === 'active' ? '비활성화' : '활성화'}</button><details><summary>사용내역 (${p.history.length}건)</summary>${p.history.map((u) => `<p>${u.status === 'used' ? '사용' : '취소'} · ${u.used_count}회 <button class="button button-secondary" data-history-log="${u.exercise_log_id}">운동기록</button></p>`).join('')}</details></section>`).join('')).join('');
  action(context, '#new-pass', () => context.navigate('/exercise/pass/new'));
  action(context, '[data-edit-pass]', (b) => context.navigate(`/exercise/pass/${b.dataset.editPass}/edit`));
  action(context, '[data-history-log]', (b) => context.navigate(`/exercise/log/${b.dataset.historyLog}`));
  action(context, '[data-toggle-pass]', async (b) => {
    await services.activity.setPassStatus(b.dataset.togglePass, b.dataset.status === 'active' ? 'inactive' : 'active', Number(b.dataset.revision)); await renderPasses(context);
  });
}
export async function renderPassForm(context, id) {
  const { root, services, isCurrent, setTitle } = context; setTitle(id ? '이용권 수정' : '이용권 추가');
  const types = await services.exerciseQuery.listAllTypes({ includeDeleted: Boolean(id) });
  let pass;
  if (id) { const all = (await Promise.all(types.map((t) => services.activity.passes(t.id)))).flat(); pass = all.find((p) => p.id === id); if (!pass) throw new Error('이용권을 찾을 수 없습니다.'); }
  const today = nowLocalInput(await services.exerciseQuery.getTimezone()).slice(0, 10);
  if (!isCurrent()) return;
  root.innerHTML = `<form id="pass-form" class="form-stack"><section class="card">
    <div class="form-field"><label for="pass-type">운동</label><select id="pass-type" ${id ? 'disabled' : ''}>${types.filter((t) => t.id === pass?.exercise_type_id || (t.status === 'active' && t.deleted_at === null)).map((t) => `<option value="${t.id}" ${t.id === pass?.exercise_type_id ? 'selected' : ''}>${e(t.name)}</option>`).join('')}</select></div>
    <div class="form-field"><label for="pass-name">이용권 이름</label><input id="pass-name" maxlength="100" required value="${e(pass?.name ?? '')}"></div>
    <div class="form-field"><label for="pass-count">총 횟수</label><input id="pass-count" type="number" min="1" step="1" required value="${pass?.total_count ?? 60}"></div>
    <div class="form-field"><label for="pass-start">시작일</label><input id="pass-start" type="date" required value="${e(pass?.start_date ?? today)}"></div>
    <div class="form-field"><label for="pass-expiry">종료일</label><input id="pass-expiry" type="date" required value="${e(pass?.expiry_date ?? today)}"></div>
    <div class="form-field"><label for="pass-status">상태</label><select id="pass-status"><option value="active">활성</option><option value="inactive" ${pass?.status === 'inactive' ? 'selected' : ''}>비활성</option></select></div>
    <div class="form-field"><label for="pass-memo">메모</label><textarea id="pass-memo" maxlength="2000">${e(pass?.memo ?? '')}</textarea></div>
  </section>${buttons}</form>`;
  action(context, '[data-back]', () => context.navigate('/exercise/passes'));
  const value = (key) => root.querySelector(`#pass-${key}`).value;
  submit(context, '#pass-form', () => services.activity.savePass({ exercise_type_id: value('type'), name: value('name'), total_count: value('count'), start_date: value('start'), expiry_date: value('expiry'), status: value('status'), memo: value('memo') }, id, pass?.revision));
}

export async function renderCalendar(context) {
  const { root, services, isCurrent, setTitle } = context; setTitle('통합 캘린더');
  const timezone = await services.calendar.timezone();
  const today = nowLocalInput(timezone).slice(0, 10);
  if (!isCurrent()) return;
  let selected = context.selectedDate ?? today, month = selected.slice(0, 7), sequence = 0, entries = [];
  root.innerHTML = `<section class="card"><div class="section-heading"><h2>날짜별 기록</h2><button class="button" id="new-schedule">+ 예약</button></div><div class="calendar-toolbar"><button class="button button-secondary" id="calendar-prev" aria-label="이전 달">‹</button><h3 id="calendar-month" aria-live="polite"></h3><button class="button button-secondary" id="calendar-next" aria-label="다음 달">›</button></div><button class="text-button" id="calendar-today">오늘</button><div class="calendar-grid" id="calendar-grid" aria-label="월간 달력"></div><p class="section-description">밑줄: 오늘 · 채움: 선택 날짜 · 운: 운동/예약 · 식: 식단 · 체: 체중 · 인: 인바디</p></section><section class="card"><h2>선택 날짜에 기록</h2><div class="quick-records"><button class="button button-secondary" data-quick="/exercise/log/new">운동</button><button class="button button-secondary" data-quick="/diet/log/new">식단</button><button class="button button-secondary" data-quick="/weight/log/new">체중</button><button class="button button-secondary" data-quick="/weight/inbody/new">인바디</button></div></section><h2 id="calendar-selected"></h2><div id="calendar-results" aria-live="polite"></div>`;
  const quick = (path) => context.navigate(`${path}?date=${selected}&from=calendar`);
  action(context, '#new-schedule', () => quick('/exercise/schedule/new'));
  action(context, '[data-quick]', (b) => quick(b.dataset.quick));
  const renderSelection = () => {
    if (location.hash.startsWith('#/calendar')) history.replaceState(null, '', `#/calendar?date=${selected}`);
    root.querySelector('#calendar-selected').textContent = `${selected} 일정`;
    root.querySelectorAll('[data-calendar-date]').forEach((b) => { b.classList.toggle('selected', b.dataset.calendarDate === selected); b.setAttribute('aria-pressed', String(b.dataset.calendarDate === selected)); });
    const rows = entries.filter((r) => dateKey(r.at, timezone) === selected);
    root.querySelector('#calendar-results').innerHTML = rows.length ? rows.map((r) => `<section class="card" data-calendar-entry="${r.id}"><h3>${e(r.title)}</h3><p>${e(formatLocalDateTime(r.at, timezone))}</p><p>${e(r.memo)}</p>${r.healthRoute ? `<p>${e(r.healthValue)}</p><button class="button" data-health-route="${r.healthRoute}">${r.healthRoute.startsWith('/diet/') ? '식단 열기' : '측정 기록 열기'}</button>` : ''}${r.schedule ? `<button class="button" data-schedule="${r.schedule.id}">예약 열기</button>` : ''} ${r.log ? `<button class="button button-secondary" data-log="${r.log.id}">기록 열기</button>` : ''}</section>`).join('') : '<section class="card">이 날짜의 기록이 없습니다.</section>';
    action(context, '[data-health-route]', (b) => context.navigate(b.dataset.healthRoute));
    action(context, '[data-schedule]', (b) => context.navigate(`/exercise/schedule/${b.dataset.schedule}/edit`));
    action(context, '[data-log]', (b) => context.navigate(`/exercise/log/${b.dataset.log}`));
  };
  const draw = async () => {
    const token = ++sequence, requestedMonth = month;
    const [year, m] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
    root.querySelector('#calendar-results').textContent = '일정을 불러오는 중…';
    const rows = await services.calendar.entries(`${month}-01T00:00`, `${next}T00:00`);
    if (!isCurrent() || token !== sequence) return;
    entries = rows;
    root.querySelector('#calendar-month').textContent = `${year}년 ${m}월`;
    const offset = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const marked = new Map();
    for (const row of entries) { const day = dateKey(row.at, timezone); if (!marked.has(day)) marked.set(day, new Set()); row.categories.forEach((kind) => marked.get(day).add(kind)); }
    root.querySelector('#calendar-grid').innerHTML = ['일','월','화','수','목','금','토'].map((d) => `<span class="calendar-weekday">${d}</span>`).join('') + '<span></span>'.repeat(offset) + Array.from({ length: days }, (_, i) => {
      const day = `${requestedMonth}-${String(i + 1).padStart(2, '0')}`;
      return `<button class="calendar-day ${day === today ? 'today' : ''}" data-calendar-date="${day}" ${day === today ? 'aria-current="date"' : ''} aria-label="${day}${day === today ? ' 오늘' : ''}${marked.has(day) ? ' 일정 있음' : ''}">${i + 1}<span class="calendar-dot">${['exercise','diet','weight','inbody'].filter((kind) => marked.get(day)?.has(kind)).map((kind) => `<span class="calendar-indicator ${kind}" title="${({exercise:'운동/예약',diet:'식단',weight:'체중',inbody:'인바디'})[kind]}">${({exercise:'운',diet:'식',weight:'체',inbody:'인'})[kind]}</span>`).join('')}</span></button>`;
    }).join('');
    action(context, '[data-calendar-date]', (b) => { selected = b.dataset.calendarDate; renderSelection(); }); renderSelection();
  };
  const move = async (delta) => { const [y, m] = month.split('-').map(Number); month = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7); selected = month === today.slice(0, 7) ? today : `${month}-01`; await draw(); };
  action(context, '#calendar-prev', () => move(-1)); action(context, '#calendar-next', () => move(1));
  action(context, '#calendar-today', async () => { selected = today; month = today.slice(0, 7); await draw(); }); await draw();
}
export async function renderScheduleForm(context, id, complete = false) {
  const { root, services, isCurrent, setTitle } = context;
  setTitle(complete ? '예약 완료' : id ? '예약 수정' : '예약 추가');
  const [types, timezone, schedule] = await Promise.all([services.exerciseQuery.listAllTypes({ includeDeleted: Boolean(id) }), services.exerciseQuery.getTimezone(), id ? services.activity.schedule(id) : null]);
  const template = complete ? await services.activity.completionTemplate(schedule) : null;
  const options = complete ? await passOptions(services, schedule.exercise_type_id, null, { performedAtLocal: utcIsoToLocalInput(schedule.scheduled_at, timezone), selectFirst: true }) : '';
  if (!isCurrent()) return;
  if (schedule?.status === 'completed') {
    root.innerHTML = `<section class="card"><h2>완료된 예약</h2><p>완료 취소하면 연결 운동기록을 삭제하고 이용권 차감을 되돌립니다.</p><button class="button" id="completed-log">운동기록 보기</button> <button class="button button-danger" id="undo-schedule">완료 취소</button></section>`;
    action(context, '#completed-log', () => context.navigate(`/exercise/log/${schedule.completed_exercise_log_id}`));
    action(context, '#undo-schedule', async () => { if (!window.confirm('완료를 취소하고 차감을 복원할까요?')) return; await services.activity.undoSchedule(id, schedule.revision); context.navigate(context.returnRoute ?? '/calendar'); }); return;
  }
  root.innerHTML = `<form id="schedule-form" class="form-stack"><section class="card">
    <div class="form-field"><label for="schedule-type">운동</label><select id="schedule-type" ${complete || schedule?.completed_exercise_log_id ? 'disabled' : ''}>${types.filter((t) => t.id === schedule?.exercise_type_id || (t.status === 'active' && t.deleted_at === null)).map((t) => `<option value="${t.id}" ${t.id === schedule?.exercise_type_id ? 'selected' : ''}>${e(t.name)}</option>`).join('')}</select></div>
    <div class="form-field"><label for="schedule-at">${complete ? '실제 운동일/시간' : '예정 날짜/시간'}</label><input id="schedule-at" type="datetime-local" required value="${schedule ? utcIsoToLocalInput(schedule.scheduled_at, timezone) : initialRecordTime(context, nowLocalInput(timezone))}"></div>
    ${complete ? `<div id="dynamic-fields">${renderDynamicFields(template.fields, { duration_minutes: schedule.expected_duration_minutes })}</div><div class="form-field"><label for="exercise-pass">차감 이용권</label><select id="exercise-pass">${options}</select></div>` : `<div class="form-field"><label for="schedule-duration">예정 시간 (분)</label><input id="schedule-duration" type="number" min="1" max="1440" required value="${schedule?.expected_duration_minutes ?? 50}"></div><div class="form-field"><label for="schedule-status">상태</label><select id="schedule-status"><option value="scheduled">예정</option><option value="cancelled" ${schedule?.status === 'cancelled' ? 'selected' : ''}>취소</option></select></div>`}
    <div class="form-field"><label for="schedule-memo">메모</label><textarea id="schedule-memo" maxlength="2000">${e(schedule?.memo ?? '')}</textarea></div>
    <p>${complete ? '저장 시 운동기록을 생성하고 선택한 이용권을 1회 차감합니다.' : '예약 저장·수정·취소는 이용권을 차감하지 않습니다.'}</p></section>${buttons}</form>
    ${id && !complete ? `<div class="form-actions"><button class="button button-danger" id="cancel-schedule">예약 취소</button><button class="button" id="complete-schedule" ${schedule.status !== 'scheduled' ? 'disabled' : ''}>예약 완료</button></div>` : ''}`;
  action(context, '[data-back]', () => context.navigate(context.returnRoute ?? '/calendar'));
  action(context, '#complete-schedule', () => context.navigate(`/exercise/schedule/${id}/complete`));
  action(context, '#cancel-schedule', async () => { if (!window.confirm('저장된 예약을 취소할까요?')) return; await services.activity.cancelSchedule(id, schedule.revision); context.showToast(await scheduleNotice(services)); clearNavigationGuard(); context.navigate(context.returnRoute ?? '/calendar'); });
  const value = (key) => root.querySelector(`#schedule-${key}`).value;
  submit(context, '#schedule-form', () => complete
    ? services.activity.completeSchedule(id, { performed_at_local: value('at'), values: readDynamicValues(root, template.fields), pass_id: root.querySelector('#exercise-pass').value || null, memo: value('memo') }, schedule.revision)
    : services.activity.saveSchedule({ exercise_type_id: value('type'), scheduled_at_local: value('at'), expected_duration_minutes: value('duration'), status: value('status'), memo: value('memo') }, id, schedule?.revision));
}
