# Architecture - v0.3.0

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

단일 `exercise_logs` 행 CRUD는 Repository Contract로 처리한다. v0.4에서 운동기록과 이용권 사용로그가 동시에 바뀌면 별도 `ExerciseCommandPort`를 추가한다.

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
