# 저장소 작업 규칙

## 기준선과 근거

- 현재 확정 기준은 v0.3.0 FINAL BASELINE: **186 PASS / 0 FAIL / 0 NOT RUN**이다.
- App `0.3.0`, DB_VERSION `1`, SCHEMA_VERSION `1`, SEED_VERSION `1`.
- 최종 판정은 [REGRESSION_TEST.md](REGRESSION_TEST.md)를 읽는다. 추가 6건은 2026-09-07 사용자가 보고한 GitHub Pages·갤럭시·오프라인·db-test.html QA 통과다.
- `tests/results/v0.3.0*.json`의 180 PASS / 0 FAIL / 6 NOT RUN은 당시 자동검증 이력이다. 이를 현재 최종 기준선으로 보고하거나 자동 실행 PASS로 바꿔 쓰지 않는다.
- 새 버전·새 실행의 결과는 기존 기준선과 분리한다. 사용자 실기기 QA를 자동 PASS 처리하거나 이전 PASS를 자동 승계하지 않는다.

## 작업 방식

- 현재 저장소의 실제 코드, git 상태, REQUIREMENTS, 관련 설계를 먼저 읽는다.
- 기존 정상 기능을 임의 재작성하지 않는다. 사용자 변경을 보존하고 승인된 작업 범위에서 진행한다.
- 현재 구현은 이용권·예약 v0.5.0이며 다음 단계는 체중·인바디다. 순서는 [ROADMAP.md](docs/ROADMAP.md), 상세 명세는 [BACKUP_CORE_DESIGN.md](docs/BACKUP_CORE_DESIGN.md)를 따른다.
- 최신 사용자 지시에 따라 복원은 자동 Seed만 있는 pristine 환경에서 수행한다. 전용 Command transaction 안에서 검증된 초기 3행만 제거하는 예외가 있다. 이전 'Seed 생성 전 복원' 설계를 적용하지 않는다.
- DB 변경 전 DB/Schema/Seed 버전과 Migration 필요 여부를 명시한다. 실제 구조 변경 없이 기능 추가만으로 DB 버전을 올리지 않는다.
- UI → Service → Contract/Semantic Command Port → Adapter 경계를 유지한다. 다중 Store 업무는 Command transaction으로 처리한다.
- BaseScopedRepository의 범용 `list()`는 유지한다. 기간 조회 성능은 기능별 Repository에 기존 Profile+날짜 인덱스 메서드를 추가하여 개선한다.
- 일반 CRUD에 물리삭제·clear·무조건 덮어쓰기·백업 import API를 노출하지 않는다.
- 동일 pass 재적용은 기존 cancelled usage ID를 재활성화한다. 기존 pair UNIQUE를 유지하며 새 행 누적/Migration 제안은 폐기되었다.
- 이용권은 운동기록별 `status = used` 로그 최대 1건, `cancelled` 이력 여러 건을 허용하는 규칙을 Command transaction 안에서 검사한다. `exercise_log_id` 단독 UNIQUE를 추가하지 않는다.

## 변경 산출물과 검증

- CHANGELOG, REQUIREMENTS, REGRESSION_TEST를 작업에 맞게 갱신한다. 설계·미구현·실행 결과를 구분한다.
- 변경 파일 수, 삭제 파일(없으면 0개), 버전, Migration, 영향 범위, 적용·복구 방법을 명시한다.
- changed/full/diff 산출물 또는 git diff를 제공한다. 신규 파일도 확인할 수 있게 제공한다.
- 변경에 맞는 자동검증을 수행하고 PASS / FAIL / NOT RUN을 나누어 기록한다. 문서만 바꾼 작업은 문서·diff 정합성 확인으로 검증하며 제품 테스트 재실행 여부를 명시한다.
- 확정 기준선의 과거 결과 파일은 보존한다. 다음 구현 시 테스트 runner의 결과 경로/버전을 정리하여 과거 실행 이력을 덮어쓰지 않도록 한다.
- 사용자 QA는 사용자가 보고한 버전·범위·결과를 출처와 함께 기록한다. 미보고 항목은 미실행으로 남긴다.
- 테스트 DB와 브라우저 Profile은 운영 데이터와 분리한다. 오류나 Migration 실패를 DB 삭제·초기화로 해결하지 않는다.

## 협업 책임

- 사용자와 설계 검토자가 요구사항·설계·회귀 기준을 정한다.
- Codex는 실제 코드 확인, 허용된 구현, 자동검증, diff와 문서 작성을 맡는다.
- GitHub Pages·갤럭시 실기기 QA는 사용자가 수행하고 결과를 보고한다.
- 결과 판정과 후속 변경에는 실제 증적과 최신 사용자 지시를 반영한다.
