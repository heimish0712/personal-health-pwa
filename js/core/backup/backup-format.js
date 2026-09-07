import { ValidationError } from '../errors.js';

export const BACKUP_FORMAT = 'personal-health-pwa-backup';
export const BACKUP_STORE_NAMES = Object.freeze([
  'profiles', 'exercise_types', 'exercise_templates', 'exercise_logs', 'exercise_schedules',
  'passes', 'pass_usage_logs', 'diet_logs', 'diet_photos', 'weight_logs', 'inbody_logs', 'user_settings'
]);
export const BACKUP_MAX_BYTES = 50 * 1000 * 1000;
export const BACKUP_MESSAGES = Object.freeze({
  BACKUP_ZIP_INVALID: 'ZIP 백업이 손상되었거나 지원하지 않는 압축 방식입니다. 앱에서 내보낸 원본 ZIP을 선택하세요.',
  BACKUP_MEDIA_INVALID: '사진 파일이 누락·손상되었거나 사진 연결 정보가 일치하지 않습니다. 전체 복원을 거부했습니다.',
  BACKUP_DOWNLOAD_REQUIRED: '다운로드한 현재 데이터 백업 파일을 다시 선택해 확인해야 합니다. 아직 초기화하거나 교체하지 않았습니다.',
  BACKUP_MULTIPLE_PROFILES: '현재 JSON 백업은 한 Profile만 포함합니다. 여러 Profile이 있는 전체 데이터는 먼저 각각 보관해야 합니다. 초기화하거나 교체하지 않았습니다.',
  RESTORE_TARGET_CHANGED: '확인 중 현재 데이터가 변경되었습니다. 다시 미리보고 백업한 뒤 실행하세요. 기존 데이터는 유지됩니다.',
  RESET_TRANSACTION_FAILED: '초기화에 실패했습니다. 초기화 전 데이터는 그대로 유지됩니다.',
  RESET_VERIFY_FAILED: '초기 상태 확인에 실패했습니다. 앱을 다시 열어 확인하세요.',

  BACKUP_FILE_TOO_LARGE: '백업 파일은 50 MB 이하만 선택할 수 있습니다.',
  BACKUP_JSON_INVALID: '백업 JSON 파일을 읽을 수 없습니다.',
  BACKUP_FORMAT_INVALID: '이 앱의 백업 파일 형식이 아닙니다.',
  BACKUP_VERSION_UNSUPPORTED: '지원하지 않는 백업 형식 버전입니다.',
  BACKUP_SCHEMA_UNSUPPORTED: '지원하지 않는 데이터 구조 버전입니다.',
  BACKUP_CHECKSUM_MISMATCH: '백업 파일이 손상되었거나 변경되었습니다. 복원을 진행하지 않았습니다.',
  BACKUP_COUNTS_MISMATCH: '백업의 항목 수가 실제 데이터와 일치하지 않습니다.',
  BACKUP_SCOPE_MISMATCH: '백업에 서로 다른 Profile의 데이터가 섞여 있습니다.',
  BACKUP_DUPLICATE_ID: '백업에 중복된 데이터 ID가 있습니다.',
  BACKUP_REFERENCE_BROKEN: '백업 데이터의 연결 관계가 올바르지 않습니다.',
  BACKUP_UNIQUE_CONFLICT: '백업에 중복될 수 없는 데이터가 함께 들어 있습니다.',
  BACKUP_MEDIA_UNSUPPORTED: '사진 메타데이터가 있어 JSON v1으로 안전하게 백업하거나 복원할 수 없습니다. 사진을 지원하는 새 백업 형식이 필요합니다.',
  BACKUP_ROW_INVALID: '백업 데이터의 값이나 메타데이터가 올바르지 않습니다.',
  BACKUP_CRYPTO_UNAVAILABLE: '이 환경에서는 백업 무결성 검사를 사용할 수 없습니다. HTTPS 또는 localhost에서 열어 주세요.',
  RESTORE_TARGET_NOT_PRISTINE: '현재 앱에 기존 데이터 또는 변경된 설정이 있어 복원할 수 없습니다. JSON v1은 초기 상태 복원만 지원하며 병합하지 않습니다. 현재 데이터는 변경되지 않았습니다.',
  RESTORE_PREVIEW_EXPIRED: '백업 파일을 다시 선택하고 내용을 확인해 주세요.',
  RESTORE_BUSY: '복원이 진행 중입니다. 완료될 때까지 기다려 주세요.',
  RESTORE_TRANSACTION_FAILED: '복원 저장에 실패했습니다. 복원 전 데이터는 그대로 유지됩니다.',
  RESTORE_VERIFY_FAILED: '데이터 저장 후 동일성 확인을 완료하지 못했습니다. 다시 복원하지 말고 앱을 다시 열어 데이터를 확인해 주세요.'
});

export function backupError(code, cause = undefined) {
  return new ValidationError(code, BACKUP_MESSAGES[code] ?? BACKUP_MESSAGES.BACKUP_ROW_INVALID, { cause });
}

export function backupCounts(data) {
  return Object.fromEntries(BACKUP_STORE_NAMES.map((name) => [name, data[name].length]));
}

export function sortBackupData(data) {
  return Object.fromEntries(BACKUP_STORE_NAMES.map((name) => [name,
    [...data[name]].sort((a, b) => (a?.id ?? '') < (b?.id ?? '') ? -1 : (a?.id ?? '') > (b?.id ?? '') ? 1 : 0)
  ]));
}
