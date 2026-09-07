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
- **ERROR-004** 일반 CRUD 충돌·검증 오류는 내부 DB 오류 문자열 대신 작업 맥락에 맞는 안전한 사용자 메시지로 표시한다.
- **VERSION-001** 앱·캐시·DB·Schema·Seed 버전은 `js/config.js`에서 중앙 관리한다.


## Exercise Core

- **EX-001** 필라테스는 최초 Seed 운동으로 표시하되 코드에서 특별 분기하지 않는다.
- **EX-002** 사용자는 Profile 범위 안에서 새로운 운동 종류를 생성할 수 있다.
- **EX-003** 운동 종류(`exercise_types`)와 기록 양식(`exercise_templates`)을 분리한다.
- **EX-004** 운동 기록 입력 폼은 Template 데이터 기반으로 동적으로 생성한다.
- **EX-005** `performed_at`과 `memo`는 모든 운동 기록의 공통 고정 필드다.
- **EX-006** 사용자 정의 필드는 number/text/textarea/boolean/select 타입을 지원한다.
- **EX-007** 사용자 정의 필드의 내부 key는 label 변경과 독립적으로 유지한다.
- **EX-008** Template 변경 시 기존 Template 행을 덮어쓰지 않고 새 version을 생성한다.
- **EX-009** 과거 운동기록은 생성 당시 `template_id`를 계속 참조한다.
- **EX-010** 과거 기록 수정 시 최신 Template으로 자동 변환하지 않는다.
- **EX-011** 운동 종류와 운동 기록의 삭제는 공통 soft-delete 정책을 따른다.
- **EX-012** 운동 종류 생성 + Template v1 생성은 하나의 semantic Command transaction으로 처리한다.
- **EX-013** Template 교체는 기존 active Template supersede + 신규 Template 생성이 하나의 transaction이어야 한다.
- **EX-014** Template 변경의 낙관적 충돌검사는 `expectedTemplateId + expectedTemplateRevision`을 함께 검증한다.
- **EX-015** 운동 기록 수정·삭제·복원은 기존 `expectedRevision` 규칙을 유지한다.
- **EX-016** 비활성 또는 soft-delete된 운동에는 신규 기록을 생성하지 않는다.
- **EX-017** 운동 주간 요약은 원본 `exercise_logs`에서 계산하고 별도 카운터로 저장하지 않는다.
- **EX-018** 운동 화면과 동적 폼은 `필라테스`, `러닝` 등 특정 운동 이름에 의존한 조건 분기를 두지 않는다.
- **EX-019** 날짜/시간 UI는 Profile timezone 기준으로 입력하고 DB에는 UTC ISO 시각으로 저장한다.
- **EX-020** 운동 입력 중 변경사항이 있으면 라우트 이동·앱 업데이트 전에 이탈을 확인한다.

## Test / Release Discipline

- **TEST-001** 자동검증 시작 전 같은 버전의 이전 결과 파일을 제거한다.
- **TEST-002** 예상 결과 파일이 생성되지 않으면 누락을 FAIL로 기록한다.
- **TEST-003** 실행하지 못한 브라우저·실기기 검증은 PASS가 아니라 NOT RUN으로 기록한다.
- **TEST-004** 브라우저 자동검증은 운영 DB와 다른 테스트 DB 및 임시 브라우저 Profile을 사용한다.
- **REL-001** 코드 릴리스는 변경 파일 ZIP·전체 소스 ZIP·diff patch 또는 검토 가능한 git diff를 제공한다. 신규 파일도 검토 대상에 포함한다.
- **REL-002** 릴리스마다 변경 파일 수, DB Version, Migration, 영향 범위, 적용·복구 절차를 기록한다.
- **TEST-005** v0.3 FINAL 회귀 기준은 `186 PASS / 0 FAIL / 0 NOT RUN`, App `0.3.0` / DB `1` / Schema `1` / Seed `1`이다. 당시 자동검증 JSON과 이후 사용자 QA를 출처별로 구분한다.
- **TEST-006** 후속 버전은 새 실행 결과를 별도로 기록한다. 미실행 항목에 과거 PASS를 승계하지 않고 사용자 실기기 QA를 자동 PASS 처리하지 않는다.
- **REL-003** 기존 정상 기능을 임의 재작성하지 않으며 실제 코드 기준으로 작업하고 삭제 파일을 명시한다. CHANGELOG·REQUIREMENTS·REGRESSION_TEST를 갱신한다.

