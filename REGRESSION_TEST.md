# Regression Test

## v0.3.0

- 기준 버전: v0.2.0
- 검증일: 2026-09-05
- App: `0.3.0`
- DB Version: `1` 유지
- DB Migration: 없음
- 자동검증 환경: Node.js `v22.16.0`
- 외부 npm 테스트 패키지: 없음

### 결과 요약

| 구분 | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|
| Smoke / App Shell | 72 | 0 | 0 |
| Architecture | 29 | 0 | 0 |
| Schema 회귀 | 60 | 0 | 0 |
| Exercise Application Service | 19 | 0 | 0 |
| Browser Runtime / IndexedDB | 0 | 0 | 1 |
| GitHub Pages·갤럭시 실기기 | 0 | 0 | 5 |
| **합계** | **180** | **0** | **6** |

기계 판독 원본은 `tests/results/v0.3.0.json`에 기록한다.

### v0.3 핵심 PASS

- v0.2 DB Version 1 / 14 Store / Index 정의 무변경
- Page에서 Repository/IndexedDB 직접 접근 0건
- Application Service의 IndexedDB Adapter import 0건
- 운동 종류 + Template v1 semantic Command 경계
- Template 변경 시 v2 생성 및 v1 superseded 유지
- 사용자 정의 field label 변경 후 내부 key 유지
- Template 충돌을 `expectedTemplateId + expectedTemplateRevision`으로 차단
- 과거 v1 운동기록이 v2 생성 뒤에도 v1 `template_id` 유지
- 과거 기록 수정 시 기존 Template 유지 및 revision 증가
- stale exercise log revision 저장 거부
- 신규 운동기록은 현재 active Template 사용
- 잘못된 number 값 거부
- 비활성 운동 신규 기록 거부
- 운동 종류 soft-delete / restore
- 운동 기록 soft-delete / restore Service 동작
- 주간 요약은 원본 로그에서 계산
- `Asia/Seoul` 로컬 시간의 UTC 변환 단위검사
- 특정 운동 이름(`러닝`, `필라테스`)을 기준으로 동적 폼 분기하지 않음

### 브라우저 Suite NOT RUN 사유

현재 실행환경의 Chromium이 `localhost`, `127.0.0.1`, 로컬 HTTPS 별칭까지 조직 관리정책으로 차단했다. 동일 Suite를 정책 우회 가능한 안전한 로컬 HTTPS 별칭으로도 재시도했으나 동일하게 차단되었다. 따라서 실제 IndexedDB/PWA 브라우저 Suite는 코드 실패로 판정하지 않고 `BROWSER-POLICY = NOT_RUN`으로 기록한다.

브라우저 테스트 코드 자체에는 v0.2 기존 회귀와 다음 v0.3 시나리오가 포함되어 있으며, GitHub Pages 또는 정책 제한이 없는 환경에서 실행 가능하다.

```text
운동 생성 + Template v1
운동 기록 v1
Template v2 생성
과거 기록 v1 유지/수정
신규 기록 v2 사용
비활성/삭제 기록 차단
soft-delete/restore
Profile 격리
운동 생성 transaction rollback
오프라인 운동 화면
```

### 배포 후 수동검증

| Test ID | 검증 항목 | 상태 |
|---|---|---|
| APP-001 | 사용자 GitHub Pages에서 v0.3.0 접속 | NOT RUN |
| APP-002 | 갤럭시 Chrome 기존 앱 업데이트/설치 | NOT RUN |
| APP-003 | 설치 앱 standalone 실행 | NOT RUN |
| APP-004 | 배포본 네트워크 OFF 후 재실행 | NOT RUN |
| CACHE-RUNTIME-001 | 실제 v0.2.0 App Shell이 v0.3.0으로 교체 | NOT RUN |

### DB/Migration 판정

이번 버전은 Schema 변경이 없다.

```text
APP 0.2.0 -> 0.3.0
DB  1     -> 1
Schema 1  -> 1
Seed 1    -> 1
```

따라서 Migration을 실행하지 않는 것이 정상이며 기존 v0.2 Profile/Seed를 그대로 사용한다.

---

## v0.2.0

- 기준 버전: v0.1.0
- 검증일: 2026-09-04
- App: `0.2.0`
- DB Migration: `oldVersion 0 -> newVersion 1`
- 자동검증 환경: Node.js `v22.16.0`, Headless Chromium `144`
- 외부 npm 테스트 패키지: 없음

## 결과 요약

| 구분 | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|
| Smoke / App Shell | 53 | 0 | 0 |
| Architecture | 25 | 0 | 0 |
| Schema | 60 | 0 | 0 |
| 실제 Chromium / IndexedDB / PWA Runtime | 51 | 0 | 0 |
| GitHub Pages·갤럭시 실기기 | 0 | 0 | 5 |
| **합계** | **189** | **0** | **5** |

