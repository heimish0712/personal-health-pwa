import { escapeHtml as e } from './exercise/exercise-view.js';
import { formatLocalDateTime } from '../core/datetime.js';
let thumbnailUrl = null;
export function releaseDashboardUrls() { if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl); thumbnailUrl = null; }
export async function renderDashboard({ root, services, navigate, isCurrent }) {
  const s = await services.dashboard.summary();
  if (!isCurrent()) return;
  const at = (value) => e(formatLocalDateTime(value, s.timezone));
  const link = (route, text) => `<button class="button button-secondary" data-dashboard-route="${e(route)}">${e(text)}</button>`;
  const section = document.createElement('div'); section.id = 'dashboard';
  section.innerHTML = `
    <section class="card"><h2>빠른 기록</h2><p>${e(s.today)}</p><div class="quick-records">${link('/exercise/log/new', '운동')}${link('/diet/log/new', '식단')}${link('/weight/log/new', '체중')}${link('/weight/inbody/new', '인바디')}</div></section>
    <section class="card" id="home-exercise"><h2>운동</h2><div class="dashboard-stats"><p>이번 주 (월~일)<br><strong id="home-exercise-count">${s.exerciseCount}회</strong></p><p>실제 운동시간<br><strong id="home-exercise-minutes">${s.exerciseMinutes}분</strong></p></div><h3>오늘 예정 운동</h3>${s.schedules.length ? s.schedules.map((x) => `<p>${at(x.scheduled_at)} · ${e(x.exerciseName)} ${link(`/exercise/schedule/${x.id}/edit`, '예약 열기')}</p>`).join('') : '<p>예정 운동 없음</p>'}<h3>최근 운동</h3>${s.recentExercise ? `<p>${e(s.recentExercise.exerciseName)} · ${at(s.recentExercise.performed_at)}</p>${link(`/exercise/log/${s.recentExercise.id}`, '운동기록 열기')}` : '<p>운동 기록 없음</p>'}</section>
    <section class="card" id="home-passes"><h2>활성 이용권</h2>${s.passes.length ? s.passes.map((p) => `<p>${e(p.exerciseName)} · ${e(p.name)}<br><strong>잔여 ${p.remaining} / ${p.total_count}회</strong><br>${e(p.start_date)} ~ ${e(p.expiry_date)}${p.expiry_date < s.today ? ' · 기간 만료' : p.start_date > s.today ? ' · 시작 전' : ''}</p>`).join('') : '<p>활성 이용권 없음</p>'}${link('/exercise/passes', '이용권 관리')}</section>
    <section class="card" id="home-diet"><h2>식단</h2><p>오늘 <strong id="home-diet-count">${s.dietCount}건</strong></p><h3>최근 식단</h3>${s.recentDiet ? `<p>${at(s.recentDiet.eaten_at)}</p><p class="diet-text">${e(s.recentDiet.content)}</p><div id="home-diet-thumbnail" class="diet-thumbnails"></div>${link(`/diet/log/${s.recentDiet.id}`, '식단 열기')}` : '<p>식단 기록 없음</p>'}</section>
    <section class="card" id="home-health"><h2>최근 측정</h2>${s.latest ? `<p>체중 <strong id="home-weight">${s.latest.weight} kg</strong> · ${s.delta == null ? '직전 측정 없음' : `직전 대비 ${s.delta > 0 ? '+' : ''}${s.delta} kg`}<br>${at(s.latest.measured_at)}</p>${link(s.latest.source === 'inbody' ? `/weight/inbody/${s.latest.source_ref_id}` : `/weight/log/${s.latest.id}`, '측정 기록 열기')}` : '<p>체중 기록 없음</p>'}<h3>최근 인바디</h3>${s.inbody ? `<p>${at(s.inbody.measured_at)}<br>골격근량 ${s.inbody.skeletal_muscle_mass ?? '-'} kg · 체지방률 ${s.inbody.body_fat_percentage ?? '-'}%</p>${link(`/weight/inbody/${s.inbody.id}`, '인바디 열기')}` : '<p>인바디 기록 없음</p>'}</section>`;
  root.append(section);
  section.querySelectorAll('[data-dashboard-route]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.dashboardRoute)));
  if (s.thumbnail) {
    try {
      const blob = await services.media.photoBlob(s.thumbnail.id, true);
      if (!isCurrent()) return;
      releaseDashboardUrls(); thumbnailUrl = URL.createObjectURL(blob);
      const img = document.createElement('img'); img.src = thumbnailUrl; img.alt = '최근 식단 사진';
      section.querySelector('#home-diet-thumbnail').append(img);
    } catch { if (isCurrent()) section.querySelector('#home-diet-thumbnail').textContent = '사진을 불러오지 못했습니다. 식단에서 확인하세요.'; }
  }
}
