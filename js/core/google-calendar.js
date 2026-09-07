export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';

export const GOOGLE_APP = 'personal-health-pwa';

export const integrationKey = (profileId) => `google_calendar:${profileId}`;

export const eventProperties = (profileId, scheduleId) => ({ app: GOOGLE_APP, profileUUID: profileId, scheduleUUID: scheduleId });

export const eventId = (profileId, scheduleId, generation = 1) => `ph${profileId.replaceAll('-', '')}${scheduleId.replaceAll('-', '')}g${generation}`;

export function calendarEvent(schedule, profile, type) {

  const duration = schedule.expected_duration_minutes;

  if (!Number.isFinite(duration) || duration <= 0 || duration > 1440 || !Number.isFinite(Date.parse(schedule.scheduled_at))) throw new Error('INVALID_DURATION');

  new Intl.DateTimeFormat('en', { timeZone: profile.timezone }).format();

  return { summary: type.name, description: '개인 건강 기록 앱의 운동 예약',

    start: { dateTime: schedule.scheduled_at, timeZone: profile.timezone },

    end: { dateTime: new Date(Date.parse(schedule.scheduled_at) + duration * 60000).toISOString(), timeZone: profile.timezone },

    extendedProperties: { private: eventProperties(profile.id, schedule.id) } };

}

export const GOOGLE_MESSAGES = Object.freeze({

  AUTH_REQUIRED: 'Google 재인증이 필요합니다. 연결·재인증 후 재시도를 눌러 주세요.',

  OAUTH_FAILED: 'Google 인증을 완료하지 못했습니다. 팝업 허용과 동의 화면을 확인해 주세요.',

  CLIENT_ID_REQUIRED: 'Google Web Client ID를 먼저 설정해 주세요.',

  OFFLINE: '오프라인입니다. 로컬 예약은 보존되며 온라인에서 재시도할 수 있습니다.',

  REMOTE_FAILED: 'Google 전송에 실패했습니다. 로컬 예약은 보존됩니다. 잠시 후 재시도하세요.',

  INVALID_DURATION: '예약의 예정 시간을 0 초과 1440 이하 분으로 수정해 주세요.',

  FOREIGN_EVENT: '연결된 Google 일정의 앱 식별 정보가 다릅니다. 자동 변경을 중단했습니다.',

  SUPERSEDED: '전송 중 로컬 상태가 변경되었습니다. 최신 예약 상태로 재시도할 수 있습니다.',
  LOCK_UNAVAILABLE: '다른 작업이 진행 중이거나 안전한 동시 실행을 지원하지 않습니다. 나중에 다시 시도하세요.'

});

export const googleMessage = (error) => GOOGLE_MESSAGES[error?.message] ?? (error?.code === 'MAINTENANCE_BUSY' ? GOOGLE_MESSAGES.LOCK_UNAVAILABLE : null) ?? GOOGLE_MESSAGES.REMOTE_FAILED;

