# Migration Policy

## 원칙

1. IndexedDB 구조 변경은 DB Version을 올리고 `migrations.js`에 누적한다.
2. 기존 Store를 삭제 후 재생성하지 않는다.
3. 기존 Store 전체 `clear`를 Migration에서 사용하지 않는다.
4. Migration에서 네트워크 요청을 하지 않는다.
5. 실패 시 사용자 DB를 자동 삭제하거나 초기화하지 않는다.
6. 새 Store/Index 추가와 필요한 데이터 변환만 수행한다.
7. 앱 버전 변경과 DB Version 변경은 독립적으로 관리한다.

## v0.2.0

```text
oldVersion 0 -> newVersion 1
```

v0.1.0은 IndexedDB를 사용하지 않았으므로 이번 Migration은 14개 Store와 Index의 최초 생성이다. 구버전 DB 데이터 보존을 통과했다고 과장하지 않고, v1에서 저장한 데이터의 close/reopen 보존을 별도 검증한다.


## v0.3.0

```text
DB_VERSION 1 -> 1
SCHEMA_VERSION 1 -> 1
SEED_VERSION 1 -> 1
```

운동 기능은 v0.2.0에서 이미 생성한 `exercise_types`, `exercise_templates`, `exercise_logs`와 기존 Index만 사용하므로 DB Migration을 만들지 않는다. 앱 기능 버전이 올라갔다는 이유만으로 DB Version을 증가시키지 않는다.

검증 기준:

- 기존 Profile ID 유지
- 기존 필라테스 Seed/Template v1 유지
- 14개 Store/Index 변화 없음
- 새 Store/Index 없음
- Service Worker 캐시 업데이트가 IndexedDB에 영향 없음

## 향후 검증

v1 -> v2부터 다음 절차를 고정한다.

```text
1. v1 테스트 DB 생성
2. 대표 데이터 입력
3. v2 코드로 DB open
4. Migration 실행
5. 기존 ID, 관계, revision, deleted_at 보존 확인
6. 신규 Store/필드/Index 확인
7. 실패 시 기존 DB 삭제 없음 확인
```

IndexedDB Migration과 향후 Supabase PostgreSQL Migration은 별도 이력으로 관리한다.

## v0.4.0 Backup Core

App/cache만 0.4.0으로 올리고 DB/Schema/Seed는 1을 유지한다. 기존 14 Store와 Index 변경이 없으므로 IndexedDB Migration은 없다. BackupMigrationRegistry도 v1→v1 no-op이며 데이터 변환은 없다.

복원은 Schema Migration이 아니라 사용자 실행 업무 Command다. 검증된 pristine 자동생성 Profile/Seed 3행을 하나의 transaction에서 교체한다. 실패 시 기존 세 행까지 rollback하며 DB 삭제/clear는 사용하지 않는다.


## v0.5.0 Pass & Schedule

DB/Schema/Seed 1 유지, 새 Store·인덱스·누적 Migration 없음. 선택적 JSON 필드 pass_id/completion_revision 추가만 수행한다. 기존 백업 v1의 필드 누락은 허용한다. 최신 규칙은 같은 pass cancelled 행 재활성화이므로 기존 pair UNIQUE 제거 계획은 폐기한다.
v0.5 데이터가 생긴 뒤 v0.4에서 운동을 수정/삭제하면 원장을 갱신하지 않으므로 코드 downgrade 후 쓰기는 안전하지 않다. 백업 후 쓰기 중지 및 수정 릴리스로 복구하며 DB 삭제/downgrade는 하지 않는다.


## v0.5.1 사용자 QA에 따른 명시적 확장

일반 pristine 복원 경로를 유지하면서 별도 replace restore와 전체 초기화를 지원한다. portable Store 삭제/삽입과 current_profile_id 전환은 전용 BackupRestore Command transaction 한 번으로 수행한다. 일반 CRUD나 DB Migration에 clear를 추가하지 않으며 device_id 등 기기 데이터는 유지한다. 백업 후 실행은 저장된 파일 재검증, 대상 fingerprint 재확인 후에만 진행한다. DB1/Schema1/Seed1/Backup1 유지, Migration 없음. 자세한 구현은 [QA_V051_DESIGN.md](QA_V051_DESIGN.md)를 따른다.


## DB2: media_blobs만 추가

oldVersion<1이면 원래14Store를 생성하고, oldVersion<2이면 media_blobs(storage_key)를 추가한다. 기존 Store/Index 삭제·재생성/clear/사용자row수정 없음. 실패는 versionchange abort이며 DB자동삭제 금지. 실제 DB1 fixture의 portable JSON/UUID/revision/relation/tombstone/device_id를 전후 비교하고 실패후DB1재개도 검증한다. DB2를 연 뒤 v0.6(DB1전용) 앱 파일만 되돌리는 downgrade는 지원하지 않는다. 복구는 원본을 유지하고 업데이트전JSON을 별도환경에서 확인하는 경로를 따른다.

## v0.10.0 — DB2 → DB3 / Portable Schema1 → Schema2

기존15 Store/Index/row 불변, calendar_event_links와 calendar_outbox 및 해당4개 Index만 생성한다. 0→3/1→3/2→3 누적 경로를 유지하고 v1/v2 실제 historical fixture는 기존 Store 수로 생성한다. link 추가로 portable Store가13개가 되어 Schema2를 선언한다. Schema1 파일은 원래12 Store hash로 검증 후 restore하고 새link는 빈 상태다. 기기 대기열/ON설정은 복원 대상이 아니며 restore/reset 전용 transaction에서 비운다. 자세한 정책·다운그레이드 제한은 GOOGLE_CALENDAR.md 참조.
