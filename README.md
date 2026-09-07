# Personal Health PWA

운동, 식단 사진, 체중, 인바디를 기록하기 위한 개인용 **local-first PWA**입니다.

## 현재 버전

- App: **v0.8.0**
- IndexedDB: **v2**
- Logical Schema: **v1**
- Seed: **v1**

v0.3.0부터 `운동` 탭을 실제로 사용할 수 있습니다. 필라테스 기본 Seed를 그대로 사용하고, 사용자가 러닝·걷기·복싱 등의 운동과 기록 양식을 직접 추가할 수 있습니다.

## 현재 가능한 기능

- GitHub Pages 설치형 PWA / standalone / 오프라인 App Shell
- 홈 / 캘린더 / 운동 / 식단 / 체중 5탭
- Local Profile, UUID, Profile 격리, soft-delete, revision 충돌 방지
- 운동 종류 생성·수정·활성/비활성·soft-delete/restore 기반
- 운동별 Template v1 생성 및 변경 시 version 증가
- 표준 필드 + 사용자 정의 필드 기반 동적 운동 입력폼
- 운동 기록 생성·조회·수정·soft-delete
- 운동 공통 메모
- 과거 기록의 역사적 Template 보존
- 운동 종류 필터 / 최근 기록 / 주간 운동 횟수·시간 계산
- 운동별 이용권·차감·원장, 삭제 기록 복원
- 예약 생성·수정·취소·완료·완료 취소, 기간별 예약/운동 조회
- 일반 체중/인바디 CRUD·메모·삭제/복원 및 선택적 원자적 체중 연동
- 7개 지표와 4개 기간의 오프라인 SVG 그래프, 최근 측정/변화량 및 Calendar 연결
- 설정 화면 DB 진단

v0.5.0에서 **운동 → 이용권 관리**, **캘린더 → 예약**을 사용할 수 있습니다. v0.6.0에서 **체중 → 일반 체중/인바디/변화 그래프**와 캘린더·홈 측정 요약을 사용할 수 있습니다. v0.7.0에서 **식단·사진과 ZIP Backup v2**를 사용할 수 있습니다. v0.8.0에서 **홈 대시보드·통합 캘린더·선택 날짜 빠른 기록**을 사용할 수 있습니다. 다음 단계인 운영 안정화, Supabase Sync는 [개발 로드맵](docs/ROADMAP.md)을 따릅니다.

## Backup Core v0.4.0

설정에서 **백업 내보내기 / 백업 복원**을 사용할 수 있습니다. 현재 Profile의 12 Store를 JSON v1으로 저장하며 UUID·revision·시각·삭제 상태·과거 Template을 보존합니다. 파일은 암호화되지 않습니다.

일반 복원은 자동 생성된 Profile·필라테스·Template만 있는 pristine 환경에서 허용합니다. 기존 데이터가 있으면 파일 미리보기는 가능하지만 일반 복원은 차단합니다. 별도 강제 복원은 v0.5.1 절을 참조하세요. 사진 메타데이터가 있는 데이터는 v1으로 내보내거나 복원할 수 없습니다. 최대 파일 크기는 50 MB입니다.

원본과 복원 후 portable 데이터의 SHA-256을 비교하고, 성공 후 앱을 새로고침합니다. DB 1 / Schema 1 / Seed 1 / 14 Store 유지, Migration은 없습니다.

## Local-first 구조

```text
UI / Page
  -> Application Service
  -> Repository Contract / Semantic Command Port
  -> IndexedDB Adapter
  -> IndexedDB
```

여러 Store를 동시에 바꾸는 작업은 generic IndexedDB transaction을 Service에 노출하지 않고 업무 의미를 가진 Command Port로 묶습니다.

예:

```text
운동 종류 + Template v1 생성
-> ExerciseManagementCommand
-> IndexedDB transaction

Template 버전 교체
-> 기존 active Template superseded
-> 신규 version 생성
-> 동일 transaction
```

향후 Supabase는 IndexedDB를 교체하지 않습니다.

