# v0.6.0 Release Report

체중 탭에 일반 체중/인바디 CRUD·메모·연동·7개 변화 그래프를 구현하고 기존 캘린더/홈에 측정 요약을 연결했다. 기존 운동·이용권·예약·Backup Core 회귀를 유지했다.

## 버전 / 데이터 변경

| 항목 | 값 |
|---|---|
| APP / Cache | 0.6.0 / personal-health-pwa-v0.6.0 |
| DB_VERSION | 1 |
| SCHEMA_VERSION | 1 |
| SEED_VERSION | 1 |
| Backup version | 1 (JSON) |
| Store 수 | 14 |
| Migration | **없음** |
| Git 비교 기준 | `d4cb8276765205495f9c1e429d8083b43ad91c30` |

기존 weight_logs/inbody_logs 및 by_profile_measured_at, uq_profile_source_ref를 재사용했다. DB/Index 변경 없이 인바디의 선택 payload link_weight를 추가했다. 범용 BaseScopedRepository·기존 정상 운동/백업 명령을 전면 재작성하지 않았다.

## 구현과 책임 경계

- UI → HealthService → 단일 Repository 또는 InbodyCommandContract → IndexedDB Adapter. Service generic transaction 사용 없음.
- 인바디가 원본이며 연결 체중의 독립 변경은 Service에서 거절하고 UI는 원본 인바디로 이동한다. 저장/수정/삭제/복원은 두 Store transaction, OFF→ON은 같은 source_ref_id의 삭제행 UUID를 재사용한다.
- link_weight는 삭제 후에도 보존되는 연동 의도. OFF 인바디 복원은 연결 체중을 되살리지 않는다. 기존 필드 없는 행은 기존 관계에서 추론한다.
- 일반 체중은 같은 날 여러 건 허용, 최신/직전은 measured_at 역순. UTC 저장/Profile timezone 입력, 초·밀리초 보존. 선택 숫자는 null, 의학적 정상범위 제한/판정 없음.
- 그래프는 weight_logs 또는 inbody_logs 원본 조회, 7개 지표와 4개 기간. 로컬 SVG/실제 측정 목록, CDN/별도 그래프 Store 없음. 날짜 Query와 최근 cursor는 실제 기존 인덱스를 사용한다.
- 월간 달력은 연결 인바디/체중을 한 관계 항목으로 표시한다. 홈은 기존 카드 구조에 최근 체중·직전대비·최신 인바디 카드 추가로 연결했다.
- Backup v1의 12 portable Store 대상은 유지. 새 측정 payload/관계 검증을 보강하고 pristine 복원에서 UUID/revision/삭제/관계/hash 보존을 확인했다.

## 발견한 문제 및 처리

1. 체중/인바디 Repository에 전용 기간 조회가 없었다. 범용 list를 유지한 채 날짜 복합 인덱스 Query와 역방향 최근 cursor를 추가했다.
2. 두 Store 연동과 삭제/복원 의도를 표현할 업무 경계가 없었다. 전용 Semantic Command와 link_weight 선택 의도로 해결하고 legacy 관계 추론을 제공했다.
3. 공통 시간 입력 함수는 분 단위로 표시하므로 가져온 세부 측정시각이 편집 중 손실될 수 있었다. 기존 운동 시간 함수를 바꾸지 않고 측정 전용 초/밀리초 변환으로 보존했다.
4. 기존 Backup validator는 InBody 시각/참조만 확인했다. 선택 지표 수치와 명시적 ON/OFF 관계의 상태·체중·시간·메모를 검증하면서 정상 legacy JSON 호환을 유지했다.
5. 신규 오프라인 재실행 테스트에서 CDP의 navigator.onLine 표시는 true였지만 데이터 hash는 일치했다. 실제 미캐시 HEAD 요청이 네트워크에 도달하지 못함을 확인하는 판정으로 보완했다. 최종 데이터·네트워크 검증 모두 통과했다.

## 검증 결과

**477 PASS / 0 FAIL / 33 NOT RUN**. 기존 자동 424건 전부 PASS, 신규 53건 PASS. Node v24.16.0 + 실제 Chrome/IndexedDB, 임시 Profile/격리 DB, Pages형 하위 경로에서 실행했다.

전체 실행 후 신규 브라우저 판정 보완에 따른 browser-runner 재실행이 종료코드0으로 통과했다. 이미 통과한 5개 Suite와 최종 browser 결과를 `tests/results/v0.6.0.json`으로 재집계했다. 재현: `node tests/run-all-tests.mjs`.

