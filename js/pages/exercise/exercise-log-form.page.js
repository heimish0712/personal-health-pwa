import { passOptions } from './pass-schedule.page.js';
import { DirtyFormGuard } from '../../components/dirty-form-guard.js';
import { nowLocalInput, utcIsoToLocalInput } from '../../core/datetime.js';
import { setNavigationGuard, clearNavigationGuard } from '../../router.js';
import { bindDirtyInputs, escapeHtml, readDynamicValues, renderDynamicFields } from './exercise-view.js';

function bindGuard(root) {
  const guard = new DirtyFormGuard();
  bindDirtyInputs(root, () => guard.markDirty());
  setNavigationGuard(({ unloading }) => unloading ? !guard.isDirty() : guard.canLeave());
  return guard;
}

async function renderFields(root, services, exerciseTypeId, values = {}) {
  const template = await services.exerciseQuery.getActiveTemplate(exerciseTypeId);
  if (!template) throw new Error('활성 운동 기록 양식을 찾을 수 없습니다.');
  root.querySelector('#dynamic-fields').innerHTML = renderDynamicFields(template.fields, values);
  return template;
}

export async function renderExerciseLogCreate(context) {
  const { root, services, navigate, setTitle, showToast, showError, isCurrent } = context;
  setTitle('운동 기록');
  const [types, timezone] = await Promise.all([services.exerciseQuery.listActiveTypes(), services.exerciseQuery.getTimezone()]);
  if (!isCurrent()) return;
  if (types.length === 0) {
    root.innerHTML = '<section class="card empty-state"><div><strong>활성 운동이 없습니다.</strong><span>운동을 먼저 추가하거나 활성화해 주세요.</span><button id="go-manage" class="button" type="button">운동 관리</button></div></section>';
    root.querySelector('#go-manage')?.addEventListener('click', () => navigate('/exercise/manage'));
    return;
  }
  root.innerHTML = `
    <form id="exercise-log-form" class="form-stack">
      <section class="card">
        <div class="form-field"><label for="exercise-type">운동</label><select id="exercise-type">${types.map((type) => `<option value="${type.id}">${escapeHtml(type.icon ?? '●')} ${escapeHtml(type.name)}</option>`).join('')}</select></div>
        <div class="form-field"><label for="performed-at">날짜/시간</label><input id="performed-at" type="datetime-local" value="${nowLocalInput(timezone)}" required></div>
        <div id="dynamic-fields"></div>
        <div class="form-field"><label for="exercise-memo">메모</label><textarea id="exercise-memo" maxlength="2000" rows="5" placeholder="운동 상태나 느낀 점을 기록하세요."></textarea></div>
      </section>
      <div class="form-actions"><button class="button button-secondary" data-cancel type="button">취소</button><button class="button" type="submit">저장</button></div>
    </form>`;
  let template = await renderFields(root, services, types[0].id);
  root.querySelector('#dynamic-fields').insertAdjacentHTML('afterend', '<div class="form-field"><label for="exercise-pass">차감 이용권</label><select id="exercise-pass"></select></div>');
  root.querySelector('#exercise-pass').innerHTML = await passOptions(services, types[0].id);
  const guard = bindGuard(root);
  root.querySelector('#exercise-type').addEventListener('change', async (event) => {
    try { template = await renderFields(root, services, event.target.value); root.querySelector('#exercise-pass').innerHTML = await passOptions(services, event.target.value); guard.markDirty(); bindDirtyInputs(root.querySelector('#dynamic-fields'), () => guard.markDirty()); }
    catch (error) { showError('운동 기록 양식을 불러오지 못했습니다.', error); }
  });
  root.querySelector('[data-cancel]')?.addEventListener('click', () => navigate('/exercise'));
  let busy = false;
  root.querySelector('#exercise-log-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return; busy = true;
    const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true;
    try {
      const typeId = root.querySelector('#exercise-type').value;
      const result = await services.exerciseLog.create({
        exercise_type_id: typeId,
        performed_at_local: root.querySelector('#performed-at').value,
        values: readDynamicValues(root, template.fields),
        pass_id: root.querySelector('#exercise-pass').value || null,
        memo: root.querySelector('#exercise-memo').value
      });
      guard.markClean(); clearNavigationGuard(); showToast('운동 기록을 저장했습니다.'); navigate(`/exercise/log/${result.id}`);
    } catch (error) { showError('운동 기록 저장에 실패했습니다.', error); }
    finally { busy = false; button.disabled = false; }
  });
}

export async function renderExerciseLogEdit(context, id) {
  const { root, services, navigate, setTitle, showToast, showError, isCurrent } = context;
  setTitle('운동 기록 수정');
  const [detail, timezone] = await Promise.all([services.exerciseLog.getDetail(id), services.exerciseQuery.getTimezone()]);
  if (!isCurrent()) return;
  const { log, exerciseType, template } = detail;
  const options = await passOptions(services, log.exercise_type_id, await services.activity.selectedPass(log));
  if (!isCurrent()) return;
  root.innerHTML = `
    <form id="exercise-log-edit-form" class="form-stack">
      <section class="card">
        <h2>${escapeHtml(exerciseType.icon ?? '●')} ${escapeHtml(exerciseType.name)}</h2>
        <p class="section-description">이 기록은 생성 당시 양식 v${template.version}을 유지합니다.</p>
        <div class="form-field"><label for="performed-at">날짜/시간</label><input id="performed-at" type="datetime-local" value="${utcIsoToLocalInput(log.performed_at, timezone)}" required></div>
        <div id="dynamic-fields">${renderDynamicFields(template.fields, log.values)}</div><div class="form-field"><label for="exercise-pass">차감 이용권</label><select id="exercise-pass">${options}</select></div>
        <div class="form-field"><label for="exercise-memo">메모</label><textarea id="exercise-memo" maxlength="2000" rows="5">${escapeHtml(log.memo ?? '')}</textarea></div>
      </section>
      <div class="form-actions"><button class="button button-secondary" data-cancel type="button">취소</button><button class="button" type="submit">저장</button></div>
    </form>`;
  const guard = bindGuard(root);
  root.querySelector('[data-cancel]')?.addEventListener('click', () => navigate(`/exercise/log/${id}`));
  let busy = false;
  root.querySelector('#exercise-log-edit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return; busy = true;
    const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true;
    try {
      await services.exerciseLog.update(id, {
        performed_at_local: root.querySelector('#performed-at').value,
        values: readDynamicValues(root, template.fields),
        pass_id: root.querySelector('#exercise-pass').value || null,
        memo: root.querySelector('#exercise-memo').value
      }, log.revision);
      guard.markClean(); clearNavigationGuard(); showToast('운동 기록을 수정했습니다.'); navigate(`/exercise/log/${id}`);
    } catch (error) { showError('운동 기록 수정에 실패했습니다.', error); }
    finally { busy = false; button.disabled = false; }
  });
}