## Backup Core — v0.4.0

2026-09-07 사용자 최종 지시로 구현한 범위다. 이전 Seed 생성 전 복원 설계를 대체한다. 상세 설계는 [BACKUP_CORE_DESIGN.md](docs/BACKUP_CORE_DESIGN.md), 실행 결과는 REGRESSION_TEST.md를 따른다.

- **BACKUP-001** 현재 Profile의 12개 동기화 대상 Store를 JSON으로 내보낸다. Profile 범위를 강제하며 device_settings·app_logs·사진 Blob은 포함하지 않는다.
- **BACKUP-002** ID, profile_id, created_at, updated_at, revision, deleted_at, 역사적 Template 및 참조 관계를 보존한다. 내보내기와 복원에서 행을 정규화하거나 메타데이터를 재생성하지 않는다.
- **BACKUP-003** format=personal-health-pwa-backup, backupVersion, source, exportedAt, scope, counts, data, integrity 구조를 사용한다. scope+counts+data의 canonical JSON SHA-256을 검사한다. 입력 한도는 50 MB이며 appVersion/dbVersion 차이는 거절 기준이 아니다.
- **BACKUP-004** 파일 구조, 지원 버전, checksum, UUID·메타데이터, Profile 범위, 관계, 현재 고유 인덱스 조건을 검증하고 오류가 있으면 복원 쓰기를 시작하지 않는다.
- **BACKUP-005** 병합 없는 pristine 환경 복원만 지원한다. 수정되지 않은 최초 Profile·필라테스·Template 3행과 사용자 데이터 0행을 transaction 안에서 재확인한다. 확인된 초기 3행만 복원 전용 Adapter에서 제거하고 원본 데이터를 삽입한다. soft-delete·사용자 설정·변경 Seed가 있으면 거절한다.
- **BACKUP-006** Snapshot은 하나의 readonly transaction으로 읽는다. 복원은 전용 Semantic Command의 단일 readwrite transaction에서 대상 조건 재검사, 행 삽입, 현재 Profile 포인터 연결을 함께 처리한다.
- **BACKUP-007** 일반 Repository의 create/update API를 import에 사용하지 않는다. 부분 복원, UUID 재발급, stale 미리보기 기반 덮어쓰기를 허용하지 않는다.
- **BACKUP-008** 기존 자동 Profile/Seed 부팅을 유지하고 설정에서 복원한다. 취소·실패 시 최초 Profile/Seed와 기기 설정을 보존한다. commit 후 전체 portable snapshot hash를 원본과 비교하고 성공 후 새로고침한다.
- **BACKUP-009** 복원 미리보기에 Profile·시각·항목 수·삭제 포함 수·검증 결과를 보여주고 사용자가 복원 실행을 선택한 뒤 저장한다. 중복 실행과 저장 중 이동·업데이트를 제어한다.
- **BACKUP-010** 기존 기능, 실패 rollback, 재시도·동시성, close/reopen·오프라인, 실제 파일 저장·선택·복원 흐름을 검증한다. 자동검증과 사용자 QA를 분리한다.
- **BACKUP-011** 사진 도입 후 Backup v2를 ZIP(data.json + media/)으로 확장하고 JSON Backup v1 읽기 호환을 유지한다. v2 구현은 Backup Core 범위 밖이다.
- **BACKUP-012** diet_photos에 한 행이라도 있으면 Backup v1 Export/Import를 BACKUP_MEDIA_UNSUPPORTED로 거절한다. device_id는 복원 중 변경하지 않는다. 실제 백업 파일 패턴은 .gitignore로 제외한다.

## 후속 설계 원칙 (해당 기능 개발 시 적용)

- **PASS-FUTURE-001** 운동기록 하나에 `status = used` 사용로그는 최대 1건, cancelled 이력은 여러 건 허용한다. Command transaction에서 검사하고 운동기록·사용원장·예약 완료를 원자적으로 처리한다.
- **PASS-FUTURE-002** A 취소 → B 사용·취소 → A 재사용 이력을 별도 행으로 보존한다. 현재 `UNIQUE-003`의 쌍 고유 인덱스는 v0.3 기준으로 유지하고, 이용권 개발 시 누적 Migration으로 교체하여 이력 정책과 멱등성 규칙을 함께 검증한다. exercise_log_id 단독 UNIQUE를 추가하지 않는다.
- **QUERY-FUTURE-001** BaseScopedRepository.list()는 유지하고 기간 조회가 필요한 기능별 Repository에 기존 Profile+날짜 인덱스 메서드를 추가한다.