- 원자성: create/update/delete/restore × 2 fault 지점, 부분 변경0.
- 정합성: Profile/stale/concurrent, ON/OFF/복원/재사용, 그래프 중복0.
- 데이터 안전: 백업 export→pristine restore 및 DB/앱 재실행 전후 payload 보존.
- 실제 UI: 오프라인 입력·수정·삭제·복원·연동·그래프·캘린더·홈, 412px 모바일 화면 확인.
- 실제 Pages/Galaxy 33건은 **NOT RUN**, 자동 PASS/이전 버전 결과 승계 없음. `MANUAL_QA.md`에 새 8건의 목적·사전조건·버튼·값·단계별 결과·PASS·실패 증적·원복 작성.

## 적용 / 복구 / 범위

배포 전에 기존 설치 앱에서 JSON 백업을 실제 파일로 저장한다. changed.zip은 위 Git 기준선에 덮어쓰는 변경분, full.zip은 `.git`/무시 파일을 제외한 전체 소스/문서/테스트다. diff.patch는 신규 파일과 바이너리 증적을 포함한다. 실제 배포/commit/push는 실행하지 않았다.

DB Migration이 없어 기존 데이터는 그대로 유지된다. 문제가 있으면 이전 앱 파일로 되돌릴 수 있지만 이전 앱은 새 측정 UI가 없으므로 백업을 보관한다. 데이터 복구는 별도 pristine 환경에서 백업을 확인한 후 기존 일반/명시적 강제 복원 절차를 따른다. 운영 DB 삭제를 복구 수단으로 사용하지 않는다.

식단·사진/media_blobs/사진 ZIP Backup v2/Supabase Sync는 후속 범위다. 그래프는 선택한 기간의 모든 원본 측정점을 표시하며 별도 집계 캐시를 저장하지 않는다.

## 산출물 검증

changed.zip / full.zip / diff.patch / manifest.json을 `C:/Users/Public/Documents/ESTsoft/CreatorTemp/health-pwa-v0.6.0/`에 제공한다. ZIP 항목 및 내용은 현재 파일과 대조하고 `git apply --check --reverse`로 patch 적용 기준을 검증한다. 파일별 목록은 아래와 manifest.json에 수록한다.

## 파일 변경 (17 신규 / 34 수정 / 0 삭제)

### 신규

- `js/application/health.service.js`
- `js/core/health-rules.js`
- `js/data/contracts/inbody-command.contract.js`
- `js/data/indexeddb/commands/inbody.command.js`
- `js/data/indexeddb/repositories/measurement-query.js`
- `js/pages/weight/weight.page.js`
- `tests/browser/health-test.js`
- `tests/health-ui-tests.mjs`
- `tests/results/v0.6.0-architecture.json`
- `tests/results/v0.6.0-backup.json`
- `tests/results/v0.6.0-browser.json`
- `tests/results/v0.6.0-calendar.png`
- `tests/results/v0.6.0-exercise-service.json`
- `tests/results/v0.6.0-mobile.png`
- `tests/results/v0.6.0-schema.json`
- `tests/results/v0.6.0-smoke.json`
- `tests/results/v0.6.0.json`

### 수정

- `AGENTS.md`
- `CHANGELOG.md`
- `MANUAL_QA.md`
- `README.md`
- `REGRESSION_TEST.md`
- `RELEASE_REPORT.md`
- `REQUIREMENTS.md`
- `css/common.css`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/ROADMAP.md`
- `js/app.js`
- `js/bootstrap/bootstrap.js`
- `js/bootstrap/container.js`
- `js/config.js`
- `js/core/backup/backup-validator.js`
- `js/data/indexeddb/repositories/inbody.repository.js`
- `js/data/indexeddb/repositories/weight.repository.js`
- `js/pages/exercise/pass-schedule.page.js`
- `js/router.js`
- `service-worker.js`
- `tests/architecture-test.mjs`
- `tests/backup-test.mjs`
- `tests/browser-runner.mjs`
- `tests/browser/db-test.html`
- `tests/browser/db-test.js`
- `tests/browser/qa-feedback-test.js`
- `tests/exercise-service-test.mjs`
- `tests/qa-feedback-ui-tests.mjs`
- `tests/run-all-tests.mjs`
- `tests/schema-test.mjs`
- `tests/smoke-test.mjs`
- `tests/test-reporter.mjs`
- `tests/traceability.json`

### 삭제

없음.
