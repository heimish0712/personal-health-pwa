import { escapeHtml } from './exercise-view.js';

export async function renderExerciseManagement(context) {
  const { root, services, navigate, setTitle, showToast, showError, isCurrent } = context;
  setTitle('운동 관리');
  const draw = async () => {
    const types = await services.exerciseQuery.listAllTypes({ includeDeleted: true });
    if (!isCurrent()) return;
    const active = types.filter((item) => item.deleted_at === null);
    const deleted = types.filter((item) => item.deleted_at !== null);
    root.innerHTML = `
      <section class="card">
        <div class="section-heading"><div><h2>운동 종류</h2><p>운동과 기록 양식을 따로 관리합니다.</p></div><button id="new-type" class="button compact-button" type="button">+ 새 운동</button></div>
        <div class="management-list">${active.length ? active.map((type) => `
          <div class="management-item">
            <div><strong>${escapeHtml(type.icon ?? '●')} ${escapeHtml(type.name)}</strong><small>${type.system_key ? '기본 운동 · ' : ''}${type.status === 'active' ? '활성' : '비활성'} · rev ${type.revision}</small></div>
            <div class="mini-actions">
              <button class="text-button" data-edit="${type.id}" type="button">편집</button>
              <button class="text-button" data-template="${type.id}" type="button">양식</button>
              <button class="text-button" data-toggle="${type.id}" data-status="${type.status}" data-revision="${type.revision}" type="button">${type.status === 'active' ? '비활성' : '활성'}</button>
              <button class="text-button danger-text" data-delete="${type.id}" data-revision="${type.revision}" type="button">삭제</button>
            </div>
          </div>`).join('') : '<p class="inline-empty">등록된 운동이 없습니다.</p>'}</div>
      </section>
      ${deleted.length ? `<section class="card"><h2>삭제된 운동</h2><div class="management-list">${deleted.map((type) => `<div class="management-item"><div><strong>${escapeHtml(type.icon ?? '●')} ${escapeHtml(type.name)}</strong><small>삭제됨 · rev ${type.revision}</small></div><button class="text-button" data-restore="${type.id}" data-revision="${type.revision}" type="button">복원</button></div>`).join('')}</div></section>` : ''}
      <button id="back-exercise" class="button button-secondary full-width-button" type="button">운동으로 돌아가기</button>
    `;
    root.querySelector('#new-type')?.addEventListener('click', () => navigate('/exercise/type/new'));
    root.querySelector('#back-exercise')?.addEventListener('click', () => navigate('/exercise'));
    root.querySelectorAll('[data-edit]').forEach((node) => node.addEventListener('click', () => navigate(`/exercise/type/${node.dataset.edit}/edit`)));
    root.querySelectorAll('[data-template]').forEach((node) => node.addEventListener('click', () => navigate(`/exercise/type/${node.dataset.template}/template`)));
    root.querySelectorAll('[data-toggle]').forEach((node) => node.addEventListener('click', async () => {
      try {
        await services.exerciseManagement.setExerciseTypeStatus(node.dataset.toggle, node.dataset.status === 'active' ? 'inactive' : 'active', Number(node.dataset.revision));
        showToast('운동 상태를 변경했습니다.'); await draw();
      } catch (error) { showError('운동 상태를 변경하지 못했습니다.', error); await draw(); }
    }));
    root.querySelectorAll('[data-delete]').forEach((node) => node.addEventListener('click', async () => {
      if (!window.confirm('이 운동을 삭제하시겠습니까? 과거 운동 기록은 유지됩니다.')) return;
      try {
        await services.exerciseManagement.softDeleteExerciseType(node.dataset.delete, Number(node.dataset.revision));
        showToast('운동을 삭제했습니다.'); await draw();
      } catch (error) { showError('운동 상태를 변경하지 못했습니다.', error); await draw(); }
    }));
    root.querySelectorAll('[data-restore]').forEach((node) => node.addEventListener('click', async () => {
      try {
        await services.exerciseManagement.restoreExerciseType(node.dataset.restore, Number(node.dataset.revision));
        showToast('운동을 복원했습니다.'); await draw();
      } catch (error) { showError('운동 상태를 변경하지 못했습니다.', error); await draw(); }
    }));
  };
  await draw();
}
