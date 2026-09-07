# Architecture - v0.4.0

## 목적

GitHub Pages + IndexedDB 개인용 PWA를 유지하면서 향후 Vercel + Supabase 멀티유저/멀티기기 동기화를 추가해도 화면과 업무규칙을 재작성하지 않도록 경계를 유지한다.

## 현재 계층

```text
UI / Page
  -> Application Service
  -> Repository Contract / Semantic Command Port
  -> IndexedDB Adapter
  -> IndexedDB
```

## 의존성 규칙

- UI/Page는 Repository와 IndexedDB를 직접 호출하지 않는다.
- Application Service는 `data/indexeddb` 구현체를 import하지 않는다.
- 구체 구현 조립은 `js/bootstrap/container.js`에서만 한다.
- 일반 IndexedDB transaction callback을 Application Service에 노출하지 않는다.
- 여러 Store를 원자적으로 바꾸는 작업은 업무 의미를 가진 Command Port로 표현한다.
- 일반 Repository Contract에는 `hardDelete`, `clear`, `put`, `upsert`를 노출하지 않는다.

## v0.3 운동 경계

```text
Exercise Page
  -> ExerciseManagementService
  -> ExerciseLogService
  -> ExerciseQueryService

ExerciseManagementService
  -> Exercise Repository Contracts
  -> ExerciseManagementCommandPort

ExerciseManagementCommandPort
  -> IndexedDbExerciseManagementCommand
  -> IndexedDbUnitOfWork
```

`운동 종류 + Template v1 생성`, `기존 Template supersede + 신규 Template 생성`은 multi-store 원자성이 필요하므로 semantic Command로 처리한다.

단일 `exercise_logs` 행 CRUD는 Repository Contract로 처리한다. Backup Core 다음의 이용권·예약 단계에서 운동기록과 이용권 사용로그가 동시에 바뀌면 별도 `ExerciseCommandPort`를 추가한다. 예약 완료는 예약 + 운동기록 + 사용로그를 동일 transaction으로 처리한다.

## Backup Core 및 후속 구현 경계

- Backup Core는 snapshot 읽기 Port와 복원 전용 Semantic Command Port를 추가했다. ID와 메타데이터를 재생성하는 일반 Repository `create()`를 import에 사용하지 않는다.
- 기존 자동 부팅을 유지한다. pristine 초기 Profile/Seed만 복원 전용 13 Store transaction에서 교체하고, commit 후 IdentityContext 연결과 전체 snapshot hash 재검증을 수행한다. 세부 조건은 [BACKUP_CORE_DESIGN.md](BACKUP_CORE_DESIGN.md)를 따른다.
- 이용권은 운동기록별 `status = used` 최대 1건을 Command transaction에서 검사하고 cancelled 이력을 보존한다. 기존 쌍 UNIQUE 인덱스의 변경은 이용권 단계의 Migration으로 다룬다.
- 범용 `list()`는 유지한다. 기간 조회는 기능별 Repository에 기존 인덱스를 사용하는 메서드를 추가한다.
- 사진은 메타데이터와 로컬 Blob Store를 분리하고 향후 Storage Adapter로 확장한다.

Backup Core는 v0.4.0에 구현했다. 이용권·기간 조회·사진 확장은 후속 설계다. v0.3의 14 Store/Index와 일반 CRUD는 유지한다. 구현 순서는 [ROADMAP.md](ROADMAP.md)를 따른다.

## Template 동시성

Template은 version이 바뀔 때 신규 행을 만들며 신규 행의 `revision`은 다시 1부터 시작할 수 있다. 따라서 양식 변경의 낙관적 충돌 조건은 revision 숫자만 비교하지 않는다.

```text
expectedTemplateId
+
expectedTemplateRevision
```

두 값을 현재 active Template과 함께 검증한다.

일반 행 수정·soft-delete·restore는 기존 `expectedRevision` 규칙을 유지한다.

## 역사적 Template

운동기록은 생성 당시 `template_id`를 보존한다. 현재 active Template이 v3이어도 과거 v1 기록을 수정할 때 v1 필드 정의로 검증하고 렌더링한다. 자동 최신 Template 변환은 하지 않는다.

## Local-first 확장

```text
UI
  -> Application Service
  -> Local Contract / Command
  -> IndexedDB + future Sync Outbox
  -> future Sync Engine
  -> future Supabase Gateway
```

