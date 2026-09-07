# Regression Test

## v0.4.0 Backup Core

- 검증일: 2026-09-07T02:31:49.964Z
- App 0.4.0 / DB 1 / Schema 1 / Seed 1 / Backup Format 1. Migration 없음.
- Node v24.16.0, 실제 임시 Chrome Profile: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36.

| 구분 | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|
| smoke | 72 | 0 | 0 |
| architecture | 29 | 0 | 0 |
| schema | 60 | 0 | 0 |
| exercise-service | 19 | 0 | 0 |
| backup | 26 | 0 | 0 |
| browser-runtime | 124 | 0 | 0 |
| 사용자 배포·실기기 QA | 0 | 0 | 9 |
| **합계 (339건)** | **330** | **0** | **9** |

자동검증은 모두 통과했다. 사용자 실기기 QA 9건은 미실행이며 릴리스의 실기기 최종 승인까지 완료된 것으로 판정하지 않는다. v0.3 FINAL 186/0/0은 아래에 보존하며 새 버전에 자동 승계하지 않는다. 이번 Browser Runtime은 실제 실행된 세부 시나리오를 개별 집계하므로 과거 Suite 1건 집계와 총건수를 단순 비교하지 않는다.

### 핵심 검증

- 현재 Profile만 export, 삭제 행·역사적 Template·revision·시각 보존, 사진 metadata 거절.
- 원본/복원 후 전체 portable snapshot SHA-256 동일. DB close/reopen 및 bootstrap 후에도 동일.
- Seed 제거 직후부터 commit 직전까지 5개 지점 실패 주입: 초기 Profile/Seed·포인터까지 전체 rollback.
- 수정된 Seed·사용자 데이터·stale 미리보기 거절, 두 연결의 동시 복원 중 한 건만 성공.
- 오프라인에서 실제 JSON 파일 다운로드, 미리보기, 복원/reload, populated 대상 차단과 hash 재검증.
- 기존 PWA·5탭·Profile·14 Store/Index·운동 CRUD·Template·soft-delete 회귀 통과.

최초 브라우저 실행은 샌드박스 환경에서 충돌했다. 허용된 별도 임시 Chrome Profile로 재실행했다. 실브라우저 검증 중 pristine Seed 비교의 unit 누락을 찾아 수정한 뒤 전체 suite를 다시 실행하여 위 최종 결과를 얻었다. 운영 DB/사용자 브라우저 Profile은 사용하지 않았다.

### 사용자 QA 대기

- BACKUP-QA-EXPORT: NOT RUN — User: Galaxy download and retained JSON file from actual v0.3 data.
- BACKUP-QA-PREVIEW: NOT RUN — User: valid file preview on populated device, restore blocked.
- BACKUP-QA-RESTORE: NOT RUN — User: restore on a pristine browser, original Profile and records preserved.
- BACKUP-QA-OFFLINE: NOT RUN — User: offline export/restore and record CRUD after offline relaunch.
- APP-001: NOT RUN — Deploy v0.4.0 to the user GitHub Pages repository.
- APP-002: NOT RUN — Verify install/update behavior on Galaxy Chrome.
- APP-003: NOT RUN — Verify standalone launch on the installed app.
- APP-004: NOT RUN — Verify offline relaunch on the deployed installed app.
- CACHE-RUNTIME-001: NOT RUN — Verify v0.3.0 App Shell replacement by v0.4.0 on the deployed origin.

실기기 확인은 기존 데이터에서 내보내기 → 같은 앱에서 파일 검증/미리보기 및 실행 차단 → 새 초기 환경에서 실제 복원 → 네트워크 OFF 재실행/운동 CRUD 순서로 한다. 기존 사이트 데이터를 삭제하여 복원 환경을 만들지 않는다.

기계 판독 결과: [v0.4.0.json](tests/results/v0.4.0.json). 실제 테스트 매핑: [traceability.json](tests/traceability.json).

---


## v0.3.0 FINAL BASELINE

- 기준 버전: v0.2.0
- 최초 검증 문서일: 2026-09-05
- 최종 기준선 문서 반영일: 2026-09-07
- App: `0.3.0`
- DB Version: `1` 유지
- Schema Version: `1` 유지
- Seed Version: `1` 유지
- DB Migration: 없음
- 자동검증 환경: Node.js `v22.16.0`
- 외부 npm 테스트 패키지: 없음

### 최종 결과 요약

```text
v0.3.0 FINAL BASELINE

PASS       186
FAIL         0
NOT RUN      0

APP          0.3.0
DB_VERSION   1
SCHEMA       1
SEED         1
```

