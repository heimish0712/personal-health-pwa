import { ValidationError } from './errors.js';

export const IMMUTABLE_FIELDS = Object.freeze(['id', 'profile_id', 'created_at']);
export const MANAGED_FIELDS = Object.freeze(['updated_at', 'deleted_at', 'revision']);
export const PROTECTED_UPDATE_FIELDS = Object.freeze([...IMMUTABLE_FIELDS, ...MANAGED_FIELDS]);

export function stripUndefined(source) {
  return Object.fromEntries(
    Object.entries(source ?? {}).filter(([, value]) => value !== undefined)
  );
}

export function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createScopedEntity({ data, id, profileId, nowIso }) {
  const cleanData = stripUndefined(data);
  delete cleanData.id;
  delete cleanData.profile_id;
  delete cleanData.created_at;
  delete cleanData.updated_at;
  delete cleanData.deleted_at;
  delete cleanData.revision;

  return {
    ...cloneValue(cleanData),
    id,
    profile_id: profileId,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    revision: 1
  };
}

export function createProfileEntity({ data, id, nowIso }) {
  const cleanData = stripUndefined(data);
  delete cleanData.id;
  delete cleanData.created_at;
  delete cleanData.updated_at;
  delete cleanData.deleted_at;
  delete cleanData.revision;

  return {
    ...cloneValue(cleanData),
    id,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    revision: 1
  };
}

export function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ValidationError('PATCH_INVALID', 'Update patch must be an object.');
  }

  const forbidden = PROTECTED_UPDATE_FIELDS.filter((field) => Object.hasOwn(patch, field));
  if (forbidden.length > 0) {
    throw new ValidationError(
      'PATCH_PROTECTED_FIELD',
      `Protected fields cannot be changed: ${forbidden.join(', ')}`,
      { details: { forbidden } }
    );
  }
}

export function applyPatch(current, patch, nowIso) {
  validatePatch(patch);
  return {
    ...current,
    ...cloneValue(stripUndefined(patch)),
    updated_at: nowIso,
    revision: current.revision + 1
  };
}
