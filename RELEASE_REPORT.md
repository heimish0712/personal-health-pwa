# v0.7.0 Release Report

식단·사진 CRUD, 오프라인 사진 조회, Calendar 연결과 사진 포함 ZIP Backup v2를 구현했다. 기존 Local-first / Profile / Service / Repository / Semantic Command 구조를 유지했다.

## 버전 / Migration

| 항목 | 값 |
|---|---|
| APP / Cache | 0.7.0 / personal-health-pwa-v0.7.0 |
| DB_VERSION | **2** (기존 1→2) |
| Portable SCHEMA_VERSION | **1 유지** |
| SEED_VERSION | **1 유지** |
| Backup Format | **2 ZIP / 기존 1 JSON 호환** |
| Store | 15 (portable 12 + local 3) |
| Migration | media_blobs(storage_key)만 추가 |
| git diff 기준 | `a903c75a2cd95ff0b6ead77fb14f6ae330eabba3` |

누적 Migration의 v1은 원래 14개 Store를 생성하고, v2는 local media_blobs만 추가한다. 기존 Store·Index·행·Profile·Seed를 삭제하거나 재생성하지 않는다. Portable Schema는 1을 유지하므로 기존 JSON의 UUID/revision을 바꾸는 변환도 필요 없다.

## 구현 범위

- 식단 날짜 목록·이동, 식사 구분·내용·메모, 같은 날짜/구분의 여러 기록, soft-delete/복원.
- 카메라·갤러리 최대 12장, JPEG/PNG/WebP(25 MB/50 MP 이하). 방향을 정상화한 1280px 압축본과 320px 썸네일을 생성한다. WebP 품질은 0.82/0.75이며 미지원 시 JPEG로 재인코딩한다. 원본 저장은 하지 않는다.
- DietCommand가 diet_logs + diet_photos + media_blobs를 한 transaction으로 저장한다. 기존·신규 사진 혼합, 순서 유지, 개별 제거와 Profile/stale/Quota 검증을 지원한다. 이미지 처리와 checksum 계산은 transaction 밖에서 완료한다.
- Portable metadata와 Blob을 분리하고 MediaStorage Contract를 제공한다. 소유권은 scoped photo 조회로 확인한다. 목록은 thumbnail만, 상세는 큰 압축본을 읽으며 화면 이동 시 Blob URL을 해제한다.
- 삭제 사진 파일은 복원용으로 보존한다. 식단과 함께 삭제한 사진만 복원하고, 먼저 개별 제거한 사진은 제외한다. GC는 모든 Profile·삭제 metadata에서도 참조하지 않는 진짜 고아 파일만 지운다. 설정에서 전체 usage/quota, 사진 bytes, 영구 저장 요청, GC를 제공한다.
- Calendar에 diet_logs 원본 projection과 식단 열기를 추가했다. Calendar 썸네일은 선택사항으로 이번에는 생략하고 상세에서 사진을 확인한다. 기존 Profile+eaten_at / Profile+diet+sort 인덱스를 활용하며 범용 Repository는 유지했다.
- 사진이 있으면 ZIP v2, 없으면 기존 JSON v1을 내보낸다. 기존 v1 import와 pristine 복원, 별도 명시적 강제 교체·초기화 규칙을 유지한다.

## 검증 결과

**538 PASS / 0 FAIL / 41 NOT RUN**. 최종 `node tests/run-all-tests.mjs` 종료코드 0. 기존 자동 477건을 모두 유지하고 신규 61건(구조 1 / DB·미디어 52 / 실제 UI 8)을 통과했다. 과거 결과 파일은 보존했다.

### Migration 데이터 보존

실제 DB1 fixture에 Template v1/v2, 운동·pass usage·예약·일반 체중·인바디 연동·tombstone을 만든 뒤 업그레이드했다. 모든 portable 행의 UUID/revision/relation/created_at/updated_at/deleted_at과 device_id가 **100% 일치**했다. 새 media store만 빈 상태로 추가됐다. 업그레이드 강제 실패 후 DB1로 다시 열어도 원본이 같았으며 DB 자동 삭제는 없었다.

### Backup v1/v2 호환

기존 정상 v1 JSON을 DB2에 복원하여 data가 완전히 일치함을 확인했다. v2는 삭제 사진의 파일까지 포함하고 UUID/revision/storage_key/checksum/created_at을 보존한다. 복원 후 다시 내보낸 canonical portable hash와 mediaManifest도 원본과 일치했다.

실제 ZIP을 다운로드한 뒤 **두 번째 별도 Chrome Profile**에서 파일 선택 → pristine 복원 → 사진 표시까지 성공했다. 누락·변조·extra 파일·JSON 오류·중복 storage_key·삭제 식단의 active 사진은 CRC나 외부 JSON hash를 맞춰도 전체 거절했다. 강제 복원 성공, 복원 중단 시 rollback, 백업 후 초기화와 device_id 보존도 검증했다.

### 원자성 / 오프라인 / 화면

생성 4개 fault, 기존 수정·삭제·복원 3개 fault, QuotaExceeded, pristine 복원 4개 fault, 강제 복원 2개 fault에서 portable 데이터와 실제 binary hash가 모두 보존됐다.

합성 JPEG의 EXIF 회전과 WebP 미지원 시 JPEG fallback을 자동 검증했다. 실제 UI에서는 사진 혼합·제거·삭제·복원, thumbnail/main 조회, 오프라인 CRUD·재실행·Calendar·ZIP 다운로드를 검증했다. `tests/results/v0.7.0-diet.png`를 직접 확인했으며 412px 폭에서 사진 2장과 내용·버튼에 가로 넘침이 없었다.

