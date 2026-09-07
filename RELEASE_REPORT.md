# v0.10.0 Google Calendar One-way Integration

운동 예약을 원본 IndexedDB에 저장한 뒤 Google primary calendar로 단방향 전송한다. 설정 ON/OFF·사용자 인증·대기·재시도, 최신 desired outbox와 연결 이력, 실패 복구를 구현했다. 원격 실패 시 예약은 유지되고 대기 안내가 표시된다.

## 버전 / 결과

- APP/cache **0.10.0** / DB **3** / Portable Schema **2** / Seed **1** / Backup Format **2** (JSONv1 호환).
- **666 PASS / 0 FAIL / 64 NOT RUN** (총730), 최종 전체 runner 종료코드0. Node209 + IndexedDB/DOM391 + 로컬 UI66.
- v0.9 자동618건을 suite+ID로 비교해 모두 재통과. 신규48건(Schema2 + Google42 + UI4). 과거 결과 파일 및 v0.3 FINAL186/0/0 보존.
- 실제 Google 계정/Pages/Galaxy/설치형 PWA는 미실행: 신규8 + 기존56 =64 NOT RUN. Google API 응답은 모의 검증이며 실제 OAuth 동의/remote event를 확인했다고 보고하지 않는다.
- **공개 Google Web Client ID와 실제 origin은 아직 미제공**. config 기본값은 빈 문자열이며 설정에 ID를 입력하거나 `js/config.js` GOOGLE_CLIENT_ID를 배포 설정으로 지정해야 실제 연결 가능하다.

## 변경 범위 / 데이터 보존

기존 Local-first/Profile/UUID/revision/tombstone 및 Service→Semantic Command→Adapter 구조를 유지했다. 예약 원본/캘린더 projection을 합치거나 기존 기능을 전면 재작성하지 않았다.

- Calendar link: `calendar_event_links` UUID scoped metadata, provider=google/calendar_id=primary/schedule_id/external_event_id/status/generation/last_synced_at. by_profile + UNIQUE(profile_id,provider,schedule_id).
- 기기 outbox: `calendar_outbox` schedule UUID 키, by_profile + by_profile_status. 최신 desired/version/pending 또는 done, 고정된 안전한 오류만 저장.
- DB2→3 최소 누적 Migration. 기존15 Store/Index/데이터 불변, 새2 Store/4 Index만 추가. 총17=portable13+local4. 기존 기간 Query/BaseScopedRepository 변경 없음.
- Schema1 백업12 Store와 원래 hash 읽기 유지, Schema2 새link13번째 Store 검증. JSONv1/사진ZIPv2 모두 지원. restore/reset 시 outbox 제거·Google OFF, token/기기설정은 portable 제외, device_id 유지.
- DB2→3 abort/upgrade, 기존 DB1→2, Schema1 restore, link UUID/revision/관계 보존 자동검증. 기존 운동/원장/예약/체중/인바디/식단/사진/Backup/홈/Calendar 전부 회귀 PASS.

## Google 동작 / 검증 근거

GIS token client를 외부 script 필요 시에만 준비하고 두 번째 사용자 버튼 gesture에서 OAuth 요청한다. scope는 calendar.events.owned, target primary. token은 private memory만 사용하며 새 실행/만료 후 재인증한다. gapi/client secret/refresh token/service account/영구 토큰 저장 없음. 공식 설정과 API 근거는 [Google Calendar 설계](docs/GOOGLE_CALENDAR.md)에 연결했다.

예약 저장+outbox는 같은 transaction, HTTP는 commit 이후다. completion/undo는 추가 event 없음. linked ID GET/privateExtendedProperty 검색/결정적 insert ID/generation으로 중복·응답 유실·ack 실패·삭제 후 재예약을 처리한다. 다른 소유 표시의 event는 변경하지 않으며 description에 메모를 넣지 않는다. 최신 desired version 재검사와 ack 비교로 전송 중 수정/취소를 잃지 않는다.

Web Locks는 전송과 다른 전송/backup/restore/reset/GC를 상호 배제한다. 미지원이면 로컬 CRUD를 유지하면서 원격 실행 안내. 이미 발송한 요청을 OFF가 되돌릴 수는 없으며 후속 호출을 중단한다. pending 수정은 다음 명시적 재시도로 수렴한다. 다른 기기 간 동시 수정 순서·Google 계정 이전/병합은 이 버전 범위 밖이므로 같은 계정으로 재연결한다.

신규 Google42건은 REST 응답/GIS를 모의 처리하고 실제 IndexedDB/DOM/Command를 사용했다. 실제 local UI4건은 네트워크 차단 예약 저장/재실행/상태/OFF를 검증했다. 412px 화면 screenshot의 입력/버튼/대기 표시를 확인했다. 사용자 단계별 버튼/값/PASS/실패 기록/원복 절차는 [MANUAL_QA](MANUAL_QA.md) GCAL-MANUAL-01~08이다.

## 발견한 구조 문제와 보완

1. 외부 링크/내구성 큐 Store가 없었다. 예약과 기기 outbox만 원자적으로 묶고 외부 gateway를 분리했다.
2. 백업은12 Store/Schema1 고정이었다. schema별 Store 검증과 원래 payload hash를 유지하는 하위 호환을 추가했다. 과거 fixture에 새 schema 데이터가 섞이지 않도록 실제 이전 버전 fixture를 분리했다.
3. Google의 취소된 ID는 재사용할 수 없으므로 deterministic generation을 사용했다. 응답 유실에는 단순 insert 재시도 대신 private-property reconciliation을 우선한다.
4. 기존 설정 UI 테스트는 DB 표시만 기다린 뒤 백업 버튼이 이미 존재한다고 가정했다. 실제 백업 요소 준비를 기다리도록 수정했다. Chrome offline 재실행 후 연결 상태 보고와 세션 인증 부재를 별개로 확인한다.
5. 작업 중 `31b829e` 중간 commit이 추가됐다. 산출물은 시작 commit `6a77dd82fc603190a9c5c62053a5d025ae121ade`부터 최종 작업 트리까지의 변경을 포함한다. 중간 commit/사용자 변경을 되돌리지 않았다.

