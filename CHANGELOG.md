# Changelog

## v0.4.0 - 2026-09-07

### Added
- 설정의 현재 Profile JSON v1 백업 내보내기, 파일 검증, 미리보기, pristine 복원
- 12 Store 단일 readonly snapshot, scope/counts/data canonical JSON SHA-256
- UUID·revision·created_at·updated_at·deleted_at·역사적 Template 보존
- 50 MB 제한, format/버전/건수/행/소유권/참조/현재 고유키 검증, 사진 메타데이터 거절
- 13 Store 복원 전용 Command: 초기 자동생성 3행만 교체, 원본 add, device_id 유지
- commit 후 전체 portable snapshot hash 재검증, 재실행·동시 복원·변경된 대상 차단
- 오프라인 다운로드/복원 UI 및 실제 IndexedDB rollback·동일성·화면 회귀 테스트
- 실제 백업 파일의 .gitignore 제외 규칙

### Changed
- App/cache 0.3.0 → 0.4.0, BACKUP_FORMAT_VERSION 1 추가
- 사용자 최종 지시에 따라 기존 자동 Seed 부팅 유지, 설정에서 pristine 복원
- 테스트 출력은 v0.4.0 경로 사용; v0.3 FINAL과 과거 자동결과 보존
- 이용권·예약 개발은 v0.5.0으로 순연

### DB / Migration
- DB 1 / Schema 1 / Seed 1 / 14 Store 및 인덱스 유지, Migration 없음
- 일반 CRUD Repository와 운동 업무 로직 유지, 삭제 파일 없음

### Verification
- 최신 PASS/FAIL/NOT RUN은 REGRESSION_TEST.md와 tests/results/v0.4.0.json 참조
- 사용자 실기기 QA는 별도이며 v0.3 사용자 PASS를 v0.4에 자동 승계하지 않음


## 문서 정정 및 후속 설계 - 2026-09-07

- 사용자 QA 보고를 반영하여 v0.3.0 FINAL BASELINE을 `186 PASS / 0 FAIL / 0 NOT RUN`으로 확정
- 기존 `180 PASS / 0 FAIL / 6 NOT RUN` 자동결과 JSON은 당시 실행 이력으로 보존하고 최종 문서와 출처를 구분
- Backup Core → 이용권·예약 → 체중·인바디 → 식단·사진 → Backup v2 → 홈·통합 캘린더 완성 → 운영 안정화 → Supabase/Auth/Sync 순서 기록
- JSON Backup v1의 12 Store 범위, 메타데이터·관계 보존, 검증, 병합 없는 빈 환경 복원 상세 설계 추가
- 이용권의 운동기록별 `status = used` 최대 1건 규칙, 취소 이력 보존, 기능별 기간 인덱스 조회 원칙 기록
- `AGENTS.md`에 협업·변경·회귀검증 작업 규칙 기록
- 문서만 변경. App `0.3.0` / DB `1` / Schema `1` / Seed `1` 유지, Migration 없음, 삭제 파일 없음
- Backup Core 기능과 해당 인수 테스트는 미구현·미실행

## v0.3.0 - 2026-09-05

### Added
- 실제 `운동` 탭: 주간 요약, 운동 종류 필터, 최근 기록, 운동 기록/관리 진입
- 운동 종류 생성·수정·활성/비활성·soft-delete·restore
- 운동 종류 생성과 Template v1 생성을 하나의 semantic Command / IndexedDB transaction으로 처리
- Template 수정 시 기존 버전을 `superseded`로 보존하고 신규 버전을 생성하는 원자적 Command
- 표준 운동 필드 Catalog: 운동시간, 거리, 걸음수, 페이스, 칼로리
- 사용자 정의 필드: number / text / textarea / boolean / select
- 사용자 정의 필드의 UUID 기반 고정 key와 label 변경 독립성
- Template 기반 동적 운동 기록 폼
- 운동 기록 생성·조회·수정·soft-delete 및 Service-level restore
- 과거 운동 기록의 생성 당시 `template_id` 보존 및 과거 양식 기준 수정
- 공통 운동 메모 필드
- Profile timezone 기반 로컬 입력 ↔ UTC ISO 변환 유틸리티
- 입력 중 이탈 방지 Dirty Form Guard
- 운동 Application Service 단위검사 및 브라우저 IndexedDB 운동 회귀 케이스
- 사용자 작업 오류용 안전한 오류 메시지 매핑

