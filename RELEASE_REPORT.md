# Release Report — v0.5.0 Pass & Schedule

## 상태와 기준

- 기준: 사용자 지정 v0.4.0 검증 완료본, 작업 시작 시 clean HEAD `f05d0be5c12def44741b6a30e863db776ca03b7e`.
- 구현 완료 및 자동검증: **386 PASS / 0 FAIL / 17 NOT RUN**. Pages/Galaxy 실기기 항목은 사용자 검증 대기.
- App/cache 0.5.0 / DB1 / Schema1 / Seed1 / Backup1. **Migration 없음, 삭제 파일 0개**.
- 기존 범용 Repository, Store/Index, 과거 v0.3/v0.4 테스트 결과는 유지.

## 변경 결과

운동별 이용권 및 계산 잔여량, 운동기록 선택 차감·해제·교체·삭제·복원, 예약 생성·수정·취소·완료·완료 취소를 제공한다. 캘린더에서 기간별 예약과 실제 기록을 조회한다. 같은 pass 재적용은 기존 usage를 재활성화하고 완료 취소 후 재완료는 연결 log ID를 재사용한다.

Service는 입력 정규화와 업무 호출을 담당한다. ActivityCommand가 다중 Store 정합성/동시성/expectedRevision/원자성을 보장한다. 기존 Profile 날짜 인덱스를 사용하는 Query를 추가했으며 BaseScopedRepository를 전면 수정하지 않았다.

| 구분 | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|
| smoke | 72 | 0 | 0 |
| architecture | 29 | 0 | 0 |
| schema | 60 | 0 | 0 |
| exercise-service | 19 | 0 | 0 |
| backup | 26 | 0 | 0 |
| browser-runtime | 180 | 0 | 0 |
| 사용자 배포·실기기 QA | 0 | 0 | 17 |
| **합계 (403건)** | **386** | **0** | **17** |

## 적용 및 산출물

- changed.zip: 기준 HEAD 대비 수정·추가 파일의 현재 내용. 저장소 루트에 경로를 유지하여 적용한다.
- full.zip: 현재 배포 소스·문서·테스트 전체(.git 및 ignored 개인 파일 제외).
- diff.patch: 기준 HEAD 대비 신규 파일과 모바일 이미지까지 포함한 binary-capable patch. changed.zip과 patch 중 한 방법만 사용한다.
- manifest.json: 기준 commit, 변경/전체 목록, 삭제 목록, ZIP/patch SHA-256.
- 배포 전 기존 앱에서 JSON 백업을 보관한다. 변경 전체 적용 후 App/cache 0.5.0 확인 → 사용자 선택 업데이트 → MANUAL_QA.md 순서로 실행한다.
- 저장소 소스 수정과 산출물 생성까지만 수행했다. commit/push/실제 Pages 배포는 수행하지 않았다.

## 검증과 제한

실제 Chrome의 격리 DB에서 11개 transaction 실패 지점에 대한 전후 전체 portable 동일성, 잔여1 동시 차감, 중복 완료, Profile 격리, 재복원/재실행 hash를 확인했다. 오프라인 UI 8건과 412px 캡처를 검사했다. 실기기 미실행 17건은 자동 PASS로 처리하지 않았다.

캘린더는 기간별 예약/운동 목록이며 체중·식단 통합과 월간 요약은 후속 작업이다. 동일 쌍 usage는 재활성화하므로 모든 취소/재사용 이벤트를 별도 행으로 쌓는 감사 이벤트 스트림은 아니다.

## 원복

일반 운동은 삭제하면 차감 취소, 완료 예약은 완료 취소 후 예약 취소한다. 테스트 내역은 soft-delete/cancelled로 남기는 것이 정상이다. 기존 데이터와 백업은 삭제하지 않는다.
**v0.5에서 이용권을 연동한 뒤 v0.4 코드로 운동을 수정/삭제하면 v0.4에는 원장 갱신이 없어 불일치할 수 있다.** 문제가 생기면 백업을 보관하고 쓰기를 중지한 채 수정 릴리스를 적용한다. 단순 DB downgrade/초기화는 하지 않는다. v0.5 사용 전 코드 검토 원복에는 reverse patch를 사용할 수 있으나 사용자 데이터까지 원복하지는 않는다.

## 변경 파일 목록

총 57개: 수정 39 / 신규 18 / 삭제 0.

- AGENTS.md
- CHANGELOG.md
- MANUAL_QA.md
- README.md
- REGRESSION_TEST.md
- RELEASE_REPORT.md
- REQUIREMENTS.md
- docs/ARCHITECTURE.md
- docs/DATA_MODEL.md
- docs/MIGRATION_POLICY.md
- docs/PASS_SCHEDULE_DESIGN.md
- docs/ROADMAP.md
- js/app.js
- js/application/exercise-log.service.js
- js/application/exercise-query.service.js
- js/application/pass-schedule.service.js
- js/bootstrap/bootstrap.js
- js/bootstrap/container.js
- js/config.js
- js/core/backup/backup-validator.js
- js/core/datetime.js
- js/core/pass-rules.js
- js/data/contracts/activity-command.contract.js
- js/data/indexeddb/commands/activity.command.js
- js/data/indexeddb/repositories/exercise-log.repository.js
- js/data/indexeddb/repositories/exercise-schedule.repository.js
- js/data/indexeddb/repositories/pass-usage.repository.js
- js/data/indexeddb/repositories/pass.repository.js
- js/data/indexeddb/repositories/scoped-index-query.js
- js/pages/exercise/exercise-log-detail.page.js
- js/pages/exercise/exercise-log-form.page.js
- js/pages/exercise/exercise.page.js
- js/pages/exercise/exercise.router.js
- js/pages/exercise/pass-schedule.page.js
- js/router.js
- service-worker.js
- tests/activity-ui-tests.mjs
- tests/architecture-test.mjs
- tests/backup-test.mjs
- tests/browser-runner.mjs
- tests/browser/activity-test.js
- tests/browser/db-test.html
- tests/browser/db-test.js
- tests/exercise-service-test.mjs
- tests/results/v0.5.0-architecture.json
- tests/results/v0.5.0-backup.json
- tests/results/v0.5.0-browser.json
- tests/results/v0.5.0-exercise-service.json
- tests/results/v0.5.0-mobile.png
- tests/results/v0.5.0-schema.json
- tests/results/v0.5.0-smoke.json
- tests/results/v0.5.0.json
- tests/run-all-tests.mjs
- tests/schema-test.mjs
- tests/smoke-test.mjs
- tests/test-reporter.mjs
- tests/traceability.json
