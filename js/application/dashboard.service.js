import { getLocalWeekUtcRange, localDateTimeToUtcIso, nowLocalInput } from '../core/datetime.js';

export class DashboardService {
  constructor({ repositories, identityContext, clock }) { Object.assign(this, { repositories, identityContext, clock }); }
  async summary() {
    const r = this.repositories;
    const timezone = (await r.profile.getById(this.identityContext.getCurrentProfileId())).timezone ?? 'Asia/Seoul';
    const today = nowLocalInput(timezone, this.clock.nowIso()).slice(0, 10);
    const tomorrow = new Date(`${today}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const start = localDateTimeToUtcIso(`${today}T00:00`, timezone), end = localDateTimeToUtcIso(`${tomorrow.toISOString().slice(0, 10)}T00:00`, timezone);
    const week = getLocalWeekUtcRange(this.clock.nowIso(), timezone);
    const [schedules, logs, recent, diets, recentDiets, weights, inbodies, passes] = await Promise.all([
      r.exerciseSchedule.listByDateRange(start, end), r.exerciseLog.listByDateRange(week.start, week.end), r.exerciseLog.latest(1),
      r.dietLog.listByDateRange(start, end), r.dietLog.latest(1), r.weight.latest(2), r.inbody.latest(1), r.pass.listActive()
    ]);
    const activePasses = await Promise.all(passes.map(async (p) => ({ ...p, remaining: p.total_count - (await r.passUsage.listByPass(p.id)).filter((u) => u.status === 'used').reduce((n, u) => n + u.used_count, 0) })));
    const upcoming = schedules.filter((s) => s.status === 'scheduled');
    const types = await Promise.all([...new Set([...upcoming, ...recent, ...activePasses].map((x) => x.exercise_type_id))].map((id) => r.exerciseType.getByIdIncludingDeleted(id)));
    const names = new Map(types.filter(Boolean).map((x) => [x.id, x.name]));
    const named = (x) => x ? { ...x, exerciseName: names.get(x.exercise_type_id) ?? '운동' } : null;
    const diet = recentDiets[0] ?? null;
    return {
      today, timezone, week, schedules: upcoming.map(named), exerciseCount: logs.length,
      exerciseMinutes: logs.reduce((n, x) => n + (Number(x.values?.duration_minutes) || 0), 0), recentExercise: named(recent[0]),
      passes: activePasses.map(named), dietCount: diets.length, recentDiet: diet,
      thumbnail: diet ? (await r.dietPhoto.listByDiet(diet.id))[0] ?? null : null,
      latest: weights[0] ?? null, previous: weights[1] ?? null,
      delta: weights.length > 1 ? Math.round((weights[0].weight - weights[1].weight) * 1000) / 1000 : null,
      inbody: inbodies[0] ?? null
    };
  }
}
