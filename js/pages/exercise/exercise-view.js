import { EXERCISE_FIELD_CATALOG, EXERCISE_FIELD_TYPES } from '../../core/exercise-fields.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function renderDynamicFields(fields, values = {}) {
  return [...fields].sort((a, b) => a.sort_order - b.sort_order).map((field) => {
    const value = values[field.key];
    const common = `data-exercise-field="${escapeHtml(field.key)}" id="field-${escapeHtml(field.key)}"`;
    const label = `${escapeHtml(field.label)}${field.required ? ' <span class="required-mark">*</span>' : ''}`;
    const unit = field.unit ? `<span class="field-unit">${escapeHtml(field.unit)}</span>` : '';
    let control = '';
    if (field.type === 'boolean') {
      control = `<label class="toggle-row"><input ${common} type="checkbox" ${value === true ? 'checked' : ''}><span>예</span></label>`;
    } else if (field.type === 'textarea') {
      control = `<textarea ${common} rows="4" maxlength="2000">${escapeHtml(value ?? '')}</textarea>`;
    } else if (field.type === 'select') {
      control = `<select ${common}><option value="">선택</option>${(field.options ?? []).map((option) => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;
    } else {
      const type = field.type === 'number' ? 'number' : 'text';
      const attrs = field.type === 'number'
        ? `${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : 'step="any"'}`
        : 'maxlength="200"';
      control = `<div class="field-with-unit"><input ${common} type="${type}" ${attrs} value="${escapeHtml(value ?? '')}">${unit}</div>`;
    }
    return `<div class="form-field"><label for="field-${escapeHtml(field.key)}">${label}</label>${control}</div>`;
  }).join('');
}

export function readDynamicValues(root, fields) {
  const result = {};
  for (const field of fields) {
    const node = root.querySelector(`[data-exercise-field="${CSS.escape(field.key)}"]`);
    if (!node) continue;
    if (field.type === 'boolean') result[field.key] = node.checked;
    else result[field.key] = node.value;
  }
  return result;
}

export function renderTemplateEditor(fields = []) {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const standards = Object.values(EXERCISE_FIELD_CATALOG).map((catalog) => `
    <label class="check-card">
      <input type="checkbox" data-standard-field="${catalog.key}" ${byKey.has(catalog.key) ? 'checked' : ''}>
      <span><strong>${escapeHtml(catalog.label)}</strong>${catalog.unit ? `<small>${escapeHtml(catalog.unit)}</small>` : ''}</span>
    </label>
  `).join('');
  const customs = fields.filter((field) => field.key.startsWith('custom_')).map(renderCustomFieldRow).join('');
  return `
    <div class="form-section">
      <h3>기본 항목</h3>
      <div class="check-grid">${standards}</div>
    </div>
    <div class="form-section">
      <div class="section-heading"><h3>사용자 항목</h3><button id="add-custom-field" class="text-button" type="button">+ 항목 추가</button></div>
      <div id="custom-fields">${customs || '<p class="inline-empty" data-custom-empty>추가한 사용자 항목이 없습니다.</p>'}</div>
    </div>
  `;
}

export function renderCustomFieldRow(field = {}) {
  const optionsText = Array.isArray(field.options) ? field.options.join(', ') : '';
  return `
    <div class="custom-field-row" data-custom-row data-key="${escapeHtml(field.key ?? '')}">
      <div class="custom-field-header"><strong>사용자 항목</strong><button class="text-button danger-text" data-remove-custom type="button">삭제</button></div>
      <div class="form-field"><label>항목 이름</label><input data-custom-label maxlength="50" value="${escapeHtml(field.label ?? '')}" placeholder="예: 라운드 수"></div>
      <div class="form-row two-col">
        <div class="form-field"><label>형식</label><select data-custom-type>${EXERCISE_FIELD_TYPES.map((type) => `<option value="${type}" ${(field.type ?? 'number') === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
        <div class="form-field"><label>단위</label><input data-custom-unit maxlength="20" value="${escapeHtml(field.unit ?? '')}" placeholder="예: round"></div>
      </div>
      <div class="form-field custom-options" ${(field.type ?? 'number') === 'select' ? '' : 'hidden'}><label>선택지 (쉼표 구분)</label><input data-custom-options value="${escapeHtml(optionsText)}" placeholder="좋음, 보통, 나쁨"></div>
      <label class="toggle-row"><input data-custom-required type="checkbox" ${field.required ? 'checked' : ''}><span>필수 입력</span></label>
    </div>
  `;
}

export function bindTemplateEditor(root, onDirty) {
  const customRoot = root.querySelector('#custom-fields');
  root.querySelector('#add-custom-field')?.addEventListener('click', () => {
    customRoot.querySelector('[data-custom-empty]')?.remove();
    customRoot.insertAdjacentHTML('beforeend', renderCustomFieldRow());
    bindCustomRows(root, onDirty);
    onDirty();
  });
  root.querySelectorAll('[data-standard-field]').forEach((node) => node.addEventListener('change', onDirty));
  bindCustomRows(root, onDirty);
}

function bindCustomRows(root, onDirty) {
  root.querySelectorAll('[data-custom-row]').forEach((row) => {
    if (row.dataset.bound === '1') return;
    row.dataset.bound = '1';
    row.querySelector('[data-remove-custom]')?.addEventListener('click', () => {
      row.remove();
      onDirty();
    });
    row.querySelector('[data-custom-type]')?.addEventListener('change', (event) => {
      row.querySelector('.custom-options').hidden = event.target.value !== 'select';
      onDirty();
    });
    row.querySelectorAll('input, select').forEach((node) => node.addEventListener('input', onDirty));
    row.querySelectorAll('input, select').forEach((node) => node.addEventListener('change', onDirty));
  });
}

export function readTemplateFields(root) {
  const fields = [];
  for (const key of Object.keys(EXERCISE_FIELD_CATALOG)) {
    if (root.querySelector(`[data-standard-field="${key}"]`)?.checked) fields.push({ key });
  }
  root.querySelectorAll('[data-custom-row]').forEach((row) => {
    const type = row.querySelector('[data-custom-type]').value;
    fields.push({
      key: row.dataset.key || undefined,
      label: row.querySelector('[data-custom-label]').value,
      type,
      unit: row.querySelector('[data-custom-unit]').value,
      required: row.querySelector('[data-custom-required]').checked,
      options: type === 'select' ? row.querySelector('[data-custom-options]').value.split(',') : undefined
    });
  });
  return fields;
}

export function bindDirtyInputs(root, onDirty) {
  root.querySelectorAll('input, textarea, select').forEach((node) => {
    node.addEventListener('input', onDirty);
    node.addEventListener('change', onDirty);
  });
}
