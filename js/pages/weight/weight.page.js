import { initialRecordTime } from '../../router.js';
import { HEALTH_METRICS, healthLocalInput, healthPoints, measurementOrder } from '../../core/health-rules.js';
import { nowLocalInput, utcIsoToLocalInput, formatLocalDateTime } from '../../core/datetime.js';
import { escapeHtml as e } from '../exercise/exercise-view.js';
import { clearNavigationGuard, setNavigationGuard } from '../../router.js';

const metricText = (r) => HEALTH_METRICS.filter((m) => r[m.key] != null).map((m) => `${m.label} ${r[m.key]} ${m.unit}`).join(' · ');
const deltaText = (n) => n == null ? '이전 측정 없음' : `직전 대비 ${n > 0 ? '+' : ''}${n} kg`;
function actions(context, selector, work) {
  context.root.querySelectorAll(selector).forEach((button) => button.addEventListener('click', async () => {
    if (button.disabled) return; button.disabled = true;
    try { await work(button); } catch (error) { if (context.isCurrent()) context.showError('요청을 처리하지 못했습니다.', error); }
    finally { button.disabled = false; }
  }));
}
export function renderHealthGraph(points, metric, timezone) {
  if (!points.length) return '<p class="empty-state">이 기간에 측정값이 없습니다.</p>';
  const minT = Date.parse(points[0].at), maxT = Date.parse(points.at(-1).at);
  let min = Infinity, max = -Infinity;
  for (const p of points) { min = Math.min(min, p.value); max = Math.max(max, p.value); }
  const padding = (max - min) * 0.1 || Math.max(Math.abs(min) * 0.02, 0.1); min -= padding; max += padding;
  const x = (p) => maxT === minT ? 180 : 48 + (Date.parse(p.at) - minT) / (maxT - minT) * 270;
  const y = (p) => 170 - (p.value - min) / (max - min) * 140;
  const line = points.map((p) => `${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' ');
  return `<svg class="health-graph" viewBox="0 0 350 212" role="img" aria-label="${e(metric.label)} 변화 그래프, ${points.length}회 측정"><title>${e(metric.label)} (${e(metric.unit)}) · 실제 측정 시각 순서</title><path d="M48 20V170H318" fill="none" stroke="currentColor" opacity=".4"/><text x="2" y="28">${max.toFixed(1)}</text><text x="2" y="170">${min.toFixed(1)}</text><polyline points="${line}" fill="none" stroke="#0f766e" stroke-width="2"/>${points.map((p) => `<circle data-point="${p.id}" cx="${x(p)}" cy="${y(p)}" r="4" fill="#0f766e"><title>${e(formatLocalDateTime(p.at, timezone))}: ${p.value} ${e(metric.unit)}</title></circle>`).join('')}<text x="48" y="198">${e(utcIsoToLocalInput(points[0].at, timezone).slice(5, 10))}</text><text x="318" y="198" text-anchor="end">${e(utcIsoToLocalInput(points.at(-1).at, timezone).slice(5, 10))}</text></svg><details><summary>측정값 보기 (${points.length}건)</summary><ol class="health-values">${points.map((p) => `<li>${e(formatLocalDateTime(p.at, timezone))} · ${p.value} ${e(metric.unit)}</li>`).join('')}</ol></details>`;
}
export async function renderWeightRoute(route, context) {
  const parts = route.split('/');
  if (parts.length === 2) return renderWeightHome(context);
  const kind = parts[2] === 'inbody' ? 'inbody' : 'weight', id = parts[3] === 'new' ? null : parts[3];
  if (!id || parts[4] === 'edit') return renderHealthForm(context, kind, id);
  return renderHealthDetail(context, kind, id);
}
export async function renderWeightHome(context) {
  const { root, services, isCurrent, setTitle } = context, health = services.health;
  setTitle('체중 · 인바디');
  const [timezone, summary] = await Promise.all([health.timezone(), health.summary()]);
  if (!isCurrent()) return;
  root.innerHTML = `<section class="card"><h2>최근 체중</h2><p id="latest-weight">${summary.latest ? `<strong>${summary.latest.weight} kg</strong> · ${e(deltaText(summary.delta))}<br>${e(formatLocalDateTime(summary.latest.measured_at, timezone))}` : '체중 기록이 없습니다.'}</p><div class="form-actions"><button class="button" data-route="/weight/log/new">+ 체중</button><button class="button button-secondary" data-route="/weight/inbody/new">+ 인바디</button></div></section><section class="card"><h2>변화 그래프</h2><div class="form-field"><label for="health-metric">지표</label><select id="health-metric">${HEALTH_METRICS.map((m) => `<option value="${m.key}">${m.label}${m.unit ? ` (${m.unit})` : ''}</option>`).join('')}</select></div><div class="form-field"><label for="health-period">기간</label><select id="health-period"><option value="7">7일</option><option value="30" selected>30일</option><option value="3m">3개월</option><option value="all">전체</option></select></div><p class="section-description">체중 그래프는 체중 기록만 사용합니다. 같은 날 여러 측정도 각각 표시합니다.</p><div id="health-chart" aria-live="polite"></div></section><section class="card"><h2>측정 기록</h2><label><input id="health-trash" type="checkbox"> 삭제된 기록 포함</label><p>위 기간에 해당하는 기록입니다. 인바디 연동 체중은 원본에서 관리합니다.</p><div id="health-list" aria-live="polite"></div></section>`;
  actions(context, '[data-route]', (b) => context.navigate(b.dataset.route));
  let sequence = 0;
  const draw = async () => {
    const token = ++sequence, metric = root.querySelector('#health-metric').value;
    const data = await health.list(root.querySelector('#health-period').value, { includeDeleted: root.querySelector('#health-trash').checked });
    if (!isCurrent() || token !== sequence) return;
    root.querySelector('#health-chart').innerHTML = renderHealthGraph(healthPoints(metric, data.weights, data.inbodies), HEALTH_METRICS.find((m) => m.key === metric), timezone);
    const records = [...data.weights.map((r) => ({ ...r, kind: 'weight' })), ...data.inbodies.map((r) => ({ ...r, kind: 'inbody' }))].sort((a, b) => measurementOrder(b, a));
    root.querySelector('#health-list').innerHTML = records.length ? records.map((r) => `<article class="health-record" data-health-record="${r.id}"><h3>${r.kind === 'inbody' ? '인바디' : '체중'}${r.source === 'inbody' ? ' · 인바디 연동' : ''}${r.deleted_at ? ' · 삭제됨' : ''}</h3><p>${e(formatLocalDateTime(r.measured_at, timezone))}</p><p>${e(metricText(r))}</p><p class="health-memo">${e(r.memo)}</p><button class="button button-secondary" data-open-health="/weight/${r.kind === 'inbody' ? 'inbody' : 'log'}/${r.id}">${r.source === 'inbody' ? '연결 정보' : '기록 열기'}</button></article>`).join('') : '<p>이 기간에 기록이 없습니다.</p>';
    actions(context, '[data-open-health]', (b) => context.navigate(b.dataset.openHealth));
  };
  for (const id of ['health-metric', 'health-period', 'health-trash']) root.querySelector(`#${id}`).addEventListener('change', () => { void draw().catch((error) => { if (isCurrent()) context.showError('기록 조회에 실패했습니다.', error); }); });
  await draw();
}
export async function renderHealthDetail(context, kind, id) {
  const { root, services, isCurrent, setTitle } = context, health = services.health;
  const [row, timezone] = await Promise.all([health.get(kind, id), health.timezone()]);
  if (!isCurrent()) return;
  setTitle(kind === 'inbody' ? '인바디 기록' : '체중 기록');
  const linked = kind === 'weight' && row.source === 'inbody';
  root.innerHTML = `<section class="card"><h2>${kind === 'inbody' ? '인바디' : '체중'}${row.deleted_at ? ' · 삭제됨' : ''}</h2><p>${e(formatLocalDateTime(row.measured_at, timezone))}</p><p>${e(metricText(row)) || '입력된 측정값 없음'}</p><p class="health-memo">${e(row.memo)}</p>${linked ? `<p>이 체중은 인바디가 원본입니다. 수정·삭제·복원은 원본 인바디에서 진행하세요. 연동 OFF로 삭제된 경우 다시 ON으로 복원합니다.</p><button class="button" id="health-origin">원본 인바디 열기</button>` : `<p>${kind === 'inbody' ? (row.link_weight ? '체중 연동 ON' : '체중 연동 OFF') : '일반 체중 기록'}</p><div class="form-actions">${row.deleted_at ? '<button class="button" id="health-restore">복원</button>' : '<button class="button" id="health-edit">수정</button><button class="button button-danger" id="health-delete">삭제</button>'}</div>`}</section><button class="button button-secondary" id="health-back">체중 목록</button>`;
  actions(context, '#health-back', () => context.navigate(context.returnRoute ?? '/weight'));
  actions(context, '#health-origin', () => context.navigate(`/weight/inbody/${row.source_ref_id}${row.deleted_at ? '' : '/edit'}`));
  actions(context, '#health-edit', () => context.navigate(`/weight/${kind === 'weight' ? 'log' : 'inbody'}/${id}/edit`));
  for (const operation of ['delete', 'restore']) actions(context, `#health-${operation}`, async () => {
    if (operation === 'delete' && !window.confirm(kind === 'inbody' ? '인바디와 연결 체중을 함께 삭제할까요?' : '체중 기록을 삭제할까요?')) return;
    await health[`${operation}${kind === 'weight' ? 'Weight' : 'Inbody'}`](id, row.revision);
    if (!isCurrent()) return; context.showToast(operation === 'delete' ? '삭제했습니다. 삭제된 기록에서 복원할 수 있습니다.' : '복원했습니다.'); await renderHealthDetail(context, kind, id);
  });
}
export async function renderHealthForm(context, kind, id) {
  const { root, services, isCurrent, setTitle } = context, health = services.health;
  const [row, timezone] = await Promise.all([id ? health.get(kind, id) : null, health.timezone()]);
  if (!isCurrent()) return;
  if (row?.deleted_at) return renderHealthDetail(context, kind, id);
  if (kind === 'weight' && row?.source === 'inbody') { context.navigate(`/weight/inbody/${row.source_ref_id}/edit`); return; }
  const inbody = kind === 'inbody'; setTitle(`${inbody ? '인바디' : '체중'} ${id ? '수정' : '추가'}`);
  const metrics = inbody ? HEALTH_METRICS : HEALTH_METRICS.slice(0, 1);
  root.innerHTML = `<form id="health-form" class="form-stack"><section class="card"><div class="form-field"><label for="health-at">측정 일시</label><input id="health-at" type="datetime-local" step="0.001" required value="${row ? healthLocalInput(row.measured_at, timezone) : initialRecordTime(context, nowLocalInput(timezone))}"></div>${metrics.map((m) => `<div class="form-field"><label for="health-${m.key}">${m.label} ${e(m.unit)}${inbody ? ' (선택)' : ''}</label><input id="health-${m.key}" type="number" step="any" min="0" ${m.max ? `max="${m.max}"` : ''} ${inbody ? '' : 'required'} value="${row?.[m.key] ?? ''}"></div>`).join('')}<div class="form-field"><label for="health-memo">메모</label><textarea id="health-memo" maxlength="2000">${e(row?.memo ?? '')}</textarea></div>${inbody ? `<label><input type="checkbox" id="health-link" ${row?.link_weight ? 'checked' : ''}> 이 체중을 체중 기록에도 추가</label><p>연동 시 체중·측정 일시·메모가 함께 저장됩니다. OFF로 바꾸면 연결 체중을 삭제하고, 다시 ON으로 바꾸면 같은 기록을 복원합니다.</p>` : ''}<p id="health-form-error" class="warning-text" role="alert"></p></section><div class="form-actions"><button type="button" class="button button-secondary" id="health-cancel">취소</button><button type="submit" class="button" id="health-save">저장</button></div></form>`;
  const form = root.querySelector('#health-form'); let dirty = false, busy = false;
  form.addEventListener('input', () => { dirty = true; }); form.addEventListener('change', () => { dirty = true; });
  setNavigationGuard(() => !busy && (!dirty || window.confirm('저장하지 않은 내용을 버리고 이동할까요?')));
  actions(context, '#health-cancel', () => context.navigate(context.returnRoute ?? '/weight'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy) return; busy = true; root.querySelector('#health-save').disabled = true;
    try {
      const input = { measured_at_local: root.querySelector('#health-at').value, memo: root.querySelector('#health-memo').value };
      for (const m of metrics) { const element = root.querySelector(`#health-${m.key}`); if (element.validity.badInput) throw new Error(`${m.label} 값을 확인하세요.`); input[m.key] = element.value === '' ? null : Number(element.value); }
      if (inbody) input.link_weight = root.querySelector('#health-link').checked;
      const saved = await health[inbody ? 'saveInbody' : 'saveWeight'](input, id, row?.revision);
      if (!isCurrent()) return; dirty = false; busy = false; clearNavigationGuard(); context.showToast('저장했습니다.'); context.navigate(context.returnRoute ?? `/weight/${inbody ? 'inbody' : 'log'}/${saved.id}`);
    } catch (error) { if (isCurrent()) { root.querySelector('#health-form-error').textContent = error.message; context.showError('저장에 실패했습니다.', error); } }
    finally { busy = false; const button = form.querySelector('#health-save'); if (button) button.disabled = false; }
  });
}
export async function renderHomeHealth(root, health, isCurrent) {
  const [summary, timezone] = await Promise.all([health.summary(), health.timezone()]);
  if (!isCurrent()) return;
  const card = document.createElement('section'); card.className = 'card'; card.id = 'home-health';
  card.innerHTML = `<h2>최근 측정</h2><p>${summary.latest ? `체중 <strong>${summary.latest.weight} kg</strong> · ${e(deltaText(summary.delta))}<br>${e(formatLocalDateTime(summary.latest.measured_at, timezone))}` : '체중 기록 없음'}</p><h3>최근 인바디</h3><p>${summary.inbody ? `${e(formatLocalDateTime(summary.inbody.measured_at, timezone))}<br>${e(metricText(summary.inbody)) || '입력된 측정값 없음'}` : '인바디 기록 없음'}</p><a class="button button-secondary" href="#/weight">체중 · 인바디 열기</a>`;
  root.append(card);
}
