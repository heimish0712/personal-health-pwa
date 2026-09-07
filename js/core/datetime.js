import { ValidationError } from './errors.js';

function partsFor(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  });
  return Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = partsFor(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
}

function parseLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value ?? '');
  if (!match) throw new ValidationError('DATETIME_INVALID', '날짜와 시간을 확인해 주세요.');
  return {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0)
  };
}

export function localDateTimeToUtcIso(localValue, timeZone) {
  const p = parseLocalDateTime(localValue);
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
  let result = new Date(guess.getTime() - timeZoneOffsetMs(guess, timeZone));
  const secondOffset = timeZoneOffsetMs(result, timeZone);
  result = new Date(guess.getTime() - secondOffset);
  if (Number.isNaN(result.getTime())) throw new ValidationError('DATETIME_INVALID', '날짜와 시간을 확인해 주세요.');
  const actual = partsFor(result, timeZone);
  if (['year', 'month', 'day', 'hour', 'minute', 'second'].some((key) => Number(actual[key]) !== p[key])) throw new ValidationError('DATETIME_INVALID', '실제 존재하는 날짜와 시간을 입력하세요.');
  return result.toISOString();
}

export function utcIsoToLocalInput(isoValue, timeZone) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  const p = partsFor(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatLocalDateTime(isoValue, timeZone, options = {}) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...options
  }).format(date);
}

export function formatLocalDate(isoValue, timeZone) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function nowLocalInput(timeZone, nowIso = new Date().toISOString()) {
  return utcIsoToLocalInput(nowIso, timeZone);
}

export function getLocalWeekUtcRange(nowIso, timeZone) {
  const date = new Date(nowIso);
  const p = partsFor(date, timeZone);
  const localMidnightUtcLike = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  const weekday = localMidnightUtcLike.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  localMidnightUtcLike.setUTCDate(localMidnightUtcLike.getUTCDate() + mondayOffset);
  const y = localMidnightUtcLike.getUTCFullYear();
  const m = String(localMidnightUtcLike.getUTCMonth() + 1).padStart(2, '0');
  const d = String(localMidnightUtcLike.getUTCDate()).padStart(2, '0');
  const start = localDateTimeToUtcIso(`${y}-${m}-${d}T00:00`, timeZone);
  localMidnightUtcLike.setUTCDate(localMidnightUtcLike.getUTCDate() + 7);
  const ey = localMidnightUtcLike.getUTCFullYear();
  const em = String(localMidnightUtcLike.getUTCMonth() + 1).padStart(2, '0');
  const ed = String(localMidnightUtcLike.getUTCDate()).padStart(2, '0');
  const end = localDateTimeToUtcIso(`${ey}-${em}-${ed}T00:00`, timeZone);
  return { start, end };
}