### Changed
- APP_VERSION `0.2.0 -> 0.3.0`
- CACHE_VERSION `personal-health-pwa-v0.2.0 -> personal-health-pwa-v0.3.0`
- 운동 placeholder를 실제 Exercise Core 화면으로 교체
- Hash Router를 운동 상세/입력/관리 동적 경로까지 확장
- 중첩 운동 화면에서도 하단 `운동` 탭이 활성 상태를 유지하도록 변경
- Application Service는 IndexedDB Adapter를 직접 알지 않고 기존 Repository Contract / semantic Command Port를 계속 사용
- Template 양식 수정 충돌검사를 `expectedTemplateId + expectedTemplateRevision` 쌍으로 강화
- Service Worker App Shell에 신규 운동 모듈을 추가하되 테스트 파일은 캐시하지 않음

### Fixed
- Template 버전마다 `revision = 1`부터 시작할 수 있어 revision 숫자만 비교하면 `v1/rev1`과 `v2/rev1`을 구분하지 못하는 충돌 판정 공백을 제거
- 운동 이름별 분기 하드코딩 없이 Template 데이터만으로 폼이 구성되도록 고정
- 과거 기록 수정 시 최신 Template으로 자동 마이그레이션되어 필드가 손실될 수 있는 경로를 차단
- 내부 Conflict/DB 오류 문자열이 사용자 Toast에 그대로 노출될 수 있는 경로를 안전한 작업 오류 메시지로 매핑

### DB
- DB_VERSION: `1` 유지
- SCHEMA_VERSION: `1` 유지
- SEED_VERSION: `1` 유지
- Object Store: `14` 유지
- 신규 Store / Index: 없음
- 기존 Profile / 필라테스 Seed / Template v1 재생성 없음

### Migration
- 없음
- v0.2.0의 DB v1을 그대로 사용
- 기능 버전 상승만으로 DB_VERSION을 올리지 않음

### Verification
- Node 정적/아키텍처/Schema/Application Service: `180 PASS / 0 FAIL`
- 당시 자동검증: Browser runtime `1 NOT RUN`, GitHub Pages/갤럭시 `5 NOT RUN`; 총합 `180 PASS / 0 FAIL / 6 NOT RUN` 원본 JSON 보존
- 이후 사용자 QA: GitHub Pages·갤럭시·오프라인·`db-test.html` 통과, 기존 미실행 6건 해소
- 최종 회귀 기준: **`186 PASS / 0 FAIL / 0 NOT RUN`** (2026-09-07 문서 반영)
- 추가 6건은 사용자 보고에 따른 QA PASS이며 자동검증 재실행 결과가 아님

### Known Issues
- 다음 개발은 Backup Core이며 이용권 차감과 운동 예약/예정은 그 이후 구현
- 캘린더 실제 데이터 연결, 홈 통계 확장은 후속 버전 예정
- 운동 기록 휴지통/복원 UI는 아직 없으며 Service/Repository 기반만 유지
- 식단, 사진 Blob, 체중, 인바디, 백업/복원, Supabase Sync 미구현
- 실제 GitHub Pages 및 갤럭시에서 v0.2.0 -> v0.3.0 업데이트 검증은 사용자 QA로 통과 확인

## v0.2.0 - 2026-09-04

