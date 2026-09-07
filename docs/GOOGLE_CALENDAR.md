# Google Calendar v0.10.0

## 범위와 설정

운동 예약만 Google primary calendar로 단방향 투영한다. 운동기록·건강 메모·식단·사진·체중·인바디를 전송하지 않는다. Google에서 바꾼 값을 로컬로 가져오지 않는다. ON 전의 기존 예약은 일괄 전송하지 않으며 ON 후 수정 저장하면 대상이 된다. 이미 완료된 예약은 별도의 일괄 전송 대상이 아니다.

첨부 명세의 Client ID는 자리표시자이며 실제 Web Client ID/origin은 미제공이다. `js/config.js`의 `GOOGLE_CLIENT_ID` 기본값은 빈 문자열이다. 공개 ID를 여기에 넣고 배포하거나 설정 화면에서 이번 연결에 사용할 ID를 입력한다(입력값은 저장하지 않음). 잘못된/누락 ID는 명시적 안내하며 앱의 로컬 기능은 동작한다.

Google Cloud 프로젝트에서 Calendar API를 사용 설정하고 Web OAuth client와 동의 화면/테스트 계정을 구성한다. Authorized JavaScript origins에는 실제 앱 origin(예: https://ACCOUNT.github.io)을 등록하며 저장소 경로는 origin에 넣지 않는다. localhost 테스트 시 실제 사용 origin/port도 등록한다. Client secret은 복사하지 않는다. 공개 서비스 전환/Google 검증 여부는 해당 프로젝트 운영자가 확인한다. [Google Web client 설정](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)을 따른다.

설정 → `1. Google 연결 준비`는 GIS script를 필요한 시점에만 읽는다. 이어서 `2. 연결·재인증 후 ON` 클릭이 await 이전에 requestAccessToken을 직접 호출해 사용자 팝업 gesture를 유지한다. 정확한 scope는 `https://www.googleapis.com/auth/calendar.events.owned`, calendar는 `primary`. 권한 승인 여부를 hasGrantedAllScopes로 확인한다. 액세스 토큰/만료시각/인증 Profile은 private memory이며 영구 저장·로그·백업으로 전달하지 않는다. [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

OFF는 큐 dispatch 중단이며 revoke가 아니다. 이미 전송된 Google 일정은 남고, 이미 HTTP 요청이 전송됐다면 그 요청은 완료될 수 있다. 매 HTTP 호출 전 ON/token/Profile 및 desired version을 재확인한다. 재실행 시 ON은 유지되지만 token이 없어 재인증한다. 같은 Profile을 다른 Google 계정에 연결하면 primary 대상 자체가 달라지므로 같은 계정을 선택해야 한다. 이 버전은 계정 간 이전/병합이나 account identity binding을 구현하지 않는다.

## 업무 경계

- Page → PassScheduleService → ActivityCommand. 저장 transaction에서 exercise_schedules와 calendar_outbox를 함께 갱신한다. 실패 checkpoint 뒤 둘 다 롤백된다.
- commit → GoogleCalendarService 비차단 시도. 인증 없음/오프라인/잠금 충돌은 예약 반환값과 분리한다. UI가 대기 상태를 조회해 로컬 저장 성공 메시지를 표시한다. 자동 무인 OAuth 갱신 없음.
- 설정 retry/connect → CalendarIntegrationCommand의 Profile+status 인덱스 조회 → REST gateway → acknowledgement Command. remote HTTP는 어떤 IDB transaction 안에서도 실행하지 않는다.
- acknowledgement는 link + outbox 완료 + 최근 성공을 원자적으로 갱신한다. 최신 version과 다르면 link만 보존하고 새로운 pending은 유지한다.
- Web Locks maintenance exclusive: 한 기기의 여러 탭 전송, shared backup/restore/reset, exclusive GC 사이 상호 배제. 전송 중에도 일반 로컬 예약 CRUD는 허용한다. 잠금 미지원에서는 원격 실행을 거부한다. backup/restore는 원격 요청 중 busy 안내 후 다시 실행한다.
- 다른 기기 사이의 전역 직렬화는 이 버전 범위 밖이다. 동일 예약의 결정적 ID와 검색이 중복 생성 방어를 제공하며 상충 수정의 기기간 우선순위는 향후 Sync 설계 대상이다.

## DB / portable 계약

APP/cache 0.10.0, DB3, Schema2, Seed1, Backup Format2(JSON v1 계속 사용).

| Store | 키 / Index | 보관 정책 |
|---|---|---|
| calendar_event_links | UUID id; by_profile(profile_id); UNIQUE uq_profile_provider_schedule(profile_id, provider, schedule_id) | portable, scoped metadata/revision/deleted_at 유지 |
| calendar_outbox | schedule UUID id; by_profile(profile_id); by_profile_status(profile_id,status) | 기기 전용 인프라, 동일 예약 row 최신 desired/version으로 치환, pending/done 이력 |

link: provider=google, calendar_id=primary, schedule_id, external_event_id(미생성 취소는 null), status=synced/deleted, generation, last_synced_at. link의 deleted 상태는 외부 projection 삭제 상태이며 로컬 예약 tombstone과 독립적이다. 기존 scoped metadata는 유지한다.

outbox: profile_id/schedule_id, version, desired=present/absent, status=pending/done, updated_at, last_error(고정된 안전한 문장). snapshot payload/token/API 원문을 저장하지 않는다. 동기화 error는 pending+last_error로 표현하며 retry 시 최신 원본을 다시 읽는다. ON 기기 설정 key는 google_calendar:<Profile UUID>, 값은 enabled/lastSuccess다.

Migration1은 기존14 Store 그대로, Migration2는 media_blobs, Migration3는 두 새 Store/Index만 생성한다. 기존 row 변환/clear/Store 재생성 없음. 총17 Store: portable13 + local4(device_settings/app_logs/media_blobs/calendar_outbox).

Schema2 백업은 link13번째 Store를 포함하며 links의 허용 필드/UUID/관계/unique/status/id 형식을 검사한다. Schema1 백업은 기존12 Store 및 원래 hash로 검증하고 복원 후 추가 link는 빈 배열이다. JSONv1/ZIPv2 두 형식 모두 schema1/2를 읽는다. Schema2를 모르는 구버전 앱은 새 백업을 읽을 수 없으므로 코드만 다운그레이드하지 않는다.

restore/reset은 전용 Command에서 outbox를 clear하고 google_calendar:*를 OFF로 만든다. device_id는 유지한다. 기존 pending을 다른 기기로 이식하거나 복원 후 자동 flush하지 않는다. 기존 links를 복원한 뒤 사용자가 재연결하고 예약을 수정하면 기존 remote ID/검색을 사용한다.

## 멱등성과 실패

1. linked event GET으로 앱/profile/schedule private properties를 확인한다. 소유표시가 다른 이벤트는 변경 거부.
2. privateExtendedProperty의 세 조건으로 검색하고 pagination 처리한다. 애매한 insert 성공/ack 실패 때 기존 event를 찾아 patch한다. 같은 세 식별자를 가진 중복본만 정리한다. [Extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties).
3. 신규 insert는 UUID 기반 결정적 base32hex 호환 ID를 지정한다. 409는 기존 event를 GET하여 소유 확인 후 patch, cancelled tombstone이면 다음 generation으로 제한 재시도한다. 응답 event.id를 link에 저장한다. [Events insert](https://developers.google.com/workspace/calendar/v3/reference/events/insert).
4. pending create 다음 cancel은 absent로 교체되어 insert 없이 reconciliation 후 필요 시 delete한다. 요청 전 취소를 감지하면 오래된 작업을 중단한다. 이미 전송된 요청 중 취소는 최신 pending을 보존해 명시적 재시도에서 수렴한다.
5. 401/403은 재인증 안내/token 폐기, 네트워크/5xx/timeout은 pending 유지. 404/410 삭제는 이미 삭제된 것으로 처리한다. Google 응답 원문/토큰은 app_logs에 기록하지 않는다. 과도한 자동 retry/backoff 루프는 없고 다음 저장 시도 또는 설정 버튼으로 재시도한다.
6. 완료/완료 취소는 추가 Google 이벤트가 없다. 로컬 통합 Calendar의 schedule+exercise_log 단일 projection 규칙은 그대로다.

## 적용 / 복구

업데이트 전에 기존 버전에서 백업을 내려받아 보관한다. changed.zip을 동일 경로에 덮어쓰거나 full.zip으로 정적 파일을 제공하고 사용자 업데이트 버튼으로 새 App Shell을 적용한다. 실제 게시/계정 연결은 이번 구현 작업에서 실행하지 않았다.

DB3 업그레이드는 자동 누적 실행된다. 오류를 DB 삭제/초기화로 해결하지 않는다. 문제가 있으면 Google OFF → 현재 백업 보관 → 앱 버전/DB 버전/오류코드 기록. DB3에서 DB2를 여는 이전 코드로 단순 교체하면 VersionError가 나므로 forward fix를 우선한다. 이전 버전으로 꼭 돌아가야 한다면 업그레이드 전 Schema1 백업을 별도 pristine 환경의 이전 앱에서 복원한다. Google 측 변경은 백업으로 되돌아가지 않으며 QA로 만든 일정만 같은 계정에서 정리한다.

실행 판정: REGRESSION_TEST.md. 실제 Google API/OAuth/Pages/Galaxy는 MANUAL_QA GCAL-MANUAL-01~08에서 별도로 판정한다.