## v0.5.0 Pass & Schedule — 구현 요구사항

아래 최신 규칙이 이전 로드맵의 동일 pass 재사용 시 새 usage 생성 제안을 대체한다.

- **V05-PASS-001** 운동별 이용권 이름·총횟수·시작/종료일·메모·활성 상태 관리. 잔여횟수는 저장하지 않고 deleted_at=null, status=used 원장의 used_count 합계로 계산.
- **V05-PASS-002** 운동기록 1건의 active usage는 최대 1건. 같은 이용권 수정은 추가 차감 없음. 선택 해제는 cancelled. 같은 쌍 재적용은 기존 ID 재활성화. 다른 이용권 전환은 취소+적용 원자적 실행.
- **V05-PASS-003** log 삭제는 usage 취소, 복원은 실제 운동일·이용권 활성·잔여량 재검증. 선택 의도 pass_id는 삭제 시 보존하고 차감 해제 시 null로 변경.
- **V05-PASS-004** 유효기간은 Profile timezone의 실제 운동일 양끝 포함. 현재 날짜와 비교하지 않음. 총횟수는 현재 유효 사용량 미만으로 낮출 수 없음. 기존 사용일을 제외하는 기간 축소는 거절.
- **V05-PASS-005** 사용이력(취소 포함)이 있으면 삭제 요청은 inactive 처리. 기존 유효 차감은 비활성화 후에도 그대로 유지하며 수정 가능; 신규/복원 차감은 불가.
- **V05-SCHEDULE-001** 예약 생성·수정·취소는 차감 없음. 예정 시간 1~1440분, 날짜·운동·메모와 상태 관리.
- **V05-SCHEDULE-002** 예정 예약 완료는 schedule+log+optional usage 원자 처리. 같은 expectedRevision의 완료 재시도는 기존 결과 반환. 완료 취소 이후 이전 요청은 충돌 처리.
- **V05-SCHEDULE-003** 완료 취소는 linked log soft-delete+usage cancelled+scheduled 원자 처리. 연결 ID와 역사적 Template 유지, 명시적 재완료는 같은 기록/원장 ID 복원. 완료 이력이 있는 예약의 운동 종류 변경 금지.
- **V05-SCHEDULE-004** 완료 예약 수정은 완료 취소 선행. 완료 기록 직접 삭제와 완료 취소된 연결 기록 직접 복원은 예약 Command로 안내. 완료 기록의 메모/시간/이용권 수정은 운동 Command로 가능.
- **V05-QUERY-001** 캘린더는 원본 예약·운동기록 Store에서 Profile+UTC [start,end) 인덱스로 조회. UI 종료일은 포함하여 다음날 00시로 변환. 주간 요약도 기존 기간 인덱스 사용.
- **V05-ATOMIC-001** Service는 일반 transaction에 접근하지 않음. ActivityCommand Port가 다중 Store 검증·쓰기·동시성·rollback 담당, 향후 Supabase RPC로 대체 가능.
- **V05-BACKUP-001** Backup v1의 ID·revision·관계·삭제 상태 보존을 유지하고 pass_id 및 한 기록의 중복 active usage 검증. 새 Store/인덱스/Migration 없음.
- **V05-QA-001** 실제 IndexedDB 실패 주입, 중복 완료, 마지막 잔여 동시 사용, 오프라인 UI·재실행, v0.4 전체 자동 회귀. Pages/Galaxy 미실행은 NOT RUN.


## v0.5.1 QA 피드백 — 최신 규칙

이 절이 과거의 pristine 복원만 지원/초기화 미지원/기간 목록 캘린더 설명을 대체한다. 기존 일반 복원과 일반 CRUD 안전 경계는 유지한다.

