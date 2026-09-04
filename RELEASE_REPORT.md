# Release Report - v0.2.0

## 1. 릴리스 요약

v0.1.0의 설치형 PWA 화면과 라우팅을 유지하면서, 향후 Supabase 멀티유저·멀티기기 동기화에 대비한 로컬 우선 데이터 기반을 추가했습니다.

```text
Previous App    0.1.0
Current App     0.2.0
Cache           personal-health-pwa-v0.2.0
DB Version      1
Schema Version  1
Seed Version    1
```

이번 버전은 실제 운동·식단·체중 입력 기능을 열지 않습니다. 사용자 화면의 주요 변화는 홈 상태 표시와 설정의 읽기 전용 DB 진단입니다.

## 2. 변경 파일

- 신규 파일: 54개
- 수정 파일: 11개
- 삭제 파일: 0개
- 전체 소스: 71개
- 변경 산출물 포함 파일: 65개

변경 파일명은 `changed.zip`의 상대경로가 기준이며, `.git`은 전체 ZIP에 포함하지 않습니다.

## 3. 주요 변경

- IndexedDB 14개 Object Store와 누적 Migration
- Local Profile 및 `IdentityContext`
- UUID, `profile_id`, UTC timestamp, `deleted_at`, `revision`
- Repository Contract / IndexedDB Adapter / DI Container
- expectedRevision 기반 수정·삭제·복원 충돌 차단
- Profile 범위 격리 및 위조 `profile_id` 무시
- Profile·필라테스·Template·기기 포인터 원자적 Seed
- 사용자 변경/삭제 Seed 원복 방지
- 사용자 설정과 기기 설정 분리
- 식단 사진 메타데이터와 향후 Blob 저장 경계 분리
- 로컬 오류로그 최대 200건
- DB 진단 및 실패 시 데이터 비삭제 오류 화면
- GitHub Pages 하위 경로/Service Worker/오프라인 자동검증

## 4. DB 및 Migration

```text
oldVersion 0 -> newVersion 1
```

v0.1.0은 IndexedDB를 사용하지 않았으므로 기존 DB 행 변환은 없습니다. 최초 실행 시 DB v1과 Local Profile, 기본 필라테스, Template v1을 하나의 transaction으로 생성합니다.

Migration 정책:

- Store 삭제/clear 없음
- 실패 시 DB 자동삭제 없음
- 사용자 데이터 초기화 버튼 없음
- Service Worker 캐시 정리와 IndexedDB 분리
- 다음 DB Version부터 대표 구버전 데이터를 만든 뒤 보존 Migration 검증

## 5. 영향 범위

### 유지되는 기능

- GitHub Pages 상대경로
- 설치형 PWA
- 홈/캘린더/운동/식단/체중 5탭
- Hash Router
- 설정 헤더 진입
- 사용자 선택형 앱 업데이트
- 오프라인 App Shell

### 새 내부 기반

- 앱 시작 전에 DB open/Migration/Profile/Seed 검증
- UI에는 구체 Container·Repository·IndexedDB를 노출하지 않음
- 모든 향후 도메인 저장은 Repository/Command 경계를 사용
- Supabase는 IndexedDB 대체가 아니라 향후 Sync 계층으로 추가

### 아직 없는 기능

- 운동·이용권·예약 실제 화면
- 식단 및 사진 Blob 저장
- 체중·인바디 입력/그래프
- 캘린더 원본 데이터 조회
- 백업/복원
- 로그인·Supabase·Outbox·충돌해결 UI

## 6. 검증 결과

```text
Automated PASS     189
Automated FAIL       0
Manual NOT RUN       5
```

자동검증에는 실제 Chromium의 IndexedDB, 복합 unique Index, Profile 격리, revision 충돌, soft-delete/restore, transaction rollback, 하위 경로 PWA, Service Worker, Cache Storage, 네트워크 차단 후 재실행이 포함됩니다.

아직 PASS로 처리하지 않은 항목은 사용자 GitHub Pages 배포와 갤럭시 실기기 검증 5건입니다. 상세 결과는 `REGRESSION_TEST.md` 및 `tests/results/v0.2.0.json`을 기준으로 합니다.

## 7. 적용 절차

1. 현재 v0.1.0 repository를 commit하거나 tag로 보존합니다.
2. `personal-health-pwa-v0.2.0-changed.zip`의 내부 파일을 repository 루트에 상대경로 그대로 덮어씁니다. 처음부터 다시 올릴 때는 full ZIP을 사용합니다.
3. 삭제할 파일은 없습니다.
4. 변경 파일을 commit하고 `main`에 push합니다.
5. GitHub Pages 배포가 끝나면 기존 설치 앱을 엽니다.
6. 업데이트 배너가 표시되면 작성 중 데이터가 없는 상태에서 `업데이트`를 누릅니다.
7. 홈에서 `v0.2.0 · DB 1`을 확인합니다.
8. 설정에서 `상태 정상`, `Object Store 14 / 14`, `Current Profile 연결됨`, `Profile Seed 1`을 확인합니다.
9. 앱을 종료·재실행한 뒤 같은 Profile ID 앞 8자리가 유지되는지 확인합니다.
10. 네트워크를 끄고 다시 실행합니다.

## 8. 복구 절차

코드 이상이 있으면 GitHub에서 v0.2.0 배포 commit을 revert하거나 v0.1.0 tag/commit으로 되돌립니다.

중요:

- 브라우저 개발자도구에서 IndexedDB를 삭제하지 않습니다.
- 앱 데이터 초기화·사이트 데이터 삭제를 하지 않습니다.
- v0.1.0은 DB v1을 사용하지 않지만 기존 IndexedDB는 브라우저에 그대로 남습니다.
- 이후 v0.2.0을 다시 배포하면 같은 DB v1과 Profile을 재사용합니다.
- 단순히 modified 파일만 되돌리면 신규 v0.2 파일이 repository에 남을 수 있으므로, 깨끗한 복구는 `git revert`를 우선합니다.

## 9. 배포 후 완료 조건

다음 5건까지 확인되면 v0.2.0을 운영 완료로 판정합니다.

```text
APP-001 GitHub Pages 접속
APP-002 갤럭시 업데이트/설치
APP-003 standalone 실행
APP-004 네트워크 OFF 재실행
CACHE-RUNTIME-001 실제 v0.1 -> v0.2 교체
```
