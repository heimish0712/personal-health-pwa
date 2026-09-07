# v0.5.0 이용권·예약 구현 경계

DB_VERSION 1 / SCHEMA_VERSION 1 / SEED_VERSION 1 / Backup Format 1. 누적 Migration 없음.

## 데이터

- exercise_logs.pass_id: 선택한 이용권 UUID 또는 null. 기존 누락 행은 active usage에서 추론한다. 삭제는 선택을 보존하고 해제는 null.
- pass_usage_logs: 기존 (profile_id,pass_id,exercise_log_id) UNIQUE 유지. 재적용은 동일 ID와 created_at 보존, revision 증가 및 status=used. 다른 pass의 cancelled 행은 보존한다. 완전한 이벤트 스트림은 아니며 매 재활성화 이벤트를 별도 행으로 누적하지 않는다.
- schedules.completed_exercise_log_id: 최초 완료 전에는 키 생략. 완료 취소 뒤에도 연결 유지. completion_revision은 마지막 완료가 받아들인 expectedRevision이며 신규 요청과 오래된 재시도를 구분한다.
- 저장하는 잔여 카운터 없음. deleted_at=null/status=used인 원장 합계만 사용한다.

## 업무 경계

UI → ExerciseLogService 또는 PassScheduleService → ActivityCommandContract → IndexedDbActivityCommand.
각 Command는 profiles/types/templates/logs/passes/usages/schedules를 동일 readwrite transaction 범위에 두어 타입·양식·이용권 상태 검사와 쓰기를 직렬화한다. 외부 비동기 작업 없이 IDB 요청과 동기 검증만 실행한다. 따라서 다른 탭의 마지막 횟수 차감과 이용권 한도 수정도 경쟁하지 않는다. 향후 RPC 구현은 같은 입력/결과와 expectedRevision semantics를 보존해야 한다.

운동 입력은 Service에서 정규화하고 Command에서 현재 관계·원장을 다시 검증한다. type/template의 기존 CRUD와 일반 Repository 계약은 유지한다. 원장 쓰기는 제품 Service/UI에서 직접 제공하지 않는다. 테스트 fixture만 원시 Repository를 사용할 수 있다.

- 동일 pass 유효 사용이 이미 있으면 신규 차감 없음. pass가 inactive여도 기존 차감의 메모 수정은 허용한다.
- 새 차감/복원/다른 pass 전환에는 active, 운동 일치, 실제 Profile 현지 운동일, capacity 검증.
- 예약 완료 취소는 모든 최신 linked log 변경도 함께 삭제 처리한다. 연결 기록 복원은 예약 재완료로만 수행한다.
- 재완료는 과거 Template을 사용하며 폼에 입력한 실제 운동값으로 같은 기록을 복원한다. 예약에서 원래 운동 종류를 변경하려면 새 예약을 만든다.
- 실패 주입 지점 after-log / after-cancel / after-usage / after-schedule에서 예외가 나면 전체 rollback.

## 조회와 백업

BaseScopedRepository 무변경. 도메인 Repository의 listByDateRange/listByExercise/listByPass/listByLog가 기존 compound index를 사용한다. 캘린더와 주간 요약은 UTC 반열린 기간 조회, 화면 종료일은 포함이다. 이용권 목록은 운동별 index에서 읽고 사용원장에서 잔여량을 계산한다.
Backup v1은 새 JSON 필드를 그대로 보존하며 관계/중복 active 원장을 검증한다. v0.4 JSON(신규 필드 없음)도 계속 읽는다.

## 범위

이 버전의 캘린더는 기간별 예약·운동 목록이다. 식단/체중과 월간 통합 요약, 반복 예약·알림·결제·Sync는 후속 작업이다.
