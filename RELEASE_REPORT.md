# v0.8.0 Dashboard + Unified Calendar

홈을 실제 운동·식단·측정·이용권 데이터 요약으로 연결하고 통합 캘린더에 네 종류 indicator와 선택 날짜 빠른 기록을 구현했다. 완료 예약+운동기록 및 인바디+연동 체중은 원본을 유지한 채 한 사건으로 표시한다.

## 버전 / 변경 범위

- 기준 commit: `9d738fb91c5639da37d14c99d39a1fa986b8b4b8` (작업 전 clean).
- APP/cache **0.8.0**, DB **2**, Portable Schema **1**, Seed **1**, Backup **2** (JSON v1 읽기/쓰기 호환).
- **Migration 없음**, 15 Store 및 기존 Index 정의 그대로. BaseScopedRepository, Semantic Command 저장/복원/Media 구조 변경 없음.
- 총 **56개 변경: 신규 18 / 수정 38 / 삭제 0**. 신규 검증 JSON/PNG와 문서를 포함한 수치다.
- 사용자 운영 DB 접근/초기화 없음. Git commit/push/Pages 배포는 실행하지 않았다.

## Query / Index

| 조회 | 사용 경로 |
|---|---|
| 운동·예약 기간 | by_profile_performed_at / by_profile_scheduled_at, [start,end) |
| 완료 사건 연결 | uq_profile_completed_log 및 scoped getById |
| 식단 기간 / 최신 | by_profile_eaten_at 범위 / 역방향 cursor(1건) |
| 운동 최신 | by_profile_performed_at 역방향 cursor(1건) |
| 체중·인바디 기간 / 최신 | by_profile_measured_at 범위 / 역방향 cursor(2/1건) |
| 활성 pass / 사용 원장 | by_profile_status(active) / by_profile_pass; nondeleted used의 합계 |
| 식단 첫 사진 | by_profile_diet_sort, scoped 사진/Blob point lookup |
| 운동명 | 필요한 운동 종류 ID만 scoped getByIdIncludingDeleted |

CalendarService와 DashboardService가 원본 Repository 결과를 조합한다. 주간 범위는 Profile timezone의 월~일, 최신 측정 비교는 measured_at 순서이며 그래프/summary 데이터를 별도 저장하지 않는다. 달력 전체 Store 스캔을 없앴고 기존 activity projection을 공유해 예약일과 실제 운동일이 서로 다른 달인 경우도 원본 연결을 유지한다. 범용 list는 그대로다.

## 발견한 구조 문제 / 해결

- 기존 홈은 단계 안내와 측정 요약 중심이었다. 원본 Query 기반 전체 요약/원본 이동/로컬 thumbnail을 연결했다.
- 캘린더 Page가 세 도메인 Service를 직접 조합하고 운동 종류 전체 목록을 읽었다. CalendarService로 projection을 모으고 필요한 운동 ID만 조회한다.
- Hash Router에 날짜 문맥이 없어 특정 날짜에서 기존 폼을 열어도 오늘이 기본값이었다. 유효 날짜/date+from context를 전달하고 저장/취소 후 해당 날짜로 돌아온다. 월/선택 날짜는 hash에 남아 Back/reload에도 유지된다.
- 운동/식단의 최근 목록 전체 스캔은 새 홈에서 사용하지 않고 기존 인덱스 cursor로 제한 조회한다. 기존 도메인 화면의 범용 조회는 임의 재작성하지 않았다.
- thumbnail Object URL은 화면 이탈 시 해제하고 지연 조회는 현재 render token을 검사한다.

## 검증

**574 PASS / 0 FAIL / 48 NOT RUN** (622건), `node tests/run-all-tests.mjs` 종료코드0.

기존 v0.7 자동 538건의 suite+ID가 모두 PASS인 것을 비교했고 신규 36건을 추가했다. Node 207 + 실제 Chrome IndexedDB/DOM 311 + 실제 UI 56 =574. 사용자의 실제 Pages/Galaxy/설치형 PWA 신규7+기존41은 미실행이다. 과거 v0.3 FINAL 186/0/0 및 과거 결과파일은 보존했다.

