# Data Model - v0.2.0

## 버전

- IndexedDB DB Version: 1
- Logical Schema Version: 1
- Seed Version: 1

## Object Store

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

`profiles`는 동일 메타데이터에서 `profile_id`만 제외한다.

## Profile

최초 실행 시 로컬 Profile 하나를 생성한다. `device_settings.current_profile_id`가 현재 Profile을 가리키며, 앱 코드에서는 `IdentityContext`를 통해서만 현재 Profile을 사용한다.

향후 Supabase Auth 연결 시 기존 `profiles.id`는 유지하고 `auth_user_id`를 연결한다.

## Seed

Profile별 시스템 기본 운동은 `system_key = default.pilates`로 식별한다. 사용자가 이름을 수정하거나 soft-delete한 Seed를 반복 실행이 원복하지 않는다.

필라테스 Template v1의 동적 필드는 `duration_minutes` 하나다. `performed_at`과 `memo`는 운동 공통 고정 필드이므로 Template에 넣지 않는다.

## 사진

`diet_photos`는 식단 연결과 파일 메타데이터만 저장한다. 실제 압축 Blob은 사진 기능 버전에서 `media_blobs` Store로 분리한다. 향후 Supabase에서는 메타데이터는 PostgreSQL, 파일은 private Storage에 대응한다.

## 시간

시각 필드는 UTC ISO 문자열로 저장한다. 이용권 시작일/만료일처럼 시간대가 없는 값은 `YYYY-MM-DD`로 저장한다. 화면 표시 시 Profile timezone을 적용한다.

## Optional Unique Key

IndexedDB 복합 unique Index에 참여하는 선택 필드는 값이 없을 때 `null`을 저장하지 않고 속성 자체를 생략한다.

```text
사용자 생성 운동          system_key 속성 없음
미완료 운동 예정          completed_exercise_log_id 속성 없음
직접 입력 체중            source_ref_id 속성 없음
```

이 규칙으로 선택 필드가 없는 일반 행 여러 건이 unique Index에서 서로 충돌하지 않게 한다. 실제 Chromium 테스트에서 같은 Profile의 사용자 운동, 미완료 예정, 수동 체중을 각각 복수 생성해 검증한다.
