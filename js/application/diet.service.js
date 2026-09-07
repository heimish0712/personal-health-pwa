import { healthLocalToUtc } from '../core/health-rules.js';
import { MEAL_TYPES, normalizeDiet, mediaRule } from '../core/media-rules.js';
export class DietService {
  constructor({ repositories, command, media, identityContext }) { Object.assign(this,{repositories,command,media,identityContext}); }
  async timezone() { return (await this.repositories.profile.getById(this.identityContext.getCurrentProfileId())).timezone ?? 'Asia/Seoul'; }
  async get(id) { const row = await this.repositories.dietLog.getByIdIncludingDeleted(id); mediaRule(row,'현재 프로필에서 식단을 찾을 수 없습니다.'); return { ...row, photos: await this.repositories.dietPhoto.listByDiet(id, { includeDeleted: row.deleted_at !== null }) }; }
  async save(input, id, expectedRevision, keepPhotoIds = [], additions = []) { const eaten_at = input.eaten_at_local !== undefined ? healthLocalToUtc(input.eaten_at_local, await this.timezone()) : input.eaten_at; return this.command.saveDiet({ id, expectedRevision, data: normalizeDiet({...input,eaten_at}),keepPhotoIds,additions }); }
  delete(id, expectedRevision) { return this.command.deleteDiet({id,expectedRevision}); }
  restore(id, expectedRevision) { return this.command.restoreDiet({id,expectedRevision}); }
  async range(startLocal, endLocal, options) { const tz = await this.timezone(); return this.repositories.dietLog.listByDateRange(healthLocalToUtc(startLocal,tz),healthLocalToUtc(endLocal,tz),options); }
  async day(day, options) { const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate()+1); const rows = await this.range(`${day}T00:00`,`${next.toISOString().slice(0,10)}T00:00`,options); return Promise.all(rows.sort((a,b) => a.eaten_at.localeCompare(b.eaten_at) || a.id.localeCompare(b.id)).map(async (r) => ({...r,photos:r.deleted_at ? [] : await this.repositories.dietPhoto.listByDiet(r.id)}))); }
  async calendarEntries(start,end) { return (await this.range(start,end)).map((r) => ({ id:r.id, at:r.eaten_at, label:`식단 · ${MEAL_TYPES[r.meal_type] ?? r.meal_type}`, memo:r.memo, healthRoute:`/diet/log/${r.id}`, healthValue:r.content ?? '' })); }
}