```text
IndexedDB (local source)
  -> future sync_outbox
  -> future Sync Engine
  -> Supabase Auth / PostgreSQL / Storage
```

UUID, `profile_id`, `created_at`, `updated_at`, `deleted_at`, `revision`을 이미 로컬 데이터 모델에 사용하므로 서버화 시 기존 화면과 업무규칙을 유지하는 것을 목표로 합니다.

## 운동 Template 정책

- `performed_at`, `memo`는 운동 공통 필드입니다.
- 운동별 추가 필드는 `exercise_templates.fields`에 저장합니다.
- 사용자 정의 필드는 UUID 기반 고정 key를 사용합니다.
- label을 바꿔도 기존 key는 유지합니다.
- Template 변경은 기존 행을 덮어쓰지 않고 새 version을 만듭니다.
- 과거 운동기록은 생성 당시 `template_id`를 유지합니다.
- Template 충돌은 `expectedTemplateId + expectedTemplateRevision`으로 검사합니다. 버전마다 revision이 1부터 시작할 수 있으므로 revision 숫자만으로 판정하지 않습니다.

## GitHub Pages 배포

1. 변경 ZIP을 쓸 경우 내부 파일을 repository 루트에 상대경로 그대로 덮어씁니다.
2. 또는 full ZIP의 전체 소스를 repository 루트에 반영합니다.
3. `main`에 commit/push합니다.
4. `Settings > Pages > Deploy from a branch > main / (root)`를 확인합니다.
5. 기존 설치 앱에서 업데이트 배너가 뜨면 입력 중 데이터가 없는 상태에서 업데이트합니다.
6. 홈에서 `v0.4.0 · DB 1`을 확인합니다.
7. 운동 탭에서 기본 필라테스와 운동 추가/기록 기능을 확인합니다.

DB_VERSION은 v0.3.0과 동일한 1이므로 **DB Migration은 없습니다. 기존 Profile과 Seed를 그대로 재사용합니다.**

## 로컬 실행

Windows:

```bat
run-local.bat
```

또는:

```bat
py -3 -m http.server 8080
```

`http://localhost:8080/`으로 접속합니다. `file://`에서는 Service Worker가 정상 동작하지 않습니다.

## 자동검증

v0.4.0 검증 결과는 **330 PASS / 0 FAIL / 9 NOT RUN**입니다. NOT RUN은 사용자 배포·실기기 QA입니다. 상세 결과는 `tests/results/v0.4.0.json`에 기록합니다. 이전 v0.3 FINAL과 별도이며, 사용자 실기기 QA는 미보고 상태에서 NOT RUN으로 남깁니다.

```bat
run-tests.bat
```

또는:

```bash
node tests/run-all-tests.mjs
```

검사 범위:

- PWA App Shell / 버전 / 오프라인 모듈 포함 여부
- 계층 의존성(Page -> Service -> Contract/Command -> Adapter)
- 14 Store / Index Schema 회귀
- 운동 Application Service 단위검사
- Template version / 역사적 Template 보존
- custom field key 안정성
- revision 충돌 / soft-delete / Profile 격리
- 브라우저 IndexedDB 운동 회귀 시나리오(실행 가능한 환경에서)

회귀 기준은 **v0.3.0 FINAL BASELINE: 186 PASS / 0 FAIL / 0 NOT RUN**입니다. App `0.3.0`, DB Version `1`, Schema `1`, Seed `1`을 유지합니다.

당시 자동검증 결과는 `180 PASS / 0 FAIL / 6 NOT RUN`이었으며 `tests/results/v0.3.0*.json`에 실행 이력으로 보존합니다. 이후 사용자가 GitHub Pages·갤럭시·오프라인·`tests/browser/db-test.html`까지 모두 통과했다고 보고하여, 남아 있던 Browser Runtime 1건과 실기기 5건을 사용자 QA 통과로 반영했습니다. 문서 반영일은 2026-09-07입니다. 이는 자동검증 재실행 결과가 아닙니다.