Supabase 연결 후에도 IndexedDB는 즉시 읽고 쓰는 로컬 원장으로 유지한다. 원격 계층은 Auth, PostgreSQL, Storage, 기기간 동기화를 추가한다.

향후 원격 multi-row 원자 작업은 현재 semantic Command와 같은 업무 경계를 PostgreSQL function/RPC로 대응할 수 있다.

## 소유권과 삭제

- 모든 동기화 대상 데이터는 `profile_id` 범위로 격리한다.
- UI payload의 `profile_id`는 신뢰하지 않는다.
- 일반 삭제는 `deleted_at` soft-delete다.
- Tombstone은 향후 오프라인 삭제 동기화를 위해 유지한다.

## UI 오류 경계

내부 `ConstraintError`, transaction 오류, revision 오류 문자열을 사용자에게 그대로 표시하지 않는다. Application/Core 오류코드를 안전한 작업 메시지로 매핑하고 상세 원인은 console/app_logs 진단에만 남긴다.


## v0.5.0 Activity Command

운동기록과 예약·이용권 정합성은 ActivityCommandContract → IndexedDbActivityCommand에서 처리한다. Service에 generic transaction을 노출하지 않는다. 자세한 상태 전이·멱등성·조회·RPC 경계는 [PASS_SCHEDULE_DESIGN.md](PASS_SCHEDULE_DESIGN.md)를 따른다.


## v0.5.1 사용자 QA에 따른 명시적 확장

일반 pristine 복원 경로를 유지하면서 별도 replace restore와 전체 초기화를 지원한다. portable Store 삭제/삽입과 current_profile_id 전환은 전용 BackupRestore Command transaction 한 번으로 수행한다. 일반 CRUD나 DB Migration에 clear를 추가하지 않으며 device_id 등 기기 데이터는 유지한다. 백업 후 실행은 저장된 파일 재검증, 대상 fingerprint 재확인 후에만 진행한다. DB1/Schema1/Seed1/Backup1 유지, Migration 없음. 자세한 구현은 [QA_V051_DESIGN.md](QA_V051_DESIGN.md)를 따른다.


## v0.6.0 Health boundary

Weight Page/Home/Calendar → HealthService → WeightRepository/InbodyRepository 또는 InbodyCommandContract → IndexedDbInbodyCommand. 단일 manual CRUD는 Repository에서 revision 검사, 다중 Store 명령은 원본 조회·Profile·revision·유효성 검사·동기화를 2 Store transaction 안에서 완료한다. Service에 generic transaction을 노출하지 않는다. 향후 Supabase adapter는 saveInbody/deleteInbody/restoreInbody RPC 경계로 대체할 수 있다.

기간 조회는 by_profile_measured_at 복합 Index의 반개방 구간, 최근 조회는 같은 Index의 역방향 cursor를 사용한다. 범용 list는 유지한다. 쌍 조회는 uq_profile_source_ref unique index. 앱 shell에 모든 신규 모듈을 포함하며 그래프는 로컬 SVG와 실제 측정 목록으로 렌더링한다.


## v0.7.0 Diet/Media and Backup v2

Diet Page → DietService → DietCommandContract → IndexedDbDietCommand (diet_logs+diet_photos+media_blobs transaction). MediaService는 DB 밖의 decode/orientation/resize/encode/hash를 맡고 Page에 scoped photo Blob을 반환한다. IndexedDbMediaStorage는 storage_key 기반 MediaStorageContract adapter이며 향후 Supabase Storage로 교체 가능하다. Page는 binary store를 직접 조작하지 않는다.

Backup snapshot은 portable와 필요한binary를 같은 readonly transaction에서 읽는다. CPU checksum/ZIP 조립은 밖에서 수행. v2검증은 ZIP구조/JSON/media전체를 사전에 확인하고 복원은 portable12+media_blobs+device_settings의 14Store transaction이다. 강제replace/reset은 media도 함께clear, device_id와 app_logs 유지. 사후검증은 실제 read-back Blob checksum 및 portable canonical hash. 백업후파괴적작업의 파일검증은 media manifest까지 비교한다.

자체 ZIP codec은 STORE method만 사용하며 파일을 시스템 디렉터리에 풀지 않는다. CRC32는 ZIP통합, SHA-256은 JSON/이미지내용 검증이며 인증/암호화 목적이 아니다. 기존 JSON v1은 변형 없이 Schema1로 복원한다.
