import { escapeHtml as e } from '../exercise/exercise-view.js';
import { googleMessage } from '../../core/google-calendar.js';
export async function mountGoogleCalendar(root, { services, isCurrent }) {
  const service = services.googleCalendar;
  if (!service) return;
  const section = document.createElement('section'); section.className = 'card'; section.id = 'google-calendar-settings'; root.append(section);
  section.innerHTML = `<h2>Google Calendar</h2><p>로컬 운동 예약을 선택한 Google 계정의 기본 캘린더에 단방향으로 전송합니다. 메모는 전송하지 않습니다. Google에서 수정해도 앱으로 가져오지 않습니다.</p>
    <p>ON 이후 생성·수정·취소한 예약만 전송합니다. 기존 예약은 수정 저장으로 전송할 수 있습니다. 다른 기기에서 복원하면 기본 OFF이며 대기열은 가져오지 않습니다.</p>
    <div class="form-field"><label for="google-client-id">Google Web Client ID (공개 설정)</label><input id="google-client-id" type="text" value="${e(globalThis.APP_CONFIG.GOOGLE_CLIENT_ID ?? '')}" autocomplete="off" placeholder="…apps.googleusercontent.com"></div>
    <p>Client ID는 인증 비밀이 아닙니다. 이 입력은 현재 화면에서만 유지됩니다. 매번 입력하지 않으려면 배포 설정에 등록하세요.</p>
    <div class="form-actions"><button class="button button-secondary" id="google-prepare">1. Google 연결 준비</button>
    <button class="button" id="google-connect" disabled>2. 연결·재인증 후 ON</button>
    <button class="button button-secondary" id="google-off">OFF</button>
    <button class="button" id="google-retry">대기 항목 재시도</button>
    <button class="button button-secondary" id="google-status-refresh">상태 새로고침</button></div>
    <p id="google-status" role="status"></p><p id="google-error" role="alert"></p>
    <p>토큰은 이 실행 세션 메모리에만 보관됩니다. 재실행·만료 후에는 연결·재인증이 필요합니다. 같은 Google 계정을 선택하세요. OFF는 새 전송을 중단하며 이미 전송한 일정과 연결 이력을 삭제하거나 Google 권한을 철회하지 않습니다. 진행 중인 요청은 완료될 수 있습니다.</p>`;
  const refresh = async () => {
    const state = await service.status(); if (!isCurrent()) return;
    section.querySelector('#google-status').textContent = `${state.enabled ? 'ON' : 'OFF'} · ${state.authorized ? '현재 세션 인증됨' : '재인증 필요'} · 대기 ${state.pending}건 · 최근 성공 ${state.lastSuccess ?? '없음'}`;
    section.querySelector('#google-error').textContent = state.lastError ?? '';
  };
  const bind = (id, work) => section.querySelector(id).onclick = async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { await work(); await refresh(); }
    catch (error) { if (isCurrent()) section.querySelector('#google-error').textContent = googleMessage(error); }
    finally { button.disabled = false; }
  };
  bind('#google-prepare', async () => { if (!section.querySelector('#google-client-id').value.trim()) throw new Error('CLIENT_ID_REQUIRED'); await service.prepare(); section.querySelector('#google-connect').disabled = false; });
  bind('#google-connect', () => service.connect(section.querySelector('#google-client-id').value.trim()));
  bind('#google-off', () => service.disable()); bind('#google-retry', () => service.retry()); bind('#google-status-refresh', refresh);
  await refresh();
}
