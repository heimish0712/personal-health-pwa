# v0.9.0 Operational Hardening

기존 도메인 기능을 유지하며 저장공간·관계 진단·진단 로그, 백업/GC 상호 배제, 작성 중 업데이트 보호를 구현했다. 실제 대량 fixture에서 확인한 운동 전체조회와 복원 순차 요청을 최소 변경으로 개선했다.

## 버전 / 범위

- 시작 commit: `625724c9b990acd7d03fd9b7bb639b20a3bbfb71`, 작업 전 clean.
- APP/cache **0.9.0** / DB **2** / Portable Schema **1** / Seed **1** / Backup Format **2** (JSON v1 호환).
- **Migration 없음**. 15 Store와 모든 Index 정의, BaseScopedRepository 그대로.
- **총 68개 변경: 신규 28 / 수정 40 / 삭제 0**. 테스트/결과/문서 포함.
- UI→Service→Read/Command Port→Adapter를 유지한다. 저장/복원 transaction, UUID/revision/tombstone/원본 관계/기기 ID를 보존한다.
- 운영 DB 변경/초기화와 git commit/push/Pages 배포는 실행하지 않았다.

## 실제 변경

- 운동 최근 Query는 기존 Profile+performed_at 또는 Profile+exercise+performed_at cursor20건 + scoped 운동명 point lookup. 범용 list는 유지.
- 사진 통계는 Blob row 전체 배열 대신 cursor로 bytes/count/orphan bytes를 누계. 설정에 origin usage/quota, 사진 bytes, portable JSON 추정량, persistence 상태를 구분한다.
- 사진 저장 전 압축본/thumbnail 추가분 포함90% 경고. 이미 granted이면 persist 호출0, 거절/미지원은 일반 앱 사용을 막지 않는다.
- 고아 개수/용량 확인 후 명시적 실행. 모든 Profile/삭제 metadata 참조를 transaction 안에서 재검사. Web Locks shared(backup/inspect/restore/reset)와 exclusive(GC), ifAvailable으로 충돌 시 거절한다. nested backup-first도 비교착 확인.
- 설정의 읽기 전용 데이터 진단은 관계/누락파일/중복사용/Profile pointer를 코드·개수로 표시한다. 자동 repair/purge 없음.
- app_logs200건 유지, 최근50건 UI/상세/내보내기. 고정 메시지+context allowlist로 건강 메모/사진 원문을 기록/노출하지 않는다.
- 실제 controllerchange에서 열린 폼은 새로고침을 보류한다. 명시적 적용은 기존 dirty/busy guard를 거치며 시작 진단에서 DB/Schema 기대값을 확인한다.
- Backup snapshot media 읽기와 restore의 Store별 add 요청을 묶는다. 같은 atomic transaction/검증/실패 checkpoint를 유지하며 무조건 덮어쓰기 API를 일반 CRUD에 노출하지 않는다.
- 재사용 Migration Harness(from/to/populate)와 운영 DB 이름을 거절하는 대량 fixture를 추가했다. 테스트 파일은 App Shell에 포함되지 않는다.

## 성능 관측

운동/예약/체중/식단 각3000, 인바디/사진 metadata 각1000, Blob2000(20.26MB)의 분리 DB. 단회 PC/Chrome 관측이며 Galaxy SLA나 통계적 벤치마크가 아니다.

| 항목 | 최종 시간 |
|---|---:|
| DB 새 연결 + bootstrap | 12.2 ms |
| 홈 | 18.8 ms |
| 월간 캘린더 | 52.6 ms |
| 이전 전체조회 최근운동 경로 재현 | 138.1 ms |
| 최근운동 index cursor | 6.9 ms |
| 체중 그래프 | 5.3 ms |
| 식단 날짜 조회 | 15.3 ms |
| Backup 생성/self-validation | 7094.7 ms |
| Restore 파일 검증 | 2582.9 ms |
| Restore/재검증 | 10267.8 ms |

