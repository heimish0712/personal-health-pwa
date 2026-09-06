# Release Report - v0.3.0

## 1. 릴리스 개요

- 이전 버전: `v0.2.0`
- 현재 버전: `v0.3.0`
- 목적: 실제 Exercise Core 기능 추가
- App Version: `0.2.0 -> 0.3.0`
- DB Version: `1 -> 1`
- Schema Version: `1 -> 1`
- Seed Version: `1 -> 1`
- DB Migration: **없음**

v0.2.0에서 구축한 Local-first 데이터 계층을 유지하면서 운동 종류, 버전형 Template, 동적 운동기록 CRUD를 Application Service와 semantic Command 경계 위에 추가했다.

## 2. 변경 파일

v0.2.0 전체 소스 대비:

```text
신규 파일   22개
수정 파일   27개
삭제 파일    0개
변경 합계   49개
```

삭제 파일은 없다. `.git`은 full ZIP에 포함하지 않는다.

## 3. 주요 변경

### 운동 종류

- 기본 필라테스 Seed 실제 UI 표시
- 사용자 운동 종류 생성/수정
- active / inactive
- soft-delete / restore
- Profile 격리 및 revision 충돌 규칙 유지

### 기록 양식

- 표준 필드 Catalog
- 사용자 정의 number/text/textarea/boolean/select
- 사용자 정의 field key를 UUID 기반으로 고정
- 운동 생성 + Template v1을 하나의 semantic Command transaction으로 처리
- Template 변경 시 이전 버전 보존 + 신규 version 생성
- Template 변경 충돌을 `expectedTemplateId + expectedTemplateRevision` 쌍으로 검사

### 운동 기록

- 실제 생성/조회/수정/soft-delete
- 공통 memo
- Template 기반 동적 폼
- 과거 기록의 historical `template_id` 유지
- 과거 기록 수정 시 최신 Template 자동변환 금지
- Profile timezone 입력을 UTC ISO로 저장
- 최근 기록 / 종류 필터 / 주간 요약

### 구조/품질

- Page -> Application Service -> Contract/Command -> IndexedDB Adapter 경계 유지
- Application Service의 직접 IndexedDB 의존 없음
- 여러 Store 원자 작업만 semantic Command로 분리
- 내부 DB/Conflict 오류 문자열의 직접 UI 노출 방지
- 입력 중 이탈 방지 Dirty Form Guard

## 4. DB / Migration

```text
DB_VERSION     1 유지
SCHEMA_VERSION 1 유지
SEED_VERSION   1 유지
Object Store   14 유지
신규 Index     없음
Migration      없음
```

v0.3.0 기능은 기존 `exercise_types`, `exercise_templates`, `exercise_logs` 구조와 Index를 그대로 사용한다. 기능 버전 상승만으로 IndexedDB Version을 올리지 않았다.

기존 다음 데이터는 재생성하거나 변환하지 않는다.

```text
Local Profile
current_profile_id
필라테스 Seed
필라테스 Template v1
device_id
기존 v0.2 데이터
```

## 5. Supabase 확장성 영향

기존 local-first 기준선을 유지한다.

```text
현재
UI
 -> Application Service
 -> Repository Contract / Semantic Command Port
 -> IndexedDB Adapter
 -> IndexedDB

향후
IndexedDB
 -> Sync Outbox
 -> Sync Engine
 -> Supabase Gateway
 -> Auth / PostgreSQL / Storage
```

특히 Template의 multi-row 원자 변경은 generic IndexedDB transaction을 Service에 노출하지 않고 `ExerciseManagementCommand`라는 업무 경계로 처리했다. 향후 원격 구현에서는 동일 업무 경계를 PostgreSQL function/RPC로 대응할 수 있다.

## 6. 검증 결과

```text
Smoke / App Shell              72 PASS
Architecture                   29 PASS
Schema                         60 PASS
Exercise Application Service  19 PASS
Browser Runtime                 1 NOT RUN
Manual GitHub/Galaxy            5 NOT RUN
---------------------------------------
TOTAL                          186
PASS                           180
FAIL                             0
NOT RUN                          6
```