기계 판독 원본은 `tests/results/v0.2.0.json`에 기록했습니다.

## 실제 브라우저에서 통과한 핵심 검증

- GitHub Pages 형태의 `/repository-name/` 하위 경로에서 앱 부팅
- Manifest 오류 없음 및 `standalone`/scope 정상 해석
- Service Worker 활성화 및 해당 하위 경로 제어
- v0.2.0 App Shell 캐시 생성
- 모의 v0.1.0 캐시 제거 및 다른 앱 캐시 보존
- 네트워크 차단 후 App Shell 재실행
- 오프라인 상태에서 Profile 및 `14 / 14` Store 진단
- DB Version 1 및 14개 Object Store/실제 Index 정의 일치
- UUID와 UTC timestamp
- Profile/Seed 반복 실행 멱등성
- 사용자 변경 Seed 이름 보존
- 사용자가 soft-delete한 Seed 자동복원 금지
- payload의 위조 `profile_id` 무시
- Profile A/B 데이터 조회·수정 격리
- `created_at` 보존, `updated_at` 갱신, revision 증가
- stale revision의 수정·삭제·복원 거부
- protected metadata 수정 거부
- soft-delete/include-deleted/동일 ID restore
- 시스템 Seed·Template version·이용권 차감 복합 중복 차단
- optional unique key가 없는 일반 운동·예정·수동체중 복수 생성 허용
- Bootstrap 및 일반 다중 Store transaction rollback
- DB close/reopen 후 데이터 유지
- `app_logs` 최대 200건 제한

## 기존 v0.1.0 회귀 결과

| 영역 | 검증 결과 |
|---|---|
| 홈/캘린더/운동/식단/체중 5탭 | PASS |
| Hash Router 및 하위 경로 | PASS |
| 설정 헤더 진입 | PASS |
| Manifest standalone | PASS |
| Service Worker App Shell | PASS |
| 사용자 승인형 업데이트 로직 | PASS |
| 다른 Cache Storage 보호 | PASS |
| IndexedDB와 Service Worker 캐시 분리 | PASS |
| 완전 오프라인 로컬 재실행 | PASS |

## Migration 판정 범위

v0.1.0에는 IndexedDB 자체가 없었으므로 이번 검증은 **기존 DB 데이터의 v0→v1 변환 검증이 아니라 최초 DB 생성 검증**입니다.

통과한 것은 다음입니다.

```text
oldVersion 0 -> version 1 생성
14개 Store와 Index 생성
v1 데이터 저장
DB close
DB reopen
기존 ID/메타데이터 유지
```

실제 구버전 데이터 보존 Migration 검증은 DB Version이 `1 -> 2`로 올라가는 버전부터 수행합니다.

## 배포 후 수동검증

| Test ID | 검증 항목 | 상태 |
|---|---|---|
| APP-001 | 사용자 GitHub Pages에서 v0.2.0 접속 | NOT RUN |
| APP-002 | 갤럭시 Chrome 기존 앱 업데이트/설치 | NOT RUN |
| APP-003 | 설치 앱 standalone 실행 | NOT RUN |
| APP-004 | 배포본 네트워크 OFF 후 재실행 | NOT RUN |
| CACHE-RUNTIME-001 | 실제 v0.1.0 설치본이 v0.2.0으로 교체 | NOT RUN |

## 실행 방법

```bat
run-tests.bat
```

또는:

```bash
node tests/run-all-tests.mjs
```

Node.js 런타임에 WebSocket API가 없거나 Chrome/Edge를 찾지 못하거나 조직 정책이 로컬 URL을 차단하면 브라우저 Suite는 실패로 위장하지 않고 `NOT_RUN`으로 기록합니다. 제품 코드 실패는 `FAIL`, 환경상 실행 불가는 `NOT_RUN`으로 구분합니다.

## 판정 원칙

- 실행하지 않은 실기기 항목은 PASS로 기록하지 않습니다.
- 이전 결과 JSON은 테스트 시작 전에 삭제하여 stale PASS 재사용을 막습니다.
- 예상 결과 파일이 생성되지 않으면 `RESULT-MISSING` FAIL로 처리합니다.
- Migration/복구 실패 시 사용자 DB 자동삭제로 우회하지 않습니다.
- 자동검증 FAIL이 하나라도 있으면 릴리스 완료로 판정하지 않습니다.
- 테스트 DB는 `personal-health-pwa-test-*`를 사용하고 운영 DB와 분리합니다.
