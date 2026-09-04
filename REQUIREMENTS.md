# Requirements

이 문서는 구현 중 임의 회귀를 방지하기 위한 요구사항 기준선입니다.

## Application / Navigation

- **APP-001** 앱은 GitHub Pages에서 실행 가능해야 한다.
- **APP-002** 앱은 지원 브라우저에서 PWA로 설치 가능해야 한다.
- **APP-003** 설치된 앱은 `standalone` 모드로 실행되어야 한다.
- **APP-004** 최초 온라인 로딩 이후 App Shell은 오프라인에서 다시 열 수 있어야 한다.
- **NAV-001** 하단 탭은 `홈 / 캘린더 / 운동 / 식단 / 체중` 5개로 고정한다.
- **NAV-002** GitHub Pages 404 회피를 위해 Hash Router를 사용한다.
- **NAV-003** 알 수 없는 라우트는 `/home`으로 정규화한다.
- **NAV-004** 설정은 하단 독립 탭으로 추가하지 않고 헤더에서 진입한다.

## Architecture

- **ARCH-001** UI/Page는 IndexedDB에 직접 접근하지 않는다.
- **ARCH-002** Application Service는 구체 IndexedDB Adapter를 import하지 않는다.
- **ARCH-003** 구체 Contract/Adapter 연결은 Dependency Injection Container에서 수행한다.
- **ARCH-004** Application Service에 일반 IndexedDB transaction callback을 노출하지 않는다.
- **ARCH-005** 다중 Store 업무는 업무 의미를 가진 Command Port 단위로 묶는다.
- **ARCH-006** 일반 Repository Contract에는 물리삭제, 전체 초기화, 무조건 덮어쓰기 기능을 노출하지 않는다.
- **ARCH-007** UI에는 구체 DI Container를 노출하지 않고 필요한 Application Service만 제공한다.

## Profile / Ownership

- **PROFILE-001** 최초 실행 시 Local Profile을 생성한다.
- **PROFILE-002** Profile 초기화는 반복 실행되어도 중복 Profile을 만들지 않는다.
- **PROFILE-003** 현재 Profile은 `IdentityContext`로 관리한다.
- **PROFILE-004** 잘못된 `current_profile_id`는 기존 활성 Profile로 복구한다.
- **DATA-SCOPE-001** 동기화 대상 데이터는 `profile_id`를 가진다.
- **DATA-SCOPE-002** 사용자 payload의 `profile_id`를 신뢰하지 않고 현재 Profile을 강제한다.
- **DATA-SCOPE-003** 현재 Profile 범위 밖 데이터는 조회·수정할 수 없다.

## ID / Time / Revision

- **DATA-ID-001** 주요 엔티티 ID는 클라이언트 생성 UUID v4를 사용한다.
- **DATA-TIME-001** 시각 필드는 UTC ISO 문자열로 저장한다.
- **DATA-TIME-002** `created_at`은 수정 시 보존하고 `updated_at`만 갱신한다.
- **DATA-REV-001** 동기화 대상 행은 양의 정수 `revision`을 가진다.
- **DATA-REV-002** 신규 행 revision은 1이다.
- **DATA-REV-003** 수정·삭제·복원 시 `expectedRevision`을 검증한다.
- **DATA-REV-004** 오래된 revision의 저장은 임의 덮어쓰기하지 않고 충돌로 거부한다.

## Delete

- **DATA-DEL-001** 일반 삭제는 `deleted_at` 기반 soft-delete다.
- **DATA-DEL-002** 일반 조회는 soft-delete 행을 제외한다.
- **DATA-DEL-003** 명시적 include-deleted 조회와 restore를 지원한다.
- **DATA-DEL-004** 일반 기능에서 물리삭제 API를 호출할 수 없게 한다.

## Database / Migration

- **DB-001** 사용자 데이터는 IndexedDB에 저장한다.
- **DB-002** DB 접근은 공통 Database/Adapter 계층을 통한다.
- **DB-003** v0.2.0은 14개 Object Store를 생성한다.
- **DB-004** 향후 동기화 대상 Store와 로컬 전용 Store를 분류한다.
- **DB-005** Profile 범위 및 핵심 관계의 복합 Index를 정의한다.
- **DB-006** 실제 기능과 테스트 DB 이름을 분리한다.
- **MIG-001** DB Schema 변경은 누적 Migration으로 관리한다.
- **MIG-002** Migration은 기존 Store를 임의 삭제하거나 clear하지 않는다.
- **MIG-003** Migration 실패 시 사용자 DB를 자동 삭제하지 않는다.
- **MIG-004** DB close/reopen 후 기존 데이터를 유지한다.