브라우저 Runtime Suite는 코드 실패가 아니다. 현재 실행환경의 Chromium 조직 관리정책이 `localhost`, `127.0.0.1` 및 로컬 HTTPS 별칭을 모두 차단하여 실행하지 못했다. 이를 PASS로 허위기록하지 않고 `BROWSER-POLICY = NOT_RUN`으로 남겼다.

브라우저 Suite 코드에는 기존 v0.2 IndexedDB/PWA 회귀와 v0.3 Exercise Core 시나리오가 모두 누적되어 있다.

## 7. 구현 중 발견·수정한 설계 결함

Template 양식 충돌을 revision 숫자만으로 판단하면 다음을 구분할 수 없다.

```text
Template v1 / revision 1
Template v2 / revision 1
```

신규 Template 행은 revision 1부터 시작하기 때문이다.

따라서 v0.3.0 구현 중 충돌 키를 다음으로 강화했다.

```text
expectedTemplateId
+
expectedTemplateRevision
```

현재 active Template의 ID와 revision을 모두 확인한다. 이 규칙은 향후 멀티기기/Supabase 동기화에서도 유지할 수 있다.

## 8. 기존 v0.2 기능 영향

유지 대상:

- GitHub Pages 하위경로
- 설치형 PWA / standalone
- 오프라인 App Shell
- 홈/캘린더/운동/식단/체중 5탭
- Hash Router
- Service Worker 사용자 승인 업데이트
- DB v1 / 14 Store / 기존 Index
- Profile / IdentityContext
- UUID / timestamp / soft-delete / revision
- Repository Contract / DI Container
- app_logs / DB 진단

기존 회귀 테스트는 삭제하지 않고 v0.3 테스트와 함께 누적 실행한다.

## 9. 아직 구현하지 않은 기능

- 횟수권 / 필라테스 자동 차감
- 운동 예약 / 예정 / 완료 전환
- 체중 / 인바디
- 식단 / 사진 Blob
- 캘린더 실제 데이터 조회
- 홈 통계 확장
- 백업 / 복원
- Supabase Auth / Sync Outbox / Sync Engine

## 10. 적용 절차

1. 현재 정상 동작하는 v0.2.0 repository 상태를 commit/tag로 보존한다.
2. `personal-health-pwa-v0.3.0-changed.zip` 내부 파일을 repository 루트에 상대경로 그대로 덮어쓴다.
3. 삭제할 파일은 없다.
4. 또는 clean v0.2.0 상태에서 patch를 `git apply --check` 후 적용한다.
5. 변경사항을 commit하고 `main`에 push한다.
6. GitHub Pages 배포가 끝나면 기존 설치 앱을 연다.
7. 업데이트 배너에서 v0.3.0을 적용한다.
8. 홈에서 `v0.3.0 · DB 1`을 확인한다.
9. 설정에서 기존 Profile ID와 `14 / 14` Store가 유지되는지 확인한다.
10. 운동 탭에서 기본 필라테스가 표시되는지 확인한다.
11. 러닝 등 새 운동을 추가하고 기록을 1건 저장·수정·삭제해본다.
12. 네트워크 OFF 상태에서도 운동 탭과 기존 기록이 열리는지 확인한다.

## 11. 복구 절차

문제가 발생하면 v0.3.0 commit을 `git revert`하여 코드만 v0.2.0으로 복구한다.

```bash
git revert <v0.3.0-commit>
git push
```

DB_VERSION은 v0.2와 v0.3 모두 1이므로 별도 DB downgrade가 필요하지 않다.

복구 시 다음은 하지 않는다.

- IndexedDB 삭제
- 사이트 데이터 삭제
- DB 초기화
- 일부 파일만 임의 복사하여 혼합 버전 만들기

v0.3에서 생성한 운동 데이터도 DB v1의 기존 Schema를 사용하므로 코드 v0.2로 잠시 돌아가도 DB 자체는 삭제하지 않는다. 다시 v0.3을 배포하면 해당 데이터를 재사용할 수 있다.

## 12. 배포 후 미검증 항목

```text
APP-001 GitHub Pages v0.3.0 접속
APP-002 갤럭시 Chrome 업데이트/설치
APP-003 standalone 실행
APP-004 네트워크 OFF 재실행
CACHE-RUNTIME-001 실제 v0.2 -> v0.3 App Shell 교체
```

배포 후 결과는 `REGRESSION_TEST.md`에 PASS/FAIL로 추가한다.