최종 판정과 증적 구분은 [REGRESSION_TEST.md](REGRESSION_TEST.md)에 기록합니다. 후속 버전은 자동검증 결과와 사용자 실기기 QA를 별도로 기록하며, 이전 PASS를 새 버전의 PASS로 자동 승계하지 않습니다.

## 문서

- `REQUIREMENTS.md` — 고정 요구사항
- `CHANGELOG.md` — 버전별 변경이력
- `REGRESSION_TEST.md` — 회귀검증 결과
- `RELEASE_REPORT.md` — 영향 범위·적용·복구
- `docs/ARCHITECTURE.md` — 계층 및 Supabase 확장 경계
- `docs/DATA_MODEL.md` — Store와 운동 Template/Log 관계
- `docs/MIGRATION_POLICY.md` — 데이터 보존형 Migration 원칙
- `docs/ROADMAP.md` — 확정된 개발 순서와 후속 기능 설계 원칙
- `docs/BACKUP_CORE_DESIGN.md` — v0.4.0 Backup Core 구현 명세
- `AGENTS.md` — 저장소 작업 규칙과 회귀 기준
- `tests/traceability.json` — 요구사항 ↔ 테스트 ID
- `tests/results/v0.3.0.json` — 당시 자동검증 실행결과(최종 사용자 QA 반영 전 이력)

- `tests/results/v0.4.0.json` — 현재 버전의 자동검증 및 실기기 QA 대기 항목

수동 검증: [MANUAL_QA.md](MANUAL_QA.md). 배포 및 복구 주의사항: [RELEASE_REPORT.md](RELEASE_REPORT.md).


## v0.5.1 QA 개선

캘린더는 월간 달력과 선택일 목록이며 완료 예약/운동기록은 한 항목으로 표시합니다. 예약 완료는 사용 가능한 첫 이용권을 기본 선택합니다. 운동 전환 시 공통 입력이 유지되고 이용권 상태 버튼은 활성/비활성에 맞춰 바뀝니다.
설정에서 전체 데이터 초기화와 별도 강제 복원을 제공합니다. 일반 복원은 기존 pristine 제한을 유지합니다. 강제 복원은 merge 없이 현재 portable 데이터를 완전히 교체하며, 백업 후 진행 시 내려받은 파일을 다시 선택해 확인해야 합니다. device_id는 유지하고 DB 자체는 삭제하지 않습니다.


## Diet + Media + Backup v2 (v0.7.0)

식단 탭의 날짜별 기록에서 카메라/갤러리 JPEG·PNG·WebP를 최대12장 첨부합니다. 원본 대신 긴변1280px 압축본과320px 썸네일을 저장합니다. 삭제/복원을 위해 사진 tombstone의 파일도 유지합니다. 고아 정리는 어떤 사진에서도 참조하지 않는 파일만 제거합니다.

사진이 있으면 설정의 백업 내보내기가 ZIP v2를 생성합니다. 사진 없는 데이터는 JSON v1을 유지하며 기존 JSON v1도 계속 복원합니다. ZIP은 앱에서 내려받은 원본 파일을 사용하고, 다른 도구로 다시 압축하지 마세요(STORE 방식, ZIP64/암호화 미지원, 최대250MB). 사진1개라도 누락/손상이면 전체 복원을 거절합니다.

DB1→2 Migration은 media_blobs Store만 추가하고 기존 데이터는 변경하지 않습니다. Portable Schema1/Seed1은 유지합니다. 이전 앱 파일만 다시 배포해 DB2를 downgrade할 수는 없습니다. 업데이트 전 JSON과 업데이트 후 사진 포함 ZIP을 보관하고 문제 발생 시 원본 DB를 유지한 채 별도 pristine 환경에서 백업을 확인하세요.

실제 Galaxy/Pages 절차는 [MANUAL_QA.md](MANUAL_QA.md), 구현·검증 및 산출물은 [RELEASE_REPORT.md](RELEASE_REPORT.md)에서 확인합니다.