- **QA051-01/02** 완료 화면에서 actual local exercise day에 유효한 active/remaining>0 이용권을 생성시각·ID 순서로 표시하고 첫 항목 기본 선택. 없으면 차감 없음. 사용자가 선택 변경 가능, 최종 검증은 기존 Command.
- **QA051-03/04** 월간 달력 첫 진입은 Profile timezone 오늘 선택. 오늘/선택 표시는 별개. 이전/다음 달·오늘 이동, 날짜별 하단 목록. 기존 날짜 인덱스 사용.
- **QA051-05/06** 연결 완료 예약+운동기록은 projection에서 한 항목. 실제 운동일에 완료 · 운동기록 표시, 직접 기록은 별도. 엔티티/관계 수정 없음.
- **QA051-07/08/09** 운동 전환 시 날짜·시간·메모 유지. 같은 field key/동일 type 값만 전달, 삭제/타입 변경/허용되지 않는 select 옵션은 전달하지 않음. 오래된 비동기 응답은 UI에 반영하지 않음.
- **QA051-10/11/12** active→비활성화, inactive→활성화. status 변경으로 soft-delete 금지; usage/remaining 불변, expectedRevision 검증.
- **QA051-13/14/15/16** 전체 초기화는 백업 여부 선택 및 명시적 확인. 백업 후 진행 시 생성/검증/다운로드한 파일 재검증 후에만 삭제. 예외/취소는 삭제 금지. 기본 Profile/Seed를 같은 transaction에서 재생성, device_id 유지.
- **QA051-17/18/19/20/21/22** 일반 복원은 non-pristine 차단. 별도 강제 복원은 검증 파일로 모든 portable user data를 교체, merge 없음. 삭제+삽입+pointer 전환 원자 처리, 실패 rollback, 원본 ID/metadata 보존, commit 후 hash 검증. 기기/진단 데이터 유지.
- **QA051-23/24** 오프라인 백업·초기화·강제 복원, 기존 전체 회귀 FAIL0. 실제 Pages/Galaxy 검증은 별도 NOT RUN.
- 초기화/강제 교체 범위는 전체 portable Store(모든 Profile)다. Backup v1은 한 Profile만 export하므로 복수 Profile이 감지된 경우 백업 후 전체 교체 경로는 차단하고 별도 보관하도록 안내한다. 백업 없이 실행은 모든 Profile 삭제 경고와 최종 확인을 거친다.
- 대상 fingerprint를 준비 및 transaction 시점에 비교한다. 다른 탭의 변경·먼저 완료된 교체가 있으면 오래된 계획으로 덮어쓰지 않는다.


## v0.6.0 Weight & InBody — 구현 기준

- **HEALTH-CRUD** 일반 체중/인바디 CRUD는 Profile/UUID/revision/soft-delete를 유지한다. 일반 체중은 단일 Repository, 연동 인바디는 Semantic Command를 사용한다. 직접 usage 변경 등 기존 업무 범위는 변경하지 않는다.
- **HEALTH-TIME** 동일 날짜의 여러 기록 허용. 저장 UTC ISO, 입력/기간/달력은 Profile timezone. 정렬은 measured_at, 동일 시각은 UUID 순서로 결정한다. 최신과 직전은 역순 상위 2개 활성 weight_logs이며 생성 시각을 사용하지 않는다. 초·밀리초가 있는 가져온 기록도 편집 중 보존한다.
- **HEALTH-METRIC** measured_at 필수. 일반 weight는 양의 유한 숫자 필수. 인바디의 weight/골격근량/체지방량/체지방률/BMI/내장지방레벨/기초대사량은 선택, 미입력 null. weight/BMI는 양수, 다른 지표는 0 이상, 체지방률은 100 이하. 문자열/boolean/NaN/Infinity 불가. 메모는 최대 2000자, 의료적 정상/이상 판정 없음.
- **HEALTH-LINK** `이 체중을 체중 기록에도 추가` ON이면 weight 필수. source=inbody/source_ref_id=원본UUID, 기존 uq_profile_source_ref index 재사용. 연결 체중의 독립 변경을 Service에서 차단하고 UI는 인바디 화면으로 이동시킨다.
- **HEALTH-ATOMIC** 저장/수정은 값·일시·메모 동기화, OFF는 연결 행 soft-delete, ON은 삭제된 동일 행 restore/reuse. 삭제/복원은 한 transaction. link_weight는 삭제 시 보존되는 선택 의도, OFF 상태 복원은 연결 체중을 되살리지 않는다. legacy 필드 누락은 기존 연결로 추론한다. stale revision/다른 Profile/중간 실패 시 두 Store 모두 변경 없음.
- **HEALTH-GRAPH** 체중은 weight_logs만, 나머지는 inbody_logs만 원본. 삭제/미입력 값 제외, 0은 유효 지표에서 표시. 같은 날 여러 시점 유지. 단일 값/평탄한 값도 표시 가능. SVG와 펼칠 수 있는 실제 측정 목록 제공, 외부 CDN 없음. 별도 그래프 Store 없음.
- **HEALTH-PERIOD** 7/30일은 Profile의 오늘을 포함한 최근 7/30개 날짜, 3개월은 오늘에서 달력상 3개월 전 날짜부터 오늘까지(없는 날짜는 해당 월 말일). 끝은 내일 00:00 미포함. 전체는 미래 측정을 포함한 모든 날짜. listByDateRange는 시작 포함/종료 제외인 기존 복합 Index 조회. 범용 list는 유지.
- **HEALTH-CALENDAR** 월별 원본 조회 결과에서 날짜별 체중/인바디 표시. linked pair는 `인바디 · 체중 연동` 한 항목, 체중 목록에서는 각 엔티티와 연결 안내를 표시. Calendar Store 신설 금지.
- **HEALTH-HOME** 기존 카드 구조 안에 최근 체중/직전 변화량/최근 인바디 주요값과 시각 추가. 삭제 기록 제외.
- **HEALTH-BACKUP** JSON Backup v1에서 모든 측정값/UUID/revision/deleted_at/source/source_ref_id/link_weight 보존. 명시적 연동 의도가 있는 데이터는 쌍의 상태·값·시간·메모를 검증한다. 필드 없는 정상 v0.4/0.5 백업 호환 유지. 일반 pristine 복원/별도 강제 replace·초기화 정책 유지.
- **HEALTH-DB** APP0.6.0, DB1/Schema1/Seed1/Backup1, 기존 14 Store 유지. 인덱스/Store 변경 없음, Migration 없음. 기존 스키마리스 행의 선택 payload 추가만 사용.
- **HEALTH-QA** 자동/실기기 QA 분리. 새 버전 실기기 8건과 기존 25건은 미실행이면 NOT RUN. 이전 FINAL v0.3 186/0/0과 과거 결과 파일은 보존하며 새 버전 자동 결과로 덮어쓰지 않는다.


