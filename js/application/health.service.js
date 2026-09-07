import { localDateTimeToUtcIso } from '../core/datetime.js';
import { normalizeHealth, healthLocalToUtc, healthRule, healthPeriod, healthPoints } from '../core/health-rules.js';
import { NotFoundError } from '../core/errors.js';

export class HealthService {
  constructor({ repositories, command, identityContext, clock }) { Object.assign(this, { repositories, command, identityContext, clock }); }
  async timezone() { return (await this.repositories.profile.getById(this.identityContext.getCurrentProfileId())).timezone ?? 'Asia/Seoul'; }
  repo(kind) { healthRule(['weight', 'inbody'].includes(kind), '기록 종류를 확인하세요.'); return this.repositories[kind]; }
  async get(kind, id) { const row = await this.repo(kind).getByIdIncludingDeleted(id); if (!row) throw new NotFoundError('ENTITY_NOT_FOUND', '기록을 찾을 수 없습니다.'); if (kind === 'inbody' && row.link_weight === undefined) { const linked = await this.repositories.weight.findByInbody(id); return { ...row, link_weight: Boolean(linked && (row.deleted_at !== null || linked.deleted_at === null)) }; } return row; }
  async normalize(input, inbody) {
    const measured_at = input.measured_at_local !== undefined ? healthLocalToUtc(input.measured_at_local, await this.timezone()) : input.measured_at;
    return normalizeHealth({ ...input, measured_at }, inbody);
  }
  async manual(id) { const row = await this.get('weight', id); healthRule(row.source !== 'inbody', '연결 체중은 원본 인바디 화면에서 변경하세요.'); return row; }
  async saveWeight(input, id, expectedRevision) {
    const data = await this.normalize(input, false);
    if (!id) return this.repositories.weight.create(data);
    await this.manual(id); return this.repositories.weight.update(id, data, expectedRevision);
  }
  async deleteWeight(id, revision) { await this.manual(id); return this.repositories.weight.softDelete(id, revision); }
  async restoreWeight(id, revision) { const row = await this.manual(id); normalizeHealth(row); return this.repositories.weight.restore(id, revision); }
  async saveInbody(input, id, expectedRevision) { return this.command.saveInbody({ id, data: await this.normalize(input, true), expectedRevision }); }
  deleteInbody(id, expectedRevision) { return this.command.deleteInbody({ id, expectedRevision }); }
  restoreInbody(id, expectedRevision) { return this.command.restoreInbody({ id, expectedRevision }); }
  async range(start, end, options) { const [weights, inbodies] = await Promise.all([this.repositories.weight.listByDateRange(start, end, options), this.repositories.inbody.listByDateRange(start, end, options)]); return { weights, inbodies }; }
  async list(period = '30', options = {}) { const bounds = healthPeriod(period, this.clock.nowIso(), await this.timezone()); return { ...await this.range(bounds.start, bounds.end, options), ...bounds }; }
  async graph(metric, period = '30') { const { weights, inbodies } = await this.list(period); return healthPoints(metric, weights, inbodies); }
  async summary() {
    const [weights, inbodies] = await Promise.all([this.repositories.weight.latest(2), this.repositories.inbody.latest(1)]);
    return { latest: weights[0] ?? null, previous: weights[1] ?? null, delta: weights.length > 1 ? Math.round((weights[0].weight - weights[1].weight) * 1000) / 1000 : null, inbody: inbodies[0] ?? null };
  }
  async calendarEntries(startLocal, endLocal) {
    const timezone = await this.timezone();
    const { weights, inbodies } = await this.range(localDateTimeToUtcIso(startLocal, timezone), localDateTimeToUtcIso(endLocal, timezone));
    const ids = new Set(inbodies.map((r) => r.id));
    const result = inbodies.map((r) => ({ id: r.id, at: r.measured_at, label: weights.some((w) => w.source === 'inbody' && w.source_ref_id === r.id) ? '인바디 · 체중 연동' : '인바디', memo: r.memo, healthRoute: `/weight/inbody/${r.id}`, healthValue: r.weight == null ? '체중 미입력' : `${r.weight} kg` }));
    for (const r of weights) if (!(r.source === 'inbody' && ids.has(r.source_ref_id))) result.push({ id: r.id, at: r.measured_at, label: r.source === 'inbody' ? '체중 · 인바디 연동' : '체중', memo: r.memo, healthRoute: r.source === 'inbody' ? `/weight/inbody/${r.source_ref_id}` : `/weight/log/${r.id}`, healthValue: `${r.weight} kg` });
    return result.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
}
