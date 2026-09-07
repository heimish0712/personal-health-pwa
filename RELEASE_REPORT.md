# Release Report — v0.5.1 QA 피드백 반영

## 요약

사용자 요청6개를 반영했다: 예약 완료 이용권 기본 선택, 실제 월간 캘린더 및 연결 완료 단일 표시, 운동 종류 전환 입력 보존, 상태별 이용권 버튼, 전체 초기화, 별도 강제 복원(replace).

- 기준 HEAD: `16ad3fe27a1a77d4efc6b8597ae49b5ed7dac0e5` (작업 시작 시 clean).
- App/cache0.5.1 / DB_VERSION1 / Schema1 / Seed1 / Backup1. **Migration 없음**, Store/Index 변화 없음.
- **424 PASS / 0 FAIL / 25 NOT RUN**. 이전 자동386개 유지 + 신규38개. 실제 Pages/Galaxy QA25건 대기.
- 일반 pristine 복원, Local-first/Service/Repository/Semantic Command 구조, 기존 운동/예약 원장 transaction을 유지한다.

| Suite | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|
| smoke | 72 | 0 | 0 |
| architecture | 29 | 0 | 0 |
| schema | 60 | 0 | 0 |
| exercise-service | 19 | 0 | 0 |
| backup | 26 | 0 | 0 |
| browser-runtime | 218 | 0 | 0 |
| 실제 Pages/Galaxy QA | 0 | 0 | 25 |
| **합계** | **424** | **0** | **25** |

## 발견한 기존 구조 문제와 수정 여부

1. 캘린더의 schedule/log 단순 합산 → Calendar projection에서 연결 해석/단일 표시로 수정. 실제 운동일과 월 경계 연결도 기존 index로 조회한다.
2. 동적 필드 빈 값 재생성/비동기 응답 경쟁 → compatibleDraft와 응답 순서 검사로 수정. 날짜/시간/메모 DOM 유지.
3. 사용이력 기반 상태 버튼 → status 전용 toggle로 수정. usage/remaining은 그대로, pass revision만 증가.
4. non-pristine fingerprint가 null → 모든 portable 값과 pointer 값/device 정보로 대상 변경 검사 확장.
5. 브라우저 다운로드 클릭은 저장 완료 증거가 아님 → 내려받은 파일 재선택·validator/hash 일치 후에만 초기화/교체 허용. 다운로드/백업 실패로 데이터 삭제하지 않음.

reset/replace에서만 전용 Command의 portable clear를 허용하며 일반 Repository API는 변경하지 않았다. 같은 transaction에 현재 데이터 제거+원본 삽입 또는 정상 Seed 생성+pointer 전환을 포함한다. device_id 및 다른 device_settings/app_logs는 유지한다. 강제 복원은 merge나 Sync 충돌 해결이 아니다.

## 적용과 산출물

- changed.zip: 기준 HEAD 대비 수정/추가 파일만 포함, 저장소 루트에 경로 유지 적용.
- full.zip: 현재 전체 소스·문서·테스트, .git/ignored 개인 파일 제외.
- diff.patch: 신규 파일과 이미지 포함 binary patch. changed.zip과 patch 중 하나만 적용.
- manifest.json: 기준 commit, 변경/전체 목록, 삭제 목록, SHA-256과 검증 내용.
- 기존 환경에서 JSON 보호 백업 보관 → 변경 파일 적용 → 온라인 앱 업데이트 선택 → 홈 v0.5.1/DB1 확인 → MANUAL_QA.md 절차.
- 코드 수정/테스트/패키징까지만 수행했다. commit/push/실제 Pages 배포/운영 데이터 초기화는 수행하지 않았다.

## 안전 및 원복

초기화/강제 복원은 모든 Profile의 portable 데이터를 대상으로 한다. Backup v1은 한 Profile만 export하므로 여러 Profile이 있는 경우 백업 후 전체 교체 경로는 차단한다. 각 Profile을 따로 보관하거나 명시적 백업 없는 전체 교체 경고/최종 확인을 따른다.

백업 후 초기화/교체에는 저장된 JSON을 다시 선택하는 한 단계가 있다. 모바일 브라우저가 다운로드 완료 이벤트를 제공한다고 가정하지 않기 위한 검증이다. 잘못된 파일·미선택·대상 변경·백업 실패는 기존 데이터를 유지한다.

실패 transaction은 전부 rollback한다. 성공한 초기화/교체를 되돌리려면 보호 JSON으로 복원한다(빈 상태=일반 복원, 데이터 있음=강제 복원). 코드 reverse patch만으로 삭제된 사용자 데이터가 되살아나지는 않는다. DB 자체 삭제/downgrade는 하지 않는다.

## 검증 제한

실기기25건 NOT RUN. 412px 자동 캡처는 Galaxy 실기기 PASS가 아니다. 사진 Blob/ZIP 백업, merge/Sync 정책 추가 없음. 백업 v1의 사진 metadata 거절 정책 유지.

## 변경 파일 목록

총 51개: 신규 13 / 수정 38 / 삭제 0개.

- AGENTS.md
- CHANGELOG.md
- MANUAL_QA.md
- README.md
- REGRESSION_TEST.md
- RELEASE_REPORT.md
- REQUIREMENTS.md
- css/common.css
- docs/ARCHITECTURE.md
- docs/BACKUP_CORE_DESIGN.md
- docs/MIGRATION_POLICY.md
- docs/QA_V051_DESIGN.md
- docs/ROADMAP.md
- js/app.js
- js/application/backup-import.service.js
- js/application/pass-schedule.service.js
- js/bootstrap/container.js
- js/config.js
- js/core/backup/backup-format.js
- js/core/exercise-draft.js
- js/data/contracts/backup-restore-command.contract.js
- js/data/indexeddb/backup/backup-restore.command.js
- js/data/indexeddb/backup/restore-target.inspector.js
- js/data/indexeddb/repositories/exercise-schedule.repository.js
- js/pages/exercise/exercise-log-form.page.js
- js/pages/exercise/pass-schedule.page.js
- js/pages/settings/backup-restore.page.js
- service-worker.js
- tests/activity-ui-tests.mjs
- tests/architecture-test.mjs
- tests/backup-test.mjs
- tests/browser-runner.mjs
- tests/browser/db-test.html
- tests/browser/db-test.js
- tests/browser/qa-feedback-test.js
- tests/exercise-service-test.mjs
- tests/qa-feedback-ui-tests.mjs
- tests/results/v0.5.1-architecture.json
- tests/results/v0.5.1-backup.json
- tests/results/v0.5.1-browser.json
- tests/results/v0.5.1-calendar.png
- tests/results/v0.5.1-exercise-service.json
- tests/results/v0.5.1-mobile.png
- tests/results/v0.5.1-schema.json
- tests/results/v0.5.1-smoke.json
- tests/results/v0.5.1.json
- tests/run-all-tests.mjs
- tests/schema-test.mjs
- tests/smoke-test.mjs
- tests/test-reporter.mjs
- tests/traceability.json