실제 Pages/Galaxy의 카메라·갤러리·설치·비행기 모드·PC→폰 복원은 **NOT RUN**이다. MANUAL_QA에 새 8건의 목적, 사전조건, 버튼 순서, 입력값, 단계별 예상 결과, PASS 기준, 실패 증적, 원복법을 작성했다.

한 중간 실행은 테스트용 Chrome의 DevTools 준비 시간 초과로 실패했다. 시작 대기를 30초로 보완한 최종 전체 실행은 성공했다. 임시 Profile 정리는 Windows EPERM으로 일부 디렉터리가 남을 수 있음을 로그에 기록했다. 사용자 Chrome Profile과 운영 DB는 사용하지 않았다. 최종 실행 뒤 안내 문구·문서·추적표만 정정하고 diff와 문법을 확인했다.

## 발견한 기존 구조 문제와 수정

1. 식단 Repository에는 범용 조회만 있었다. 기존 복합 인덱스 기반 기간/사진 Query를 추가하고 BaseScopedRepository는 유지했다.
2. 사진 저장 추상화와 원자적 업무 경계가 없었다. MediaStorage Contract/Adapter와 DietCommand를 추가해 원본 처리·metadata·binary 책임을 분리했다.
3. Backup Core는 사진 metadata가 있으면 거절했다. 기존 v1 정책을 유지하면서 v2 codec, 전체 사전 검증, atomic media restore와 실제 Blob 사후 검증을 추가했다.
4. 초기화/교체 범위에 binary가 없었다. media를 같은 transaction에서 교체하고, 대상 fingerprint 및 백업 파일 재확인에 media를 포함했다.
5. 삭제 사진의 파일 수명 정책이 없었다. 복원용 tombstone 파일 보존과 고아 GC를 분리했다. 따라서 사진 삭제만으로 공간이 즉시 회수되지는 않는다.

## 적용 / 복구 / 제한

업데이트 전에 v0.6 JSON을 실제 파일로 보관한다. changed.zip은 기준 commit에 적용하는 변경분, full.zip은 .git/무시 파일을 제외한 전체 소스·문서·테스트, diff.patch는 신규 파일과 바이너리도 포함한다. 실제 배포·commit·push는 하지 않았다.

DB2를 연 뒤에는 DB1 전용인 이전 앱 파일만 되돌리는 downgrade를 지원하지 않는다. 문제가 생기면 원본 DB를 유지하고 업데이트 전 JSON 또는 새 ZIP을 별도 pristine 환경에서 확인한다. Migration 오류를 사용자 DB 삭제로 해결하지 않는다.

ZIP v2는 이미 압축된 이미지를 다시 압축하지 않는 STORE 방식만 지원한다(최대 250 MB / 10002 entries, JSON v1은 50 MB). ZIP64·암호화·외부 재압축 파일은 거절하므로 내려받은 ZIP을 그대로 옮긴다. HEIC는 JPEG로 변환 후 선택한다. 삭제 사진의 영구 purge UI와 Supabase/Sync는 후속 범위다.

## 산출물 검증

`C:/Users/Public/Documents/ESTsoft/CreatorTemp/health-pwa-v0.7.0/`에 changed.zip / full.zip / diff.patch / manifest.json을 제공한다. ZIP 항목과 각 파일 bytes 일치, `git apply --check --reverse`, `git diff --check`, 과거 결과 보존을 검증한다. 파일 목록은 아래와 manifest에 제공한다.

## 파일 변경: 신규 22 / 수정 47 / 삭제 0

### 신규

- `js/application/diet.service.js`
- `js/application/media.service.js`
- `js/core/backup/backup-media.js`
- `js/core/backup/zip-store.js`
- `js/core/media-rules.js`
- `js/data/contracts/diet-command.contract.js`
- `js/data/contracts/media-storage.contract.js`
- `js/data/indexeddb/commands/diet.command.js`
- `js/data/indexeddb/media-storage.js`
- `js/pages/diet/diet.page.js`
- `tests/browser/diet-test.js`
- `tests/diet-ui-tests.mjs`
- `tests/results/v0.7.0-architecture.json`
- `tests/results/v0.7.0-backup.json`
- `tests/results/v0.7.0-browser.json`
- `tests/results/v0.7.0-calendar.png`
- `tests/results/v0.7.0-diet.png`
- `tests/results/v0.7.0-exercise-service.json`
- `tests/results/v0.7.0-mobile.png`
- `tests/results/v0.7.0-schema.json`
- `tests/results/v0.7.0-smoke.json`
- `tests/results/v0.7.0.json`

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
- `docs/MIGRATION_POLICY.md`
- `docs/ROADMAP.md`
- `js/app.js`
- `js/application/backup-export.service.js`
- `js/application/backup-import.service.js`
- `js/application/backup-validation.service.js`
- `js/bootstrap/bootstrap.js`
- `js/bootstrap/container.js`
- `js/config.js`
- `js/core/backup/backup-format.js`
- `js/core/backup/backup-migrations.js`
- `js/core/backup/backup-validator.js`
- `js/data/indexeddb/backup/backup-restore.command.js`
- `js/data/indexeddb/backup/backup-snapshot.reader.js`
- `js/data/indexeddb/backup/restore-target.inspector.js`
- `js/data/indexeddb/migrations.js`
- `js/data/indexeddb/repositories/diet-log.repository.js`
- `js/data/indexeddb/repositories/diet-photo.repository.js`
- `js/data/indexeddb/schema.js`
- `js/pages/exercise/pass-schedule.page.js`
- `js/pages/settings/backup-restore.page.js`
- `js/router.js`
- `service-worker.js`
- `tests/architecture-test.mjs`
- `tests/backup-test.mjs`
- `tests/browser-runner.mjs`
- `tests/browser/db-test.html`
- `tests/browser/db-test.js`
- `tests/browser/health-test.js`
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