## Seed

- **SEED-001** 최초 Profile에 필라테스 기본 운동을 생성한다.
- **SEED-002** 필라테스 기본 Template v1은 `duration_minutes`를 가진다.
- **SEED-003** Seed는 반복 실행되어도 중복 데이터를 생성하지 않는다.
- **SEED-004** Seed는 사용자가 수정한 이름을 원복하지 않는다.
- **SEED-005** 사용자가 soft-delete한 Seed를 자동 복원하지 않는다.
- **SEED-006** 시스템 Seed는 `system_key`, 사용자 생성 데이터는 system_key 없음으로 구분한다.

## Transaction / Uniqueness

- **TX-001** Device/Profile/필라테스/Template/현재 Profile 포인터 생성은 하나의 transaction으로 처리한다.
- **TX-002** 다중 Store transaction 실패 시 부분 데이터를 남기지 않는다.
- **UNIQUE-001** Profile별 기본 `system_key` 중복을 차단한다.
- **UNIQUE-002** Profile/운동/Template version 중복을 차단한다.
- **UNIQUE-003** 동일 이용권/운동기록의 중복 차감을 차단한다.

## Settings / Media / Log

- **SET-001** 사용자 동기화 설정과 기기 로컬 설정을 분리한다.
- **MEDIA-001** 식단 사진 메타데이터와 실제 Blob 저장소를 분리한다.
- **LOG-001** 핵심 시스템 오류를 로컬 `app_logs`에 기록한다.
- **LOG-002** `app_logs` 보존량은 최대 200건으로 제한한다.
- **LOG-003** DB가 열리기 전 시작 오류는 메모리 큐에 보관하고 재시도 성공 후 로컬 로그로 이관할 수 있어야 한다.
- **DIAG-001** 설정 화면에서 DB/Schema/Store/Profile/Seed 상태를 읽기 전용으로 진단한다.
- **DIAG-002** v0.2.0에는 DB 초기화·전체삭제 UI를 만들지 않는다.

## Update / Cache

- **UPD-001** 새 Service Worker 발견 시 앱을 강제 새로고침하지 않는다.
- **UPD-002** 사용자가 `업데이트`를 선택한 뒤에만 대기 중 Service Worker를 활성화한다.
- **CACHE-001** 새 캐시 활성화 시 이 앱의 구 App Shell 캐시만 제거한다.
- **CACHE-002** Service Worker 캐시 정리와 IndexedDB 사용자 데이터를 분리한다.
- **CACHE-003** 새 Service Worker 설치 시 App Shell 파일을 현재 배포본 기준으로 재검증한다.
- **CACHE-004** 이 앱의 cache prefix와 무관한 다른 Cache Storage는 삭제하지 않는다.

## Future Sync Boundary

- **SYNC-001** 향후 Supabase 연결 후에도 IndexedDB를 로컬 원장으로 유지한다.
- **SYNC-002** Application Service는 원격 저장소 구현을 직접 알지 않는다.
- **SYNC-003** 향후 동기화 상태는 별도 Outbox/Sync Store로 관리한다.
- **SYNC-004** 사진 바이너리는 향후 원격 DB 행이 아니라 Storage Adapter로 처리한다.

## Error / Version

- **ERROR-001** 내부 브라우저/DB 오류 문자열을 사용자에게 그대로 노출하지 않는다.
- **ERROR-002** DB 초기화 실패 시 흰 화면 대신 재시도 가능한 오류 상태를 표시한다.
- **ERROR-003** DB 오류 시 사용자 DB를 자동 초기화하지 않는다.
- **VERSION-001** 앱·캐시·DB·Schema·Seed 버전은 `js/config.js`에서 중앙 관리한다.

## Test / Release Discipline

- **TEST-001** 자동검증 시작 전 같은 버전의 이전 결과 파일을 제거한다.
- **TEST-002** 예상 결과 파일이 생성되지 않으면 누락을 FAIL로 기록한다.
- **TEST-003** 실행하지 못한 브라우저·실기기 검증은 PASS가 아니라 NOT RUN으로 기록한다.
- **TEST-004** 브라우저 자동검증은 운영 DB와 다른 테스트 DB 및 임시 브라우저 Profile을 사용한다.
- **REL-001** 코드 릴리스는 변경 파일 ZIP, 전체 소스 ZIP, 이전 버전 대비 diff patch를 기본 산출물로 제공한다.
- **REL-002** 릴리스마다 변경 파일 수, DB Version, Migration, 영향 범위, 적용·복구 절차를 기록한다.
