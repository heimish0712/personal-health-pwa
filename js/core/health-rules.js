import { ValidationError } from './errors.js';
import { dateKey } from './pass-rules.js';
import { localDateTimeToUtcIso, utcIsoToLocalInput } from './datetime.js';

export const HEALTH_METRICS = Object.freeze([
  { key: 'weight', label: '체중', unit: 'kg', positive: true },
  { key: 'skeletal_muscle_mass', label: '골격근량', unit: 'kg' },
  { key: 'body_fat_mass', label: '체지방량', unit: 'kg' },
  { key: 'body_fat_percentage', label: '체지방률', unit: '%', max: 100 },
  { key: 'bmi', label: 'BMI', unit: '', positive: true },
  { key: 'visceral_fat_level', label: '내장지방레벨', unit: '' },
  { key: 'basal_metabolic_rate', label: '기초대사량', unit: 'kcal' }
]);
export function healthRule(ok, message) { if (!ok) throw new ValidationError('HEALTH_INVALID', message); }
export function normalizeHealth(data, inbody = false) {
  healthRule(data && typeof data === 'object', '측정값을 확인하세요.');
  healthRule(typeof data.measured_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(data.measured_at) && Number.isFinite(Date.parse(data.measured_at)) && new Date(data.measured_at).toISOString().replace('.000Z', 'Z') === data.measured_at.replace('.000Z', 'Z'), '측정 일시를 확인하세요.');
  healthRule(data.memo == null || typeof data.memo === 'string', '메모는 문자로 입력하세요.');
  const result = { measured_at: data.measured_at, memo: data.memo ?? '' };
  healthRule(result.memo.length <= 2000, '메모는 2000자까지 입력하세요.');
  for (const metric of inbody ? HEALTH_METRICS : HEALTH_METRICS.slice(0, 1)) {
    const value = data[metric.key];
    if (value === null || value === undefined || value === '') {
      healthRule(inbody, '체중을 입력하세요.'); result[metric.key] = null; continue;
    }
    healthRule(typeof value === 'number' && Number.isFinite(value) && (metric.positive ? value > 0 : value >= 0) && (metric.max === undefined || value <= metric.max), `${metric.label} 값을 확인하세요.`);
    result[metric.key] = value;
  }
  if (inbody) {
    healthRule(typeof data.link_weight === 'boolean', '체중 연동 여부를 확인하세요.');
    healthRule(!data.link_weight || result.weight > 0, '체중 연동 시 체중을 입력하세요.');
    result.link_weight = data.link_weight;
  } else result.source = 'manual';
  return result;
}
export const measurementOrder = (a, b) => a.measured_at.localeCompare(b.measured_at) || a.id.localeCompare(b.id);
export function healthPeriod(period, now, timezone) {
  healthRule(['7', '30', '3m', 'all'].includes(period), '조회 기간을 확인하세요.');
  if (period === 'all') return { start: '', end: '\uffff' };
  const day = dateKey(now, timezone), start = new Date(`${day}T00:00:00Z`), end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  if (period === '3m') {
    const d = start.getUTCDate(); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 3);
    start.setUTCDate(Math.min(d, new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()));
  } else start.setUTCDate(start.getUTCDate() - Number(period) + 1);
  return { start: localDateTimeToUtcIso(`${start.toISOString().slice(0, 10)}T00:00`, timezone), end: localDateTimeToUtcIso(`${end.toISOString().slice(0, 10)}T00:00`, timezone) };
}
export function healthPoints(metric, weights, inbodies) {
  healthRule(HEALTH_METRICS.some((m) => m.key === metric), '그래프 지표를 확인하세요.');
  return (metric === 'weight' ? weights : inbodies).filter((r) => r.deleted_at === null && Number.isFinite(r[metric])).sort(measurementOrder).map((r) => ({ id: r.id, at: r.measured_at, value: r[metric] }));
}

// Preserve imported sub-minute precision when editing a measurement.
export function healthLocalInput(iso, timezone) { return `${utcIsoToLocalInput(iso, timezone)}:${new Date(iso).toISOString().slice(17, 23)}`; }
export function healthLocalToUtc(value, timezone) {
  const match = /^(.*T\d{2}:\d{2}:\d{2})\.(\d{1,3})$/.exec(value);
  return match ? new Date(Date.parse(localDateTimeToUtcIso(match[1], timezone)) + Number(match[2].padEnd(3, '0'))).toISOString() : localDateTimeToUtcIso(value, timezone);
}
