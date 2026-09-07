# Release Report — v0.4.0 Backup Core

## 버전 및 상태

- 이전 기준: v0.3.0 FINAL 186 PASS / 0 FAIL / 0 NOT RUN (사용자 QA 포함).
- App/cache 0.4.0, Backup Format 1.
- DB 1 / Schema 1 / Seed 1, 14 Store/Index 유지. **Migration 없음**.
- 구현 및 자동검증 완료: **330 PASS / 0 FAIL / 9 NOT RUN**. 사용자 배포·갤럭시 QA 대기.
- 실제 GitHub Pages 배포, commit/push, 사용자 DB 조작은 수행하지 않음.

## 변경 범위

현재 HEAD 대비 **51개 파일: 수정 24개 / 신규 27개 / 삭제 0개**. 앞선 기준선 문서 정정도 현재 diff에 포함한다.

- 설정의 JSON export/import, 파일 검증·미리보기, pristine 복원.
- 12 Store snapshot과 SHA-256 자기검증. 원본 metadata·관계·역사적 Template 보존.
- 13 Store transaction에서 검증된 초기 자동생성 3행만 교체. device_id 유지 및 포인터 연결.
- 실패 전체 rollback과 복원 후 전체 portable hash 검증, 오프라인 UI.
- App Shell, v0.4 테스트 결과 경로, 백업 파일 .gitignore, 요구사항·설계·회귀 문서 갱신.
- 기존 일반 CRUD Repository와 운동 업무 로직, schema/migrations 코드 무변경.

## 검증

| Suite | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|
| smoke | 72 | 0 | 0 |
| architecture | 29 | 0 | 0 |
| schema | 60 | 0 | 0 |
| exercise-service | 19 | 0 | 0 |
| backup | 26 | 0 | 0 |
| browser-runtime | 124 | 0 | 0 |
| 사용자 QA | 0 | 0 | 9 |

Node 검증에 더해 실제 IndexedDB와 오프라인 브라우저 UI를 실행했다. 5개 복원 실패 지점에서 초기 Seed까지 rollback하며 원본/복원 후/재실행 후 전체 데이터 hash가 같음을 확인했다. 이전 자동결과 tests/results/v0.3.0*.json은 변경하지 않았다.

## 적용

1. 제공한 전체 git diff(신규 파일 포함)를 현재 소스와 함께 검토한다.
2. 실제 배포 시 변경 파일 전체를 반영하고 App/cache가 모두 0.4.0인지 확인한다.
3. 기존 설치 앱의 업데이트를 선택한 뒤 홈에서 v0.4.0 · DB 1을 확인한다.
4. 설정에서 현재 데이터 JSON을 내보내고 파일 보관을 확인한다.
5. 같은 데이터가 있는 앱에서는 정상 파일 미리보기와 복원 차단을 확인한다.
6. 새 브라우저의 기본 Seed만 있는 환경에서 복원하고 Profile·기록·Template·메모·삭제 상태를 확인한다.
7. 복원 후 네트워크 OFF 재실행과 운동 CRUD를 확인하고 사용자 QA 결과를 보고한다.

## 복구

- 문제가 있으면 이번 코드 변경 전체를 검토하여 이전 v0.3 코드로 되돌린다. 사용자 DB와 백업 파일은 보존한다.
- DB v1을 계속 사용하므로 DB downgrade/삭제는 하지 않는다. 복원된 데이터도 동일 v1 형식이다.
- restore transaction 실패는 초기 상태를 유지한다. 저장 후 hash 확인 실패는 별도 메시지로 알리며 앱 다시 열기를 제공한다.
- 실제 백업 파일을 public Git 저장소에 넣지 않는다.

## 제한

- 병합·부분복원·사진 Blob/ZIP·클라우드·자동 백업은 없음.
- 최초 자동생성 상태에서만 복원 가능하며 변경한 Seed·설정·삭제 행도 기존 데이터로 판정.
- 파일은 암호화되지 않은 JSON, 50 MB 이하. 사진 metadata가 있으면 v1을 거절.
- 이용권·예약은 v0.5.0으로 순연.

## 변경 파일 목록

- .gitignore
- AGENTS.md
- CHANGELOG.md
- README.md
- REGRESSION_TEST.md
- RELEASE_REPORT.md
- REQUIREMENTS.md
- css/common.css
- docs/ARCHITECTURE.md
- docs/BACKUP_CORE_DESIGN.md
- docs/DATA_MODEL.md
- docs/MIGRATION_POLICY.md
- docs/ROADMAP.md
- js/app.js
- js/application/backup-export.service.js
- js/application/backup-import.service.js
- js/application/backup-validation.service.js
- js/bootstrap/bootstrap.js
- js/bootstrap/container.js
- js/config.js
- js/core/backup/backup-format.js
- js/core/backup/backup-integrity.js
- js/core/backup/backup-migrations.js
- js/core/backup/backup-validator.js
- js/core/backup/canonical-json.js
- js/data/contracts/backup-restore-command.contract.js
- js/data/contracts/backup-snapshot-reader.contract.js
- js/data/indexeddb/backup/backup-restore.command.js
- js/data/indexeddb/backup/backup-snapshot.reader.js
- js/data/indexeddb/backup/restore-target.inspector.js
- js/pages/settings/backup-restore.page.js
- service-worker.js
- tests/architecture-test.mjs
- tests/backup-test.mjs
- tests/browser-runner.mjs
- tests/browser/backup-test.js
- tests/browser/db-test.html
- tests/browser/db-test.js
- tests/exercise-service-test.mjs
- tests/results/v0.4.0-architecture.json
- tests/results/v0.4.0-backup.json
- tests/results/v0.4.0-browser.json
- tests/results/v0.4.0-exercise-service.json
- tests/results/v0.4.0-schema.json
- tests/results/v0.4.0-smoke.json
- tests/results/v0.4.0.json
- tests/run-all-tests.mjs
- tests/schema-test.mjs
- tests/smoke-test.mjs
- tests/test-reporter.mjs
- tests/traceability.json