최근운동은 같은 fixture에서3000건 materialize+sort →20건 제한조회로 변경했다. ObjectStore.getAll을 차단해도 성공한다. 복원 요청 묶음 전14,942.1ms → 후10,267.8ms. Export는5,645.0→7,094.7ms로 변동했으므로 export 속도 개선은 주장하지 않는다. `bootMs`는 OS/앱 프로세스 cold launch를 측정한 값이 아니다. 전후 profiling JSON을 보존했다.

## 검증 / 데이터 보존

**618 PASS / 0 FAIL / 56 NOT RUN** (674건), 최종 전체 runner 종료코드0.

Node207 + 실제 IndexedDB/DOM349 + 실제 UI62 =618. 기존 v0.8 자동574건 suite+ID를 모두 유지했고 신규44건 추가. 과거 v0.3 FINAL186/0/0, 이전 결과 JSON, schema/migrations/BaseScopedRepository 불변 확인.

- 정상/7종 손상 데이터 진단 및 읽기 전후 원본/사진/pointer 동일.
- QuotaExceeded/restore/force/reset 중간 실패 rollback, device_id 유지, 파일 재검증 전 초기화 금지 및 초기 Seed 재구성 회귀 유지.
- malformed JSON/checksum/UUID/reference/version/schema/누락·변조media 전체 거절 후 populated target 동일.
- 실제 DB1의 Template v1/v2/revision2 운동/원장/완료예약/인바디/삭제체중 fixture가 upgrade 실패 뒤 DB1, 성공 뒤 DB2, reopen 뒤 모두 정확히 보존됨.
- 대량 pristine ZIP restore 뒤 요약/관계/2000 Blob 보존. 기존 두 번째 독립 Chrome Profile의 실제 다운로드 파일 복원/사진 hash 일치도 PASS.
- 실제 waiting worker/dirty 거절/외부 활성화(controllerchange)/명시적 reload를 검증했다. 새 앱 전용cache만 교체, unrelated cache 유지, DB payload hash 동일, 시작 진단 정상.
- 오프라인 운동·예약/이용권·체중/인바디·식단/사진·홈/캘린더·Backup/Restore 및 신규 진단 회귀 PASS. 412px 진단 UI/로그 버튼 가로넘침 확인.

실기기 신규 OPS-MANUAL8 + 기존48은 **NOT RUN**. 중간 harness 문법 오류/Windows DevToolsActivePort EBUSY를 수정하고 최종 전체 재실행했다. 정합성 근거와 단계별 QA: [REGRESSION_TEST.md](REGRESSION_TEST.md), [MANUAL_QA.md](MANUAL_QA.md), [OPERATIONS.md](OPERATIONS.md).

## Known Issues / 한계

- ZIP 생성/검증은 메모리 기반이며 대량 파일은 수 초~수십 초가 걸릴 수 있다. 기존 파일/entry 제한을 유지한다. streaming/취소/진행률 기능을 이번 버전에 추가하지 않았다.
- portable JSON 용량과 Storage API 값은 실제 IndexedDB/인덱스 디스크 크기를 보장하지 않는다. API 미지원 시 알 수 없음이며 영구 저장도 Backup 대체가 아니다.
- 데이터 진단은 읽기 전용 관계 검사다. 이미지 내용의 checksum 전체 검증은 Backup 검증에서 수행한다. 자동 repair/tombstone purge 없음.
- Web Locks 미지원 시 안전한 cross-context GC를 실행하지 않는다. backup/일반 기능은 유지한다. 자동 검증은 독립 coordinator와 실제 외부 worker 활성화를 사용했으며 실제 두 탭·설치형 업데이트는 사용자 QA가 남았다.
- Windows EPERM으로 일부 테스트용 Chrome 임시 디렉터리 정리가 거부됐다. 테스트 프로세스/DB를 종료했고 사용자 Chrome Profile은 사용/삭제하지 않았다.

## 적용 / 복구 / 산출물

산출물: `C:/Users/Public/Documents/ESTsoft/CreatorTemp/health-pwa-v0.9.0`.