## v0.7.0 Diet + Media + Backup v2 — 최신 규칙

- **DIET-CRUD** diet_log는 먹은 한 끼/간식 1건. eaten_at UTC ISO, meal_type=breakfast/lunch/dinner/snack/other, content/memo 문자열 최대2000자. 같은 날짜/식사구분 여러 건 허용. Profile/UUID/revision/soft-delete 유지. 날짜 입력/목록은 Profile timezone, 날짜 조회는 by_profile_eaten_at 반개방 구간.
- **DIET-PHOTO** 한 식단 최대12장. JPEG/PNG/WebP 파일 최대25MB/50MP. 카메라 capture=environment와 갤러리 multiple, 미리보기/개별 제거 지원. 여러 장 순차 처리 전체가 성공한 경우에만 임시 목록에 반영, 저장 전 DB 쓰기 없음. 원본을 앱 DB에 보관하지 않는다.
- **MEDIA-PROCESS** transaction 전에 createImageBitmap(imageOrientation=from-image), 방향 정상화, 긴변1280/thumbnail320, 확대 없음, WebP 품질0.82/thumbnail0.75, JPEG 재인코딩 fallback, SHA-256 생성. 상수는 APP_CONFIG.MEDIA에 중앙화. HEIC/기타형식은 명확히 거절하며 원본 저장 fallback 금지.
- **MEDIA-SEPARATION** diet_photos는 portable metadata만. storage_key/thumbnail_storage_key/mime_type/width/height/byte_size/checksum/sort_order 및 thumbnail 크기/hash/metadata/removed_from_diet 보존. media_blobs는 storage_key keyPath, blob/byte_size/checksum/created_at만 저장. binary에 Profile/식단 relation 중복 금지. Page는 MediaService를 통해 조회하고 IndexedDB에 직접 접근하지 않는다.
- **DIET-ATOMIC** DietCommand Contract가 diet_logs+diet_photos+media_blobs를 하나의 readwrite transaction으로 변경한다. CPU/crypto는 밖에서 완료. 기존 사진 유지+신규 사진 추가, 제거 tombstone, 순서 유지, expectedRevision/Profile 검증. 중간 failure/Quota 시 기존값/모든 row/Blob 상태 보존.
- **MEDIA-RETENTION** 식단 삭제 시 연결 photo soft-delete, binary는 복원을 위해 보관. removed_from_diet=false로 함께 삭제한 사진만 식단 복원에서 되살리고, 먼저 개별 제거한 사진은 제외한다. 복원할 파일 누락 시 전체 복원 거부.
- **MEDIA-GC** active 사진 미참조 목록과 어느 metadata(다른 Profile/삭제 행 포함)에서도 미참조인 orphan 목록 구분. 정리는 metadata와 binary를 함께 잠그는 transaction에서 다시 확인 후 진짜 orphan만 물리삭제. tombstone binary는 복원/완전 백업을 위해 유지하고 명시적 전체 초기화/강제 교체 때 제거한다. 사용자가 사진 삭제만 했다고 즉시 저장공간이 회수되지는 않는다.
- **MEDIA-STORAGE** 입력 저장 전후 storage estimate 확인. 설정에는 브라우저 전체 usage/quota(확인 불가 구분), 모든 Profile 합산 사진 bytes/count, 지원 환경/영구 저장 상태, persist 요청과 orphan GC 제공. QuotaExceededError는 내부 문자열을 숨기고 기존 데이터 유지 및 사진 수/용량 축소 후 재시도를 안내한다.
- **DIET-VIEW** 날짜 이동/식사구분/시각/내용/메모/썸네일. 목록과 입력의 기존 사진은 thumbnail, 상세만 큰 압축본. Blob URL은 화면 이동/재렌더 때 해제. Calendar Store 없이 diet_logs projection과 원본 상세 이동. Calendar 썸네일은 이번 버전에서 생략하고 식단 상세에서 확인한다.
- **BACKUP-V2** 사진(삭제 이력 포함)이 있으면 ZIP v2 자동 export. 없으면 JSON v1 유지, Service에서 명시적 v2 export도 가능. ZIP은 이미 압축된 이미지를 다시 압축하지 않는 표준 STORE 방식; manifest.json/data.json/media/<storage_key>.webp|jpg. 자체 압축 codec/CDN 의존성 없음. ZIP64/암호화/외부 재압축 archive는 미지원. ZIP 최대250MB/10002 entries, JSON v1 최대50MB. 파일 시스템으로 압축 해제하지 않는다.
- **BACKUP-V2-VALIDATION** format/version/Schema1, portable checksum/count/UUID/관계, ZIP CRC/header/path/중복, data.json SHA-256, media manifest 수/합계/파일 존재/중복 key/MIME/크기/SHA-256, 원본/thumbnail 참조와 active photo→active diet 관계 검증 후 쓰기. 누락/손상/extra media/불일치1개면 전체 거절. deleted photo의 binary도 필수로 포함한다.
- **BACKUP-V2-RESTORE** 일반 pristine 제한, 별도 사용자 명시 force replace와 reset 유지. portable12+media_blobs+device_settings(current_profile_id) 14 Store transaction. 기존 device_id/기타device_settings/app_logs 유지. UUID/revision/created/updated/deleted/storage_key/checksum 그대로 저장. commit 후 실제 Blob hash와 canonical portable hash 재검증. 백업 후 초기화는 실제 다운로드 파일을 재선택해 portable hash와 media manifest가 모두 일치해야 허용한다.
- **BACKUP-V1-COMPAT** 기존 정상 JSON v1 계속 검증/복원한다. Portable Schema는1로 유지하므로 UUID/revision을 바꾸는 데이터 변환이 필요 없다. 기존 v1이 원래 지원하지 않던 사진 metadata-only 백업은 계속 거절한다. v1 파일의 빈 새 media store를 포함한 DB2 복원 허용.
- **DIET-MIGRATION** DB1→2 누적 Migration은 media_blobs만 추가. 기존14 Store/Index/행/Profile/Seed를 삭제·clear·재생성하지 않는다. 새 설치는 v1 생성 후 v2 추가. Portable Schema1/Seed1 유지. Migration 실패는 upgrade transaction abort, DB 자동 삭제 없음. 이전 버전 앱 파일만 다시 배포하여 DB2를 DB1로 downgrade하지 않는다.
- **DIET-QA** v0.6 원본 데이터(Template v1/v2, 로그, 이용권/usage, 예약, 인바디 연동, tombstone) upgrade 전후100% 비교. 실패 upgrade도 보존. 이미지/수정/삭제/복원/Quota/restore/force rollback, offline UI, 실제 ZIP 다운로드와 별도 Chrome Profile 복원 검증. 사용자 카메라·갤러리·PC→폰·Pages/Galaxy는 별도8건 NOT RUN.
