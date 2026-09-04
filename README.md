# Personal Health PWA

운동, 식단 사진, 체중, 인바디를 기록하기 위한 개인용 로컬 우선 PWA입니다.

## 현재 버전

- App: v0.2.0
- IndexedDB: v1
- Logical Schema: v1
- Seed: v1

## v0.2.0 목적

화면 기능을 늘리기 전에 향후 Supabase 멀티유저/멀티기기 확장을 견딜 로컬 데이터 기반을 구축합니다.

- 14개 IndexedDB Object Store
- UUID 기반 ID
- 로컬 Profile과 `profile_id` 범위 격리
- `created_at`, `updated_at`, `deleted_at`, `revision`
- soft-delete / restore
- expectedRevision 기반 충돌 차단
- Repository Contract / IndexedDB Adapter 분리
- Dependency Injection Container
- 누적 Migration
- 멱등적인 필라테스 Seed
- Bootstrap 다중 Store transaction
- 로컬 오류로그 최대 200건
- 설정 화면 읽기 전용 DB 진단
- GitHub Pages형 하위 경로, Service Worker, 완전 오프라인 런타임 자동검증

실제 운동·식단·체중 입력 화면은 아직 구현하지 않았습니다.

## 로컬 우선 구조

```text
UI
  -> Application Service
  -> Contract / Command Port
  -> IndexedDB Adapter
  -> IndexedDB
```

향후 Supabase는 IndexedDB를 교체하지 않습니다. IndexedDB를 로컬 원장으로 유지하고 Sync Outbox, Sync Engine, Supabase Gateway를 추가합니다.

## GitHub Pages 배포

1. 전체 소스의 파일과 폴더를 repository 루트에 반영합니다.
2. GitHub `Settings > Pages`에서 `Deploy from a branch`를 선택합니다.
3. Branch `main`, Folder `/(root)`를 지정합니다.
4. 배포된 Pages URL을 열고 설정 화면의 DB 진단을 확인합니다.

기존 v0.1.0 위에 적용할 때는 patch 또는 changed ZIP의 상대경로를 유지하여 덮어씁니다. DB v1은 최초 실행 시 자동 생성되며 v0.1.0의 Cache Storage 정리와 분리됩니다.

## 갤럭시 검증

1. Pages 주소를 Chrome에서 엽니다.
2. 설치된 기존 앱이면 새 버전 배너에서 `업데이트`를 선택합니다.
3. 홈에서 `v0.2.0 · DB 1`을 확인합니다.
4. 설정에서 `상태 정상`, `Object Store 14 / 14`, `Current Profile 연결됨`을 확인합니다.
5. 앱을 완전히 종료한 뒤 다시 열어 동일 Profile이 유지되는지 확인합니다.
6. 네트워크를 끄고 재실행합니다.

## 로컬 실행

Windows에서는 `run-local.bat`을 실행하거나 프로젝트 루트에서 다음 명령을 사용합니다.

```bat
py -3 -m http.server 8080
```

그 후 `http://localhost:8080/`으로 접속합니다. `file://`에서는 Service Worker가 정상 동작하지 않습니다.

## 자동검증

Node.js와 Chrome/Edge 중 하나가 설치된 환경에서:

```bat
run-tests.bat
```

또는:

```bash
node tests/run-all-tests.mjs
```

외부 npm 패키지 없이 다음을 검사합니다. 브라우저 자동검증까지 실행하려면 WebSocket API가 포함된 Node.js 22 이상을 권장합니다. 구버전 Node.js에서는 정적 Suite를 실행하고 브라우저 Suite를 `NOT_RUN`으로 기록합니다.

- PWA 정적 구성
- 계층 의존성
- Schema/Index 정의
- 실제 브라우저 IndexedDB 생성
- Profile/Seed 멱등성
- Profile 범위 격리
- revision 충돌
- soft-delete/restore
- unique 복합 Index
- transaction rollback
- close/reopen 데이터 보존
- app_logs 보존량
- GitHub Pages 형태의 repository 하위 경로
- Manifest 파싱, Service Worker scope, Cache Storage
- 네트워크 차단 후 App Shell 및 DB 진단 재실행

현재 릴리스 검증 결과는 `189 PASS / 0 FAIL / 5 NOT RUN`입니다. 실제 GitHub Pages 배포, 갤럭시 설치, standalone, 오프라인 재실행은 자동검증과 별도로 실기기 결과를 기록합니다.

## 문서

- `REQUIREMENTS.md`: 고정 요구사항과 추적 ID
- `CHANGELOG.md`: 버전별 변경 이력
- `REGRESSION_TEST.md`: 자동/수동 회귀검증 결과
- `RELEASE_REPORT.md`: 변경 파일 수, 영향 범위, 적용·복구 절차
- `docs/ARCHITECTURE.md`: 계층 및 향후 동기화 경계
- `docs/DATA_MODEL.md`: Store와 공통 메타데이터
- `docs/MIGRATION_POLICY.md`: 데이터 보존형 Migration 원칙
- `tests/traceability.json`: 요구사항과 테스트 연결
- `tests/results/v0.2.0.json`: 기계 판독 가능한 실행 결과
