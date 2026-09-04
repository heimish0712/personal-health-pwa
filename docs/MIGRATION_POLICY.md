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