| 구분 | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|
| Smoke / App Shell | 72 | 0 | 0 |
| Architecture | 29 | 0 | 0 |
| Schema 회귀 | 60 | 0 | 0 |
| Exercise Application Service | 19 | 0 | 0 |
| Browser Runtime / IndexedDB — 사용자 QA | 1 | 0 | 0 |
| GitHub Pages·갤럭시 실기기 — 사용자 QA | 5 | 0 | 0 |
| **합계** | **186** | **0** | **0** |

확정 근거: 2026-09-07 사용자가 GitHub Pages·갤럭시·오프라인·`tests/browser/db-test.html` 검증을 모두 통과했다고 보고하고 위 최종 기준선을 지정했다. 기존 미실행 항목인 Browser Runtime 1건과 실기기 5건을 **사용자 QA 통과**로 반영한다. Browser Runtime은 기존 집계의 Suite 1건 단위를 유지하며 내부 테스트 수를 새로 추정하여 합산하지 않는다.

당시 자동검증 원본 `tests/results/v0.3.0.json` 및 Suite JSON의 `180 PASS / 0 FAIL / 6 NOT RUN`은 역사적 실행결과로 보존한다. 원본의 `BROWSER-POLICY` 환경 기록을 자동 PASS로 변경하지 않는다. 최종 릴리스 판정은 이 문서이며, 이 정정 과정에서 자동검증을 재실행한 것은 아니다.

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

### 당시 브라우저 자동검증 이력

당시 자동검증 환경의 Chromium 정책 제한으로 로컬 테스트 URL이 차단되어 `BROWSER-POLICY = NOT_RUN`이 기록되었다. 이는 당시 실행환경에 대한 이력이며, 이후 사용자 QA로 확정된 v0.3 FINAL 기준선의 미검증 항목을 뜻하지 않는다.

브라우저 테스트 코드에는 v0.2 기존 회귀와 다음 v0.3 시나리오가 포함되어 있다. 사용자가 `db-test.html` 검증 통과를 보고했다.

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

### 사용자 QA 최종 반영

| Test ID | 검증 항목 | 상태 |
|---|---|---|
| APP-001 | 사용자 GitHub Pages에서 v0.3.0 접속 | PASS — 사용자 보고 |
| APP-002 | 갤럭시 Chrome 기존 앱 업데이트/설치 | PASS — 사용자 보고 |
| APP-003 | 설치 앱 standalone 실행 | PASS — 사용자 보고 |
| APP-004 | 배포본 네트워크 OFF 후 재실행 | PASS — 사용자 보고 |
| CACHE-RUNTIME-001 | 실제 v0.2.0 App Shell이 v0.3.0으로 교체 | PASS — 사용자 보고 |
| Browser Runtime / IndexedDB (기존 Suite 집계 1건) | `tests/browser/db-test.html` 등 브라우저 검증 | PASS — 사용자 보고 |

### DB/Migration 판정

이번 버전은 Schema 변경이 없다.

```text
APP 0.2.0 -> 0.3.0
DB  1     -> 1
Schema 1  -> 1
Seed 1    -> 1
```

따라서 Migration을 실행하지 않는 것이 정상이며 기존 v0.2 Profile/Seed를 그대로 사용한다.

### 후속 Backup Core 인수 기준

Backup Core는 v0.4.0에서 구현했다. 상세 명세는 [BACKUP_CORE_DESIGN.md](docs/BACKUP_CORE_DESIGN.md)를 따른다. 실제 BACKUP/RESTORE 테스트 ID와 결과는 v0.4 집계에 별도로 기록하고 v0.3 FINAL 186건에 합산하지 않는다.

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
- 사용자 QA는 사용자 보고를 근거로 별도 표시하고 자동검증 PASS로 위장하지 않습니다.
- 확정된 v0.3 FINAL 기준선과 과거 자동결과 JSON을 구분합니다. 후속 실행의 NOT RUN을 과거 PASS로 덮어쓰지 않습니다.
- 이전 결과 JSON은 테스트 시작 전에 삭제하여 stale PASS 재사용을 막습니다.
- 예상 결과 파일이 생성되지 않으면 `RESULT-MISSING` FAIL로 처리합니다.
- Migration/복구 실패 시 사용자 DB 자동삭제로 우회하지 않습니다.
- 자동검증 FAIL이 하나라도 있으면 릴리스 완료로 판정하지 않습니다.
- 테스트 DB는 `personal-health-pwa-test-*`를 사용하고 운영 DB와 분리합니다.