- `changed.zip`: 변경/신규 68파일, 저장소 루트 상대경로.
- `full.zip`: 추적+신규 236파일, .git/무시파일/산출물 자체 제외.
- `diff.patch`: 기준 HEAD 대비 신규 파일과 binary 포함. `manifest.json`에 파일목록/크기/SHA256/검증 결과.
- 적용: 현재 코드·사용자 백업 보관 → 해당 기준 코드 사본에 changed.zip 적용 또는 git apply --check 후 patch 적용. full.zip은 새 빈 코드 폴더에 압축해제 → 배포/사용자 업데이트 → 버전/진단/QA 확인.
- 복구: 적용 전 코드 사본 또는 충돌 없는 상태의 reverse patch. DB 버전이 같아 코드 되돌리기에 DB 초기화가 필요 없다. 데이터 복구는 검증된 정상 파일로 기존 명시적 복원/replace 절차를 사용한다.

## 신규 파일 (28)

- `OPERATIONS.md`
- `js/application/operations.service.js`
- `js/core/data-diagnostic.js`
- `js/core/log-privacy.js`
- `js/core/maintenance-coordinator.js`
- `js/core/update-controller.js`
- `js/data/contracts/operations-reader.contract.js`
- `js/data/indexeddb/operations.reader.js`
- `js/pages/settings/operations.page.js`
- `tests/browser/large-fixture.js`
- `tests/browser/migration-harness.js`
- `tests/browser/operations-test.js`
- `tests/operations-ui-tests.mjs`
- `tests/results/v0.9.0-architecture.json`
- `tests/results/v0.9.0-backup.json`
- `tests/results/v0.9.0-browser.json`
- `tests/results/v0.9.0-calendar.png`
- `tests/results/v0.9.0-dashboard.png`
- `tests/results/v0.9.0-diet.png`
- `tests/results/v0.9.0-exercise-service.json`
- `tests/results/v0.9.0-mobile.png`
- `tests/results/v0.9.0-operations.png`
- `tests/results/v0.9.0-profile-before-batching.json`
- `tests/results/v0.9.0-profile.json`
- `tests/results/v0.9.0-schema.json`
- `tests/results/v0.9.0-smoke.json`
- `tests/results/v0.9.0-unified-calendar.png`
- `tests/results/v0.9.0.json`

## 수정 파일 (40)

- `AGENTS.md`
- `CHANGELOG.md`
- `MANUAL_QA.md`
- `README.md`
- `REGRESSION_TEST.md`
- `RELEASE_REPORT.md`
- `REQUIREMENTS.md`
- `css/common.css`
- `docs/ROADMAP.md`
- `js/app.js`
- `js/application/backup-export.service.js`
- `js/application/backup-import.service.js`
- `js/application/database-diagnostic.service.js`
- `js/application/exercise-query.service.js`
- `js/application/media.service.js`
- `js/bootstrap/bootstrap.js`
- `js/bootstrap/container.js`
- `js/config.js`
- `js/core/app-logger.js`
- `js/data/indexeddb/backup/backup-restore.command.js`
- `js/data/indexeddb/backup/backup-snapshot.reader.js`
- `js/data/indexeddb/media-storage.js`
- `js/data/indexeddb/repositories/app-log.repository.js`
- `js/data/indexeddb/repositories/exercise-log.repository.js`
- `js/pages/diet/diet.page.js`
- `service-worker.js`
- `tests/architecture-test.mjs`
- `tests/backup-test.mjs`
- `tests/browser-runner.mjs`
- `tests/browser/db-test.html`
- `tests/browser/db-test.js`
- `tests/dashboard-ui-tests.mjs`
- `tests/diet-ui-tests.mjs`
- `tests/exercise-service-test.mjs`
- `tests/qa-feedback-ui-tests.mjs`
- `tests/run-all-tests.mjs`
- `tests/schema-test.mjs`
- `tests/smoke-test.mjs`
- `tests/test-reporter.mjs`
- `tests/traceability.json`

## 삭제 파일 (0)

없음.
