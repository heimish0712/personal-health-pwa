# Data Model - v0.3.0

## 버전

- IndexedDB DB Version: **1**
- Logical Schema Version: **1**
- Seed Version: **1**
- v0.3.0 DB Migration: **없음**

## Object Store

v0.2.0의 14개 Store를 그대로 사용한다.

### 향후 동기화 대상 12개

`profiles`, `exercise_types`, `exercise_templates`, `exercise_logs`, `exercise_schedules`, `passes`, `pass_usage_logs`, `diet_logs`, `diet_photos`, `weight_logs`, `inbody_logs`, `user_settings`

### 기기 로컬 전용 2개

`device_settings`, `app_logs`

## 공통 메타데이터

`profiles`를 제외한 동기화 대상 행:

```text
id            UUID
profile_id    UUID
created_at    UTC ISO datetime
updated_at    UTC ISO datetime
deleted_at    UTC ISO datetime | null
revision      positive integer
```

`profiles`는 `profile_id`만 제외한다.

## Exercise Type

```text
exercise_types
- id
- profile_id
- system_key        optional, Seed만 사용
- name
- icon
- status            active / inactive
- sort_order
- created_at / updated_at / deleted_at / revision
```

기본 필라테스만 `system_key = default.pilates`를 가진다. 사용자 생성 운동은 `system_key` 속성을 만들지 않는다.

## Exercise Template

```text
exercise_templates
- id
- profile_id
- exercise_type_id
- version
- fields[]
- status            active / superseded / inactive
- metadata...
```

Template 변경은 기존 행을 수정해서 필드 내용을 덮어쓰지 않는다.

```text
v1 active
 -> 양식 변경
v1 superseded
v2 active
```

`version`은 운동 종류 내 논리 양식 버전이고 `revision`은 해당 행 자체의 수정 revision이다. 서로 다른 개념이다.

### Dynamic field

```text
key
label
type
unit
required
min / max / step
options
sort_order
```

표준 key:

```text
duration_minutes
distance_km
steps
pace
calories
```

사용자 정의 key:

```text
custom_<UUID>
```

label을 변경해도 key는 보존한다.

`performed_at`과 `memo`는 Template 필드가 아니라 `exercise_logs` 공통 고정 필드다.

## Exercise Log

```text
exercise_logs
- id
- profile_id
- exercise_type_id
- template_id
- performed_at       UTC ISO
- values             dynamic field value object
- memo
- metadata...
```

기록은 생성 당시 `template_id`를 유지한다. 이후 새로운 Template version이 생겨도 과거 기록을 자동 마이그레이션하지 않는다.

## Template conflict key

신규 Template 행은 revision 1부터 시작하므로 Template 수정 시 아래 쌍을 현재 active Template과 비교한다.

```text
expectedTemplateId
expectedTemplateRevision
```

이 규칙은 `v1/revision1`과 `v2/revision1`을 서로 다른 상태로 구분한다.

## 시간

사용자는 Profile timezone에서 날짜/시간을 입력하고 DB에는 UTC ISO 문자열을 저장한다. `Asia/Seoul` 기준 입력도 DateTime utility를 통해 UTC로 변환한다.

## Profile / Seed / Optional Unique Key

v0.2.0 규칙을 그대로 유지한다.

- `device_settings.current_profile_id`가 현재 Profile을 가리킨다.
- `IdentityContext`가 Profile 범위를 강제한다.
- Seed는 사용자 rename/soft-delete를 원복하지 않는다.
- optional unique index 참여 필드는 값이 없으면 `null` 대신 속성 자체를 생략한다.

## Future Supabase mapping

현재 UUID/profile/revision/deleted_at 구조를 그대로 PostgreSQL 모델로 대응한다.

```text
UUID                 -> uuid
UTC ISO datetime     -> timestamptz
dynamic fields/values -> jsonb
deleted_at           -> timestamptz nullable
revision             -> integer/bigint
```

IndexedDB는 제거하지 않고 향후 Sync Outbox와 Remote Gateway를 추가한다.