24,000개 가상 원본(5개 도메인)의 해당 월200건 Query: **43.3ms**. ObjectStore.getAll을 강제 차단해 새 홈/캘린더가 index/cursor/point 조회만으로 동작하는 것도 확인했다. 이 PC 수치는 갤럭시 성능 보증이 아니다.

실제 네 폼 날짜 전달/저장/즉시 복귀, dirty 거절/승인, thumbnail decode, 네트워크 차단 후 완전 reload, ZIP 복원 후 두 projection/사진 일치, 기존 Backup v1/v2·원자성·revision·Media 회귀를 검증했다. 412px 홈/캘린더 스크린샷도 확인했다. Windows EPERM으로 일부 테스트용 Chrome 임시 디렉터리 정리가 실패했으며 사용자 Profile은 사용하지 않았다.

상세: [REGRESSION_TEST.md](REGRESSION_TEST.md), [MANUAL_QA.md](MANUAL_QA.md), `tests/results/v0.8.0.json`.

## 적용 / 복구 / 산출물

산출물 폴더: `C:/Users/Public/Documents/ESTsoft/CreatorTemp/health-pwa-v0.8.0`.

- `changed.zip`: 수정/신규 파일 56개, 저장소 루트 기준 상대경로.
- `full.zip`: 추적 파일+신규 파일 208개. .git/무시 파일/산출물 자체 제외.
- `diff.patch`: 기준 HEAD 대비 수정과 신규 파일을 포함한 binary patch. `manifest.json`에 파일 목록/크기/SHA256 및 패키지 검증 결과.
- 적용: 기존 v0.7 코드와 데이터 백업 보관 → 해당 commit 기반 사본에 changed.zip 덮어쓰기 또는 `git apply --check diff.patch` 후 적용. full.zip은 새 빈 코드 폴더에 푼다. 배포 후 사용자 업데이트 버튼으로 v0.8 App Shell 확인 → MANUAL_QA 실행.
- 코드 복구: 적용 전 코드 사본 복원 또는 충돌 없는 상태에서 patch reverse check 후 되돌린다. DB/Schema 변경이 없어 코드 복구에 DB 초기화가 필요하지 않다. 데이터 복구가 필요하면 검증된 백업의 기존 명시적 복원 절차를 사용한다.

## 신규 파일 (18)

- `js/application/activity-calendar.query.js`
- `js/application/calendar.service.js`
- `js/application/dashboard.service.js`
- `js/pages/dashboard.page.js`
- `tests/browser/dashboard-test.js`
- `tests/dashboard-ui-tests.mjs`
- `tests/results/v0.8.0-architecture.json`
- `tests/results/v0.8.0-backup.json`
- `tests/results/v0.8.0-browser.json`
- `tests/results/v0.8.0-calendar.png`
- `tests/results/v0.8.0-dashboard.png`
- `tests/results/v0.8.0-diet.png`
- `tests/results/v0.8.0-exercise-service.json`
- `tests/results/v0.8.0-mobile.png`
- `tests/results/v0.8.0-schema.json`
- `tests/results/v0.8.0-smoke.json`
- `tests/results/v0.8.0-unified-calendar.png`
- `tests/results/v0.8.0.json`

## 수정 파일 (38)

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
- `js/application/pass-schedule.service.js`
- `js/bootstrap/bootstrap.js`
- `js/bootstrap/container.js`
- `js/config.js`
- `js/data/indexeddb/repositories/diet-log.repository.js`
- `js/data/indexeddb/repositories/exercise-log.repository.js`
- `js/data/indexeddb/repositories/measurement-query.js`
- `js/data/indexeddb/repositories/pass.repository.js`
- `js/pages/diet/diet.page.js`
- `js/pages/exercise/exercise-log-form.page.js`
- `js/pages/exercise/pass-schedule.page.js`
- `js/pages/weight/weight.page.js`
- `js/router.js`
- `service-worker.js`
- `tests/architecture-test.mjs`
- `tests/backup-test.mjs`
- `tests/browser-runner.mjs`
- `tests/browser/db-test.js`
- `tests/browser/health-test.js`
- `tests/browser/qa-feedback-test.js`
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
