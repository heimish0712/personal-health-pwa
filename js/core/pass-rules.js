import { ValidationError } from './errors.js';
export function requireRule(condition, code, message) {
  if (!condition) throw new ValidationError(code, message);
}
export function dateKey(iso, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validatePass(data) {
  const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  requireRule(typeof data.name === 'string' && data.name.trim().length > 0 && data.name.length <= 100, 'PASS_NAME', '이용권 이름은 1~100자로 입력하세요.');
  requireRule(Number.isSafeInteger(data.total_count) && data.total_count >= 1, 'PASS_COUNT', '총 횟수는 1 이상의 정수로 입력하세요.');
  requireRule(validDate(data.start_date) && validDate(data.expiry_date) && data.start_date <= data.expiry_date, 'PASS_DATES', '이용권 시작일과 종료일을 확인하세요.');
  requireRule(['active', 'inactive'].includes(data.status), 'PASS_STATUS', '이용권 상태를 확인하세요.');
}
