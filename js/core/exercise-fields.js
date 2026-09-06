import { ValidationError } from './errors.js';

export const EXERCISE_FIELD_TYPES = Object.freeze(['number', 'text', 'textarea', 'boolean', 'select']);

export const EXERCISE_FIELD_CATALOG = Object.freeze({
  duration_minutes: Object.freeze({ key: 'duration_minutes', label: '운동시간', type: 'number', unit: '분', required: false, min: 0, step: 1 }),
  distance_km: Object.freeze({ key: 'distance_km', label: '거리', type: 'number', unit: 'km', required: false, min: 0, step: 0.1 }),
  steps: Object.freeze({ key: 'steps', label: '걸음수', type: 'number', unit: '보', required: false, min: 0, step: 1 }),
  pace: Object.freeze({ key: 'pace', label: '페이스', type: 'text', unit: '', required: false }),
  calories: Object.freeze({ key: 'calories', label: '칼로리', type: 'number', unit: 'kcal', required: false, min: 0, step: 1 })
});

const STANDARD_KEYS = new Set(Object.keys(EXERCISE_FIELD_CATALOG));
const MAX = Object.freeze({ label: 50, unit: 20, text: 200, textarea: 2000, memo: 2000, exerciseName: 50 });

export function isStandardExerciseFieldKey(key) {
  return STANDARD_KEYS.has(key);
}

export function createCatalogField(key, sortOrder) {
  const source = EXERCISE_FIELD_CATALOG[key];
  if (!source) throw new ValidationError('EXERCISE_FIELD_UNKNOWN', `Unknown exercise field: ${key}`);
  return { ...source, sort_order: sortOrder };
}

export function createCustomFieldKey(idGenerator) {
  return `custom_${idGenerator.generate()}`;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assertStringLength(value, max, code, message) {
  if (typeof value !== 'string' || value.length > max) {
    throw new ValidationError(code, message);
  }
}

export function normalizeExerciseTypeInput(input = {}) {
  const name = cleanText(input.name);
  if (!name) throw new ValidationError('EXERCISE_NAME_REQUIRED', '운동 이름은 필수입니다.');
  assertStringLength(name, MAX.exerciseName, 'EXERCISE_NAME_TOO_LONG', `운동 이름은 ${MAX.exerciseName}자 이하여야 합니다.`);

  const icon = cleanText(input.icon) || '●';
  assertStringLength(icon, 20, 'EXERCISE_ICON_TOO_LONG', '아이콘 값이 너무 깁니다.');

  const status = input.status ?? 'active';
  if (!['active', 'inactive'].includes(status)) {
    throw new ValidationError('EXERCISE_STATUS_INVALID', '운동 상태가 올바르지 않습니다.');
  }

  return { name, icon, status };
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  const normalized = [...new Set(options.map(cleanText).filter(Boolean))];
  if (normalized.some((option) => option.length > 100)) {
    throw new ValidationError('EXERCISE_FIELD_OPTION_TOO_LONG', '선택 항목은 100자 이하여야 합니다.');
  }
  return normalized;
}

export function normalizeTemplateFields(rawFields, { idGenerator }) {
  if (!Array.isArray(rawFields)) {
    throw new ValidationError('EXERCISE_FIELDS_INVALID', '운동 기록 양식은 배열이어야 합니다.');
  }

  const fields = rawFields.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ValidationError('EXERCISE_FIELD_INVALID', '운동 기록 항목 형식이 올바르지 않습니다.');
    }

    let key = cleanText(raw.key);
    const standard = isStandardExerciseFieldKey(key);
    if (!key) key = createCustomFieldKey(idGenerator);
    if (!standard && !key.startsWith('custom_')) {
      throw new ValidationError('EXERCISE_FIELD_KEY_INVALID', '사용자 정의 항목 키가 올바르지 않습니다.');
    }

    const catalog = standard ? EXERCISE_FIELD_CATALOG[key] : null;
    const label = cleanText(raw.label ?? catalog?.label);
    if (!label) throw new ValidationError('EXERCISE_FIELD_LABEL_REQUIRED', '항목 이름은 필수입니다.');
    assertStringLength(label, MAX.label, 'EXERCISE_FIELD_LABEL_TOO_LONG', `항목 이름은 ${MAX.label}자 이하여야 합니다.`);

    const type = raw.type ?? catalog?.type;
    if (!EXERCISE_FIELD_TYPES.includes(type)) {
      throw new ValidationError('EXERCISE_FIELD_TYPE_INVALID', '지원하지 않는 운동 기록 항목 형식입니다.');
    }

    const unit = cleanText(raw.unit ?? catalog?.unit ?? '');
    assertStringLength(unit, MAX.unit, 'EXERCISE_FIELD_UNIT_TOO_LONG', `단위는 ${MAX.unit}자 이하여야 합니다.`);

    const field = {
      key,
      label,
      type,
      unit,
      required: Boolean(raw.required),
      sort_order: index + 1
    };

    if (type === 'number') {
      const min = raw.min ?? catalog?.min;
      const max = raw.max;
      const step = raw.step ?? catalog?.step;
      if (min !== undefined && min !== null) field.min = Number(min);
      if (max !== undefined && max !== null && max !== '') field.max = Number(max);
      if (step !== undefined && step !== null) field.step = Number(step);
      if (Object.hasOwn(field, 'min') && !Number.isFinite(field.min)) throw new ValidationError('EXERCISE_FIELD_MIN_INVALID', '최솟값이 올바르지 않습니다.');
      if (Object.hasOwn(field, 'max') && !Number.isFinite(field.max)) throw new ValidationError('EXERCISE_FIELD_MAX_INVALID', '최댓값이 올바르지 않습니다.');
      if (Object.hasOwn(field, 'step') && (!Number.isFinite(field.step) || field.step <= 0)) throw new ValidationError('EXERCISE_FIELD_STEP_INVALID', '증가 단위가 올바르지 않습니다.');
      if (Object.hasOwn(field, 'min') && Object.hasOwn(field, 'max') && field.max < field.min) throw new ValidationError('EXERCISE_FIELD_RANGE_INVALID', '최댓값은 최솟값보다 작을 수 없습니다.');
    }

    if (type === 'select') {
      const options = normalizeOptions(raw.options);
      if (options.length === 0) throw new ValidationError('EXERCISE_FIELD_OPTIONS_REQUIRED', '선택형 항목에는 선택지를 하나 이상 입력해야 합니다.');
      field.options = options;
    }

    return field;
  });

  const keys = new Set();
  for (const field of fields) {
    if (keys.has(field.key)) throw new ValidationError('EXERCISE_FIELD_DUPLICATE', `중복된 운동 기록 항목입니다: ${field.label}`);
    keys.add(field.key);
  }

  return fields;
}

