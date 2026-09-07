import { localDateTimeToUtcIso } from '../core/datetime.js';
import { MEAL_TYPES } from '../core/media-rules.js';
import { activityCalendarEntries } from './activity-calendar.query.js';

export class CalendarService {
  constructor({ repositories, identityContext }) { Object.assign(this, { repositories, identityContext }); }
  async timezone() { return (await this.repositories.profile.getById(this.identityContext.getCurrentProfileId())).timezone ?? 'Asia/Seoul'; }
  async entries(startLocal, endLocal) {
    const timezone = await this.timezone(), r = this.repositories;
    const start = localDateTimeToUtcIso(startLocal, timezone), end = localDateTimeToUtcIso(endLocal, timezone);
    if (start >= end) throw new Error('조회 기간을 확인하세요.');
    const [activity, diets, weights, inbodies] = await Promise.all([
      activityCalendarEntries(r, start, end), r.dietLog.listByDateRange(start, end),
      r.weight.listByDateRange(start, end), r.inbody.listByDateRange(start, end)
    ]);
    const types = await Promise.all([...new Set(activity.map((x) => x.exercise_type_id))].map((id) => r.exerciseType.getByIdIncludingDeleted(id)));
    const names = new Map(types.filter(Boolean).map((x) => [x.id, x.name]));
    const linked = new Set(weights.filter((w) => w.source === 'inbody').map((w) => w.source_ref_id));
    const bodies = new Set(inbodies.map((b) => b.id));
    return [
      ...activity.map((x) => ({ ...x, title: `${names.get(x.exercise_type_id) ?? '운동'} · ${x.label}`, categories: ['exercise'] })),
      ...diets.map((x) => ({ id: x.id, at: x.eaten_at, title: `식단 · ${MEAL_TYPES[x.meal_type] ?? x.meal_type}`, memo: x.memo, healthValue: x.content, healthRoute: `/diet/log/${x.id}`, categories: ['diet'] })),
      ...inbodies.map((x) => ({ id: x.id, at: x.measured_at, title: linked.has(x.id) ? '인바디 · 체중 연동' : '인바디', memo: x.memo, healthValue: x.weight == null ? '체중 미입력' : `${x.weight} kg`, healthRoute: `/weight/inbody/${x.id}`, categories: linked.has(x.id) ? ['weight', 'inbody'] : ['inbody'] })),
      ...weights.filter((x) => !(x.source === 'inbody' && bodies.has(x.source_ref_id))).map((x) => ({ id: x.id, at: x.measured_at, title: x.source === 'inbody' ? '체중 · 인바디 연동' : '체중', memo: x.memo, healthValue: `${x.weight} kg`, healthRoute: x.source === 'inbody' ? `/weight/inbody/${x.source_ref_id}` : `/weight/log/${x.id}`, categories: ['weight'] }))
    ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
}
