export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    this.details = options.details ?? null;
  }
}

export class DatabaseError extends AppError {}
export class DatabaseBlockedError extends DatabaseError {}
export class DatabaseMigrationError extends DatabaseError {}
export class IdentityNotReadyError extends AppError {}
export class NotFoundError extends AppError {}
export class ConflictError extends AppError {}
export class ValidationError extends AppError {}

export function getPublicErrorMessage(error) {
  const code = error?.code;

  if (code === 'DB_BLOCKED') {
    return '데이터베이스 업데이트가 대기 중입니다. 이 앱이 열린 다른 탭을 닫고 다시 시도해 주세요.';
  }

  if (code === 'INDEXEDDB_UNSUPPORTED') {
    return '이 브라우저는 로컬 데이터 저장 기능을 지원하지 않습니다.';
  }

  if (code === 'REVISION_CONFLICT') {
    return '다른 변경사항이 먼저 저장되었습니다. 화면을 다시 불러온 뒤 재시도해 주세요.';
  }

  return '데이터 저장소를 초기화하지 못했습니다. 기존 데이터는 삭제되지 않았습니다.';
}

export function getActionErrorMessage(error, fallback = '작업을 완료하지 못했습니다. 다시 시도해 주세요.') {
  const code = error?.code;

  if (code === 'REVISION_CONFLICT' || code === 'TEMPLATE_CONFLICT') {
    return '다른 변경사항이 먼저 저장되었습니다. 최신 내용을 다시 불러온 뒤 재시도해 주세요.';
  }

  if (error instanceof ValidationError) {
    return error.message || '입력값을 확인해 주세요.';
  }

  if (error instanceof NotFoundError) {
    return '대상을 찾을 수 없습니다. 화면을 다시 불러와 주세요.';
  }

  if (error instanceof ConflictError) {
    return error.message || '현재 데이터 상태와 충돌하여 저장하지 못했습니다.';
  }

  return fallback;
}
