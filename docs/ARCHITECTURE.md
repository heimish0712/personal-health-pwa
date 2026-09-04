# Architecture - v0.2.0

## 목적

현재 GitHub Pages + IndexedDB 개인용 PWA를 유지하면서, 향후 Vercel + Supabase 멀티유저/멀티기기 동기화를 추가할 때 화면과 업무규칙을 재작성하지 않도록 경계를 고정한다.

## 현재 계층

```text
UI (app.js)
  -> Application Service
  -> Contract / Command Port
  -> IndexedDB Adapter
  -> IndexedDB
```

## 의존성 규칙

- UI는 Repository와 IndexedDB를 직접 호출하지 않는다.
- Application Service는 `data/indexeddb` 구현을 import하지 않는다.
- 구체 구현 조립은 `js/bootstrap/container.js`에서만 한다.
- 여러 Store를 묶는 원자적 작업은 업무 의미를 가진 Command Adapter가 담당한다.
- 일반 IndexedDB transaction callback은 Application Service에 노출하지 않는다.
- 일반 Repository Contract에는 `hardDelete`, 전체 초기화, 무조건 덮어쓰기 기능을 노출하지 않는다.

## 로컬 우선 확장 방향

```text
UI
  -> Application Service
  -> Local Command Port
  -> IndexedDB + future Sync Outbox
  -> future Sync Engine
  -> future Supabase Gateway
```

Supabase 연결 후에도 IndexedDB는 즉시 읽고 쓰는 로컬 원장으로 유지한다. 원격 계층은 인증, 기기간 동기화, PostgreSQL 원격 원장, Storage를 추가하는 확장 기능이다.

## 소유권

현재도 로컬 Profile을 생성하고 모든 동기화 대상 데이터에 `profile_id`를 강제한다. UI payload에 포함된 `profile_id`는 신뢰하지 않으며 Repository가 `IdentityContext`의 현재 Profile을 주입한다.

## 동시성

각 동기화 대상 행은 `revision`을 가진다. 수정, 삭제, 복원 시 호출자가 본 `expectedRevision`과 현재 행의 revision이 일치해야 한다. `updated_at`만으로 충돌을 판정하지 않는다.

## 삭제

일반 삭제는 `deleted_at`을 기록하는 soft-delete다. Tombstone을 남겨 향후 오프라인 삭제를 서버에 전달할 수 있도록 한다. 물리삭제는 테스트 DB 정리, 로그 보존량 정리, 향후 동기화 완료 Tombstone 정리 등 제한된 유지보수 경로에서만 허용한다.

## UI에 노출하는 애플리케이션 경계

`bootstrapApplication()`은 UI에 전체 DI Container를 반환하지 않는다. UI가 받는 것은 현재 진단 결과, Logger, 읽기 전용 진단 Service뿐이다. 따라서 Page가 Container를 경유해 Repository나 IndexedDB Adapter를 직접 호출하는 우회 경로도 막는다.

DB가 열리기 전 오류는 공용 Application Logger의 제한된 메모리 큐에 남긴다. 같은 실행 세션에서 재시도가 성공하면 새 `app_logs` Repository에 큐를 이관한다. 이 동작은 사용자 건강기록 전문을 로그에 남기는 기능이 아니며, 오류코드와 제한된 진단 context만 기록한다.