### Added
- Local Profile 및 `IdentityContext`
- 동기화 대상 행의 UUID / `profile_id` / 공통 timestamp / `deleted_at` / `revision`
- Repository Contract와 Profile 범위 IndexedDB Adapter
- Bootstrap Command Port와 IndexedDB Unit of Work
- 14개 IndexedDB Object Store 및 복합 Index
- Profile + 필라테스 + Template + 기기 포인터 원자적 Seed
- Seed 중복 방지용 `system_key = default.pilates`
- expectedRevision 기반 낙관적 충돌 차단
- soft-delete / include-deleted 조회 / restore
- 사용자 설정과 기기 설정 Store 분리
- 식단 사진 메타데이터 Store와 향후 Blob 분리 경계
- 최대 200건 로컬 시스템 오류로그
- 설정 화면 읽기 전용 DB 진단
- 정적 Architecture/Schema Test
- Headless Chrome 기반 실제 IndexedDB Browser Test
- 요구사항-테스트 추적 JSON 및 기계 판독 결과
- Windows 로컬 실행/테스트 배치파일
- Architecture / Data Model / Migration 문서

### Changed
- APP_VERSION `0.1.0 -> 0.2.0`
- CACHE_VERSION `personal-health-pwa-v0.1.0 -> personal-health-pwa-v0.2.0`
- DB_VERSION `0 -> 1`
- 앱 시작 순서를 DB open -> Migration -> Profile/Seed -> Router 순으로 변경
- Service Worker가 이 앱의 cache prefix만 정리하도록 범위 축소
- 비탐색 정적 자원 오프라인 실패 시 index.html을 잘못 반환하지 않도록 fetch fallback 분리
- 홈에 로컬 데이터 계층 준비 상태 표시
- 설정 화면에 DB Version, Store, Profile, Seed, 최근 오류 진단 표시
- UI에 구체 Container를 노출하지 않고 진단 Service와 Logger만 전달하도록 경계 축소
- DB 재시도 전 시작 오류가 동일 Logger 메모리 큐를 거쳐 복구 후 기록되도록 변경
- 새 Service Worker 설치 시 App Shell 파일을 재검증하도록 변경
- 테스트 시작 전 구 결과를 삭제하고 결과 파일 누락을 FAIL 처리하도록 변경

### Fixed
- 향후 서버화를 `IndexedDB Repository 교체`로 오해할 수 있던 구조를 `IndexedDB 유지 + 향후 Sync 계층 추가`로 수정
- 일반 물리삭제로 오프라인 삭제 Tombstone을 잃을 수 있는 설계 수정
- UI payload의 `profile_id`를 신뢰할 수 있던 소유권 공백 제거
- `updated_at`만으로 충돌을 판단하던 공백을 revision으로 보완
- 단일 settings Store의 동기화 범위 모호성을 해소

### DB
- DB_VERSION: `0 -> 1`
- SCHEMA_VERSION: `1`
- SEED_VERSION: `1`
- Object Store: 14개 신규 생성
- 기존 v0.1.0 IndexedDB 사용자 데이터: 없음

### Migration
- `oldVersion 0 -> newVersion 1`
- Store 삭제/clear 없음
- Migration 실패 시 DB 자동삭제 없음
- v1 close/reopen 데이터 보존 테스트 포함

### Verification
- Automated: `189 PASS / 0 FAIL`
- Manual deployment/device: `5 NOT RUN`
- 실제 Chromium에서 IndexedDB, repository 하위 경로, Service Worker, Cache Storage, 완전 오프라인 재실행 검증

### Known Issues
- 실제 운동/식단/체중/인바디 입력 기능 미구현
- 실제 사진 Blob Store와 압축 기능은 식단 사진 버전에서 추가
- Sync Outbox, Supabase Auth, RLS, PostgreSQL/Storage 연결 미구현
- GitHub Pages 업데이트/갤럭시 설치/오프라인 재실행은 배포 후 수동검증 필요
- iOS/Safari는 이번 버전 검증 범위 밖

## v0.1.0 - 2026-09-04

### Added
- GitHub Pages 프로젝트 경로 대응 PWA Skeleton
- Web App Manifest 및 앱 아이콘
- Service Worker App Shell 캐시
- 홈 / 캘린더 / 운동 / 식단 / 체중 하단 5탭
- Hash Router 및 사용자 선택형 업데이트 배너
- README / 요구사항 / 회귀 검증 문서

### DB
- DB_VERSION: 0
- IndexedDB 미구현
