import { DirtyFormGuard } from '../../components/dirty-form-guard.js';
import { setNavigationGuard, clearNavigationGuard } from '../../router.js';
import { bindDirtyInputs, bindTemplateEditor, escapeHtml, readTemplateFields, renderTemplateEditor } from './exercise-view.js';

function bindGuard(root) {
  const guard = new DirtyFormGuard();
  const dirty = () => guard.markDirty();
  bindDirtyInputs(root, dirty);
  setNavigationGuard(({ unloading }) => unloading ? !guard.isDirty() : guard.canLeave());
  return { guard, dirty };
}

export async function renderExerciseTypeCreate(context) {
  const { root, services, navigate, setTitle, showToast, showError } = context;
  setTitle('새 운동');
  root.innerHTML = `
    <form id="exercise-type-form" class="form-stack">
      <section class="card">
        <h2>운동 정보</h2>
        <div class="form-field"><label for="exercise-name">운동 이름 <span class="required-mark">*</span></label><input id="exercise-name" maxlength="50" placeholder="예: 러닝" required></div>
        <div class="form-field"><label for="exercise-icon">아이콘</label><input id="exercise-icon" maxlength="20" value="●" placeholder="예: 🏃"></div>
      </section>
      <section class="card"><h2>기록 양식</h2><p class="section-description">날짜/시간과 메모는 모든 운동에 기본으로 포함됩니다.</p>${renderTemplateEditor([])}</section>
      <div class="form-actions"><button class="button button-secondary" data-cancel type="button">취소</button><button class="button" type="submit">저장</button></div>
    </form>`;
  const { guard, dirty } = bindGuard(root);
  bindTemplateEditor(root, dirty);
  root.querySelector('[data-cancel]')?.addEventListener('click', () => navigate('/exercise/manage'));
  root.querySelector('#exercise-type-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await services.exerciseManagement.createExerciseType({
        name: root.querySelector('#exercise-name').value,
        icon: root.querySelector('#exercise-icon').value,
        status: 'active',
        fields: readTemplateFields(root)
      });
      guard.markClean(); clearNavigationGuard();
      showToast(`${result.exerciseType.name} 운동을 추가했습니다.`);
      navigate('/exercise/manage');
    } catch (error) { showError('운동 추가에 실패했습니다.', error); }
  });
}

export async function renderExerciseTypeEdit(context, id) {
  const { root, services, navigate, setTitle, showToast, showError, isCurrent } = context;
  setTitle('운동 편집');
  const type = await services.exerciseManagement.getExerciseType(id);
  if (!isCurrent()) return;
  root.innerHTML = `
    <form id="exercise-type-edit-form" class="form-stack">
      <section class="card">
        <h2>${escapeHtml(type.name)}</h2>
        <div class="form-field"><label for="exercise-name">운동 이름</label><input id="exercise-name" maxlength="50" value="${escapeHtml(type.name)}" required></div>
        <div class="form-field"><label for="exercise-icon">아이콘</label><input id="exercise-icon" maxlength="20" value="${escapeHtml(type.icon ?? '●')}"></div>
        <div class="form-field"><label for="exercise-status">상태</label><select id="exercise-status"><option value="active" ${type.status === 'active' ? 'selected' : ''}>활성</option><option value="inactive" ${type.status === 'inactive' ? 'selected' : ''}>비활성</option></select></div>
        <p class="section-description">기록 항목은 별도의 ‘양식’ 화면에서 버전으로 관리합니다.</p>
      </section>
      <div class="form-actions"><button class="button button-secondary" data-cancel type="button">취소</button><button class="button" type="submit">저장</button></div>
    </form>`;
  const { guard } = bindGuard(root);
  root.querySelector('[data-cancel]')?.addEventListener('click', () => navigate('/exercise/manage'));
  root.querySelector('#exercise-type-edit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await services.exerciseManagement.updateExerciseType(type.id, {
        name: root.querySelector('#exercise-name').value,
        icon: root.querySelector('#exercise-icon').value,
        status: root.querySelector('#exercise-status').value
      }, type.revision);
      guard.markClean(); clearNavigationGuard(); showToast('운동 정보를 수정했습니다.'); navigate('/exercise/manage');
    } catch (error) { showError('운동 수정에 실패했습니다.', error); }
  });
}

export async function renderExerciseTemplateEdit(context, id) {
  const { root, services, navigate, setTitle, showToast, showError, isCurrent } = context;
  setTitle('기록 양식');
  const [type, template] = await Promise.all([
    services.exerciseManagement.getExerciseType(id),
    services.exerciseManagement.getActiveTemplate(id)
  ]);
  if (!isCurrent()) return;
  root.innerHTML = `
    <form id="exercise-template-form" class="form-stack">
      <section class="card">
        <h2>${escapeHtml(type.name)} · v${template.version}</h2>
        <p class="section-description">저장하면 기존 v${template.version}은 보존되고 새로운 버전이 생성됩니다. 과거 기록은 당시 양식을 계속 사용합니다.</p>
        ${renderTemplateEditor(template.fields)}
      </section>
      <div class="form-actions"><button class="button button-secondary" data-cancel type="button">취소</button><button class="button" type="submit">새 버전 저장</button></div>
    </form>`;
  const { guard, dirty } = bindGuard(root);
  bindTemplateEditor(root, dirty);
  root.querySelector('[data-cancel]')?.addEventListener('click', () => navigate('/exercise/manage'));
  root.querySelector('#exercise-template-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await services.exerciseManagement.createTemplateVersion(type.id, readTemplateFields(root), { expectedTemplateId: template.id, expectedTemplateRevision: template.revision });
      guard.markClean(); clearNavigationGuard(); showToast(`기록 양식 v${result.template.version}을 생성했습니다.`); navigate('/exercise/manage');
    } catch (error) { showError('기록 양식 저장에 실패했습니다.', error); }
  });
}