export function validateExerciseValues(fields, rawValues = {}) {
  if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) {
    throw new ValidationError('EXERCISE_VALUES_INVALID', '운동 기록 값 형식이 올바르지 않습니다.');
  }

  const result = {};
  for (const field of [...fields].sort((a, b) => a.sort_order - b.sort_order)) {
    const raw = rawValues[field.key];
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) {
      if (field.required) throw new ValidationError('EXERCISE_VALUE_REQUIRED', `${field.label} 항목은 필수입니다.`);
      continue;
    }

    if (field.type === 'number') {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) throw new ValidationError('EXERCISE_VALUE_NUMBER_INVALID', `${field.label} 값은 숫자여야 합니다.`);
      if (field.min !== undefined && value < field.min) throw new ValidationError('EXERCISE_VALUE_MIN', `${field.label} 값은 ${field.min} 이상이어야 합니다.`);
      if (field.max !== undefined && value > field.max) throw new ValidationError('EXERCISE_VALUE_MAX', `${field.label} 값은 ${field.max} 이하여야 합니다.`);
      result[field.key] = value;
      continue;
    }

    if (field.type === 'boolean') {
      if (typeof raw !== 'boolean') throw new ValidationError('EXERCISE_VALUE_BOOLEAN_INVALID', `${field.label} 값이 올바르지 않습니다.`);
      result[field.key] = raw;
      continue;
    }

    if (field.type === 'select') {
      const value = String(raw);
      if (!field.options?.includes(value)) throw new ValidationError('EXERCISE_VALUE_SELECT_INVALID', `${field.label} 선택값이 올바르지 않습니다.`);
      result[field.key] = value;
      continue;
    }

    const value = String(raw);
    const max = field.type === 'textarea' ? MAX.textarea : MAX.text;
    if (value.length > max) throw new ValidationError('EXERCISE_VALUE_TEXT_TOO_LONG', `${field.label} 값은 ${max}자 이하여야 합니다.`);
    result[field.key] = value;
  }

  return result;
}

export function normalizeExerciseMemo(value) {
  const memo = typeof value === 'string' ? value : '';
  if (memo.length > MAX.memo) throw new ValidationError('EXERCISE_MEMO_TOO_LONG', `메모는 ${MAX.memo}자 이하여야 합니다.`);
  return memo;
}

export function areTemplateFieldsEqual(a, b) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}
