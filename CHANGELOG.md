# Changelog

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
