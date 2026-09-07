import { escapeHtml as e, renderDynamicFields, readDynamicValues, bindDirtyInputs } from './exercise-view.js';
import { nowLocalInput, utcIsoToLocalInput, formatLocalDateTime } from '../../core/datetime.js';
import { DirtyFormGuard } from '../../components/dirty-form-guard.js';
import { setNavigationGuard, clearNavigationGuard } from '../../router.js';

export async function passOptions(services, typeId, selected = null) {
  const passes = await services.activity.passes(typeId);
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
function submit(context, selector, work) {
  const form = context.root.querySelector(selector), guard = guardForm(form); let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy) return; busy = true;
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { await work(); guard.markClean(); clearNavigationGuard(); context.showToast('저장했습니다.'); context.navigate(selector === '#pass-form' ? '/exercise/passes' : '/calendar'); }
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
  root.innerHTML = `<section class="card"><h2>이용권</h2><p>잔여횟수는 유효 사용내역으로 계산합니다. 예약만으로는 차감되지 않습니다.</p><button class="button" id="new-pass">+ 이용권</button></section>` + groups.map(({ type, passes }) => passes.map((p) => `<section class="card"><h2>${e(p.name)}</h2><p>${e(type.name)} · ${p.status === 'active' ? '활성' : '비활성'} · <strong>잔여 ${p.remaining} / ${p.total_count}회</strong></p><p>${e(p.start_date)} ~ ${e(p.expiry_date)}</p><p>${e(p.memo)}</p><button class="button" data-edit-pass="${p.id}">수정</button> <button class="button button-secondary" data-delete-pass="${p.id}" data-revision="${p.revision}">${p.history.length ? '비활성화' : '삭제'}</button><details><summary>사용내역 (${p.history.length}건)</summary>${p.history.map((u) => `<p>${u.status === 'used' ? '사용' : '취소'} · ${u.used_count}회 <button class="button button-secondary" data-history-log="${u.exercise_log_id}">운동기록</button></p>`).join('')}</details></section>`).join('')).join('');
  action(context, '#new-pass', () => context.navigate('/exercise/pass/new'));
  action(context, '[data-edit-pass]', (b) => context.navigate(`/exercise/pass/${b.dataset.editPass}/edit`));
  action(context, '[data-history-log]', (b) => context.navigate(`/exercise/log/${b.dataset.historyLog}`));
  action(context, '[data-delete-pass]', async (b) => {
    if (!window.confirm('이용권을 삭제하거나 사용이력이 있으면 비활성화합니다. 계속할까요?')) return;
    await services.activity.deletePass(b.dataset.deletePass, Number(b.dataset.revision)); await renderPasses(context);
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
  const { root, services, isCurrent, setTitle } = context; setTitle('예약 · 캘린더');
  const timezone = await services.exerciseQuery.getTimezone(); const today = nowLocalInput(timezone).slice(0, 10);
  if (!isCurrent()) return;
  root.innerHTML = `<section class="card"><h2>예약 · 운동기록</h2><button class="button" id="new-schedule">+ 예약</button><div class="form-field"><label for="calendar-start">조회 시작일</label><input type="date" id="calendar-start" value="${today.slice(0, 7)}-01"></div><div class="form-field"><label for="calendar-end">조회 종료일 (포함)</label><input type="date" id="calendar-end" value="${today.slice(0, 7)}-${new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()}"></div><button class="button button-secondary" id="calendar-search">조회</button></section><div id="calendar-results"></div>`;
  action(context, '#new-schedule', () => context.navigate('/exercise/schedule/new'));
  let sequence = 0;
  const draw = async () => {
    const token = ++sequence;
    const start = root.querySelector('#calendar-start').value, end = root.querySelector('#calendar-end').value;
    const next = new Date(`${end}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    const [data, types] = await Promise.all([services.activity.calendar(`${start}T00:00`, `${next.toISOString().slice(0, 10)}T00:00`), services.exerciseQuery.listAllTypes({ includeDeleted: true })]);
    if (!isCurrent() || token !== sequence) return;
    const names = new Map(types.map((t) => [t.id, t.name]));
    const entries = [...data.schedules.map((s) => ({ row: s, at: s.scheduled_at, schedule: true })), ...data.logs.map((l) => ({ row: l, at: l.performed_at, schedule: false }))].sort((a, b) => a.at.localeCompare(b.at));
    root.querySelector('#calendar-results').innerHTML = entries.length ? entries.map(({ row: r, at, schedule }) => `<section class="card"><h2>${e(names.get(r.exercise_type_id))} · ${schedule ? ({ scheduled: '예정', cancelled: '예약 취소', completed: '완료' }[r.status] ?? r.status) : '운동기록'}</h2><p>${e(formatLocalDateTime(at, timezone))}</p><p>${e(r.memo)}</p>${schedule ? `<button class="button" data-schedule="${r.id}">예약 열기</button>` : `<button class="button button-secondary" data-log="${r.id}">기록 열기</button>`}</section>`).join('') : '<section class="card">이 기간의 예약·운동기록이 없습니다.</section>';
    action(context, '[data-schedule]', (b) => context.navigate(`/exercise/schedule/${b.dataset.schedule}/edit`));
    action(context, '[data-log]', (b) => context.navigate(`/exercise/log/${b.dataset.log}`));
  };
  action(context, '#calendar-search', draw); await draw();
}
export async function renderScheduleForm(context, id, complete = false) {
  const { root, services, isCurrent, setTitle } = context;
  setTitle(complete ? '예약 완료' : id ? '예약 수정' : '예약 추가');
  const [types, timezone, schedule] = await Promise.all([services.exerciseQuery.listAllTypes({ includeDeleted: Boolean(id) }), services.exerciseQuery.getTimezone(), id ? services.activity.schedule(id) : null]);
  const template = complete ? await services.activity.completionTemplate(schedule) : null;
  const options = complete ? await passOptions(services, schedule.exercise_type_id) : '';
  if (!isCurrent()) return;
  if (schedule?.status === 'completed') {
    root.innerHTML = `<section class="card"><h2>완료된 예약</h2><p>완료 취소하면 연결 운동기록을 삭제하고 이용권 차감을 되돌립니다.</p><button class="button" id="completed-log">운동기록 보기</button> <button class="button button-danger" id="undo-schedule">완료 취소</button></section>`;
    action(context, '#completed-log', () => context.navigate(`/exercise/log/${schedule.completed_exercise_log_id}`));
    action(context, '#undo-schedule', async () => { if (!window.confirm('완료를 취소하고 차감을 복원할까요?')) return; await services.activity.undoSchedule(id, schedule.revision); context.navigate('/calendar'); }); return;
  }
  root.innerHTML = `<form id="schedule-form" class="form-stack"><section class="card">
    <div class="form-field"><label for="schedule-type">운동</label><select id="schedule-type" ${complete || schedule?.completed_exercise_log_id ? 'disabled' : ''}>${types.filter((t) => t.id === schedule?.exercise_type_id || (t.status === 'active' && t.deleted_at === null)).map((t) => `<option value="${t.id}" ${t.id === schedule?.exercise_type_id ? 'selected' : ''}>${e(t.name)}</option>`).join('')}</select></div>
    <div class="form-field"><label for="schedule-at">${complete ? '실제 운동일/시간' : '예정 날짜/시간'}</label><input id="schedule-at" type="datetime-local" required value="${schedule ? utcIsoToLocalInput(schedule.scheduled_at, timezone) : nowLocalInput(timezone)}"></div>
    ${complete ? `<div id="dynamic-fields">${renderDynamicFields(template.fields, { duration_minutes: schedule.expected_duration_minutes })}</div><div class="form-field"><label for="exercise-pass">차감 이용권</label><select id="exercise-pass">${options}</select></div>` : `<div class="form-field"><label for="schedule-duration">예정 시간 (분)</label><input id="schedule-duration" type="number" min="1" max="1440" required value="${schedule?.expected_duration_minutes ?? 50}"></div><div class="form-field"><label for="schedule-status">상태</label><select id="schedule-status"><option value="scheduled">예정</option><option value="cancelled" ${schedule?.status === 'cancelled' ? 'selected' : ''}>취소</option></select></div>`}
    <div class="form-field"><label for="schedule-memo">메모</label><textarea id="schedule-memo" maxlength="2000">${e(schedule?.memo ?? '')}</textarea></div>
    <p>${complete ? '저장 시 운동기록을 생성하고 선택한 이용권을 1회 차감합니다.' : '예약 저장·수정·취소는 이용권을 차감하지 않습니다.'}</p></section>${buttons}</form>
    ${id && !complete ? `<div class="form-actions"><button class="button button-danger" id="cancel-schedule">예약 취소</button><button class="button" id="complete-schedule" ${schedule.status !== 'scheduled' ? 'disabled' : ''}>예약 완료</button></div>` : ''}`;
  action(context, '[data-back]', () => context.navigate('/calendar'));
  action(context, '#complete-schedule', () => context.navigate(`/exercise/schedule/${id}/complete`));
  action(context, '#cancel-schedule', async () => { if (!window.confirm('저장된 예약을 취소할까요?')) return; await services.activity.cancelSchedule(id, schedule.revision); clearNavigationGuard(); context.navigate('/calendar'); });
  const value = (key) => root.querySelector(`#schedule-${key}`).value;
  submit(context, '#schedule-form', () => complete
    ? services.activity.completeSchedule(id, { performed_at_local: value('at'), values: readDynamicValues(root, template.fields), pass_id: root.querySelector('#exercise-pass').value || null, memo: value('memo') }, schedule.revision)
    : services.activity.saveSchedule({ exercise_type_id: value('type'), scheduled_at_local: value('at'), expected_duration_minutes: value('duration'), status: value('status'), memo: value('memo') }, id, schedule?.revision));
}