## 적용 / 복구 / 산출물

운영 DB를 열어 변경하거나 초기화하지 않았고 git commit/push/Pages 배포도 실행하지 않았다. 업데이트 전 현재 앱 백업을 보관한 뒤 changed.zip 파일을 동일 상대경로에 적용하거나 full.zip을 정적 배포에 사용한다. 새 App Shell 적용 후 DB3 자동 누적 upgrade 및 설정17/17을 확인하고 실제 계정 QA를 진행한다.

문제 시 Google OFF, 현재 백업 보관 및 오류 기록 후 forward fix를 우선한다. DB3 위에 DB2 코드를 덮어쓰는 단순 롤백은 VersionError를 유발할 수 있다. 이전 버전 복귀가 필요하면 업그레이드 전 Schema1 백업을 별도 pristine 환경의 이전 앱에서 복원한다. Google remote 변경은 로컬 백업으로 취소되지 않는다. QA 일정만 명시적으로 정리한다.

- 산출물 위치: `C:/Users/Public/Documents/ESTsoft/CreatorTemp/health-pwa-v0.10.0/`
- `changed.zip`: 시작 commit 대비 신규/수정 파일 전체.
- `full.zip`: 최종 추적/신규 프로젝트 파일 전체(.git/ignored 파일 제외).
- `diff.patch`: 시작 commit 대비 text/binary 및 신규 파일 포함 Git patch.
- `manifest.json`: 버전/기준 commit/파일 목록/개수/SHA-256/검증 결과.

최종 자동검증 후 문서/traceability/diff 및 ZIP 내용 정합성을 확인했다. Windows 임시 테스트 Chrome Profile 정리는 일부 EPERM이 있었으며 운영 브라우저 Profile은 건드리지 않았다.

<!-- FILE_INVENTORY -->

## 파일 목록 (시작 commit 기준)

**총 68개: 신규 24 / 수정 44 / 삭제 0.** 테스트/결과/문서 포함.

### 신규 24개

- `docs/GOOGLE_CALENDAR.md`
- `js/application/google-calendar.service.js`
- `js/core/google-calendar.js`
- `js/data/contracts/calendar-integration-command.contract.js`
- `js/data/google/google-calendar.gateway.js`
- `js/data/google/google-token-client.js`
- `js/data/indexeddb/commands/calendar-integration.command.js`
- `js/pages/settings/google-calendar.page.js`
- `tests/browser/google-calendar-test.js`
- `tests/google-calendar-ui-tests.mjs`
- `tests/results/v0.10.0-architecture.json`
- `tests/results/v0.10.0-backup.json`
- `tests/results/v0.10.0-browser.json`
- `tests/results/v0.10.0-calendar.png`
- `tests/results/v0.10.0-dashboard.png`
- `tests/results/v0.10.0-diet.png`
- `tests/results/v0.10.0-exercise-service.json`
- `tests/results/v0.10.0-google-calendar.png`
- `tests/results/v0.10.0-mobile.png`
- `tests/results/v0.10.0-operations.png`
- `tests/results/v0.10.0-schema.json`
- `tests/results/v0.10.0-smoke.json`
- `tests/results/v0.10.0-unified-calendar.png`
- `tests/results/v0.10.0.json`

### 수정 44개

- `AGENTS.md`
- `CHANGELOG.md`
- `MANUAL_QA.md`
- `README.md`
- `REGRESSION_TEST.md`
- `RELEASE_REPORT.md`
- `REQUIREMENTS.md`
- `docs/DATA_MODEL.md`
- `docs/MIGRATION_POLICY.md`
- `docs/ROADMAP.md`
- `js/app.js`
- `js/application/backup-export.service.js`
- `js/application/backup-import.service.js`
- `js/application/pass-schedule.service.js`
- `js/bootstrap/bootstrap.js`
- `js/bootstrap/container.js`
- `js/config.js`
- `js/core/backup/backup-format.js`
- `js/core/backup/backup-validator.js`
- `js/data/indexeddb/backup/backup-restore.command.js`
- `js/data/indexeddb/backup/backup-snapshot.reader.js`
- `js/data/indexeddb/backup/restore-target.inspector.js`
- `js/data/indexeddb/commands/activity.command.js`
- `js/data/indexeddb/migrations.js`
- `js/data/indexeddb/schema.js`
- `js/pages/exercise/pass-schedule.page.js`
- `js/pages/settings/backup-restore.page.js`
- `service-worker.js`
- `tests/architecture-test.mjs`
- `tests/backup-test.mjs`
- `tests/browser-runner.mjs`
- `tests/browser/db-test.html`
- `tests/browser/db-test.js`
- `tests/browser/diet-test.js`
- `tests/dashboard-ui-tests.mjs`
- `tests/diet-ui-tests.mjs`
- `tests/exercise-service-test.mjs`
- `tests/operations-ui-tests.mjs`
- `tests/qa-feedback-ui-tests.mjs`
- `tests/run-all-tests.mjs`
- `tests/schema-test.mjs`
- `tests/smoke-test.mjs`
- `tests/test-reporter.mjs`
- `tests/traceability.json`

### 삭제 0개

없음.
