# 개발 로드맵

확정일: 2026-09-07. 사용자 지정 순서를 기록한다. 아래 단계는 기능 완료를 의미하지 않는다.

## 기준선

v0.3.0 FINAL BASELINE: **186 PASS / 0 FAIL / 0 NOT RUN**.
App `0.3.0` / DB `1` / Schema `1` / Seed `1`.
최종 사용자 QA와 과거 자동실행 이력의 구분은 [REGRESSION_TEST.md](../REGRESSION_TEST.md)를 따른다.

## 구현 순서

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| 0 | v0.3 FINAL 기준선 문서 확정 | 사용자 QA 출처 명시, 과거 자동결과 보존 |
| 1 | Backup Core — v0.4.0 | 12 Store JSON export/import, 파일 검증, 병합 없는 pristine 복원, ID·관계·revision·삭제 상태 보존 |
| 2 | 이용권 + 예약 — v0.5.0 | 사용원장, 운동기록 연동, 예약 완료, transaction·멱등성, 기본 캘린더 연결 |
| 3 | 체중 + 인바디 | source/source_ref_id 연동, 그래프, 기간 조회, 캘린더 표시 확장 |
| 4 | 식단 + 사진 | media_blobs, 압축·thumbnail, 데이터 보존 Migration, 캘린더 표시 확장 |
| 5 | Backup v2 | data.json + media/ ZIP, 사진 복원, JSON Backup v1 읽기 호환 |
| 6 | 홈 + 통합 캘린더 완성 | 각 원본 Store를 조회하는 통합 요약과 날짜별 표시 |
| 7 | 운영 안정화 | 누적 데이터, 오프라인·업데이트, 저장 실패·복구, 성능, 실기기 회귀검증 |
| 8 | Supabase/Auth/Sync | Profile 소유권 연결, Outbox, 재시도·충돌, 기기간 동기화, 원격 사진 저장 |

홈과 캘린더는 원본 기능이 추가될 때 점진적으로 연결한다. 단계 6은 통합 완성 시점이다. 사용자 최종 지시로 Backup Core=v0.4.0, 이용권·예약=v0.5.0을 확정했다.

## 이용권·예약 설계 경계

- 운동기록 + 사용원장, 예약 완료 + 운동기록 + 사용원장은 각각 하나의 Semantic Command transaction으로 처리한다.
- Command transaction 안에서 Profile 소유권, 관계, expectedRevision, 잔여 횟수와 적용 기간, 기존 사용로그를 재확인한다. 검사와 저장을 서로 다른 transaction으로 나누지 않는다.
- 같은 Profile의 운동기록 한 건에 `status = used`인 사용로그는 최대 1건이다. `cancelled` 로그는 여러 건 보존한다. 상태 판정에서 삭제 표시를 이용해 규칙을 우회하지 않는다.
- A 이용권 사용 → 취소 → B 이용권 사용 → 취소 → A 이용권 재사용 시 이전 로그는 cancelled로 보존하고 마지막 사용은 새 로그 ID로 기록한다.
- 현재 `uq_profile_pass_exercise`는 동일 이용권·운동기록 쌍 전체에 UNIQUE이므로 위 A 재사용 이력을 새 행으로 쌓을 수 없다. 이용권 개발 단계에서 이 인덱스를 제거하거나 비고유 조회 인덱스로 교체하는 누적 Migration을 설계한다. 기존 사용로그 행은 보존하고 one-active-usage와 재요청 중복 방지는 Command로 검증한다.
- `exercise_log_id` 단독 UNIQUE로 바꾸지 않는다. 요청 식별자를 보존하는 멱등성 설계를 별도로 두어 같은 요청의 재시도와 사용자의 새 차감 의도를 구분한다.
- Backup Core에서는 현재 DB v1 인덱스와 사용로그 데이터를 그대로 보존한다. 이용권 개발 단계에서 이전 백업을 읽는 변환·검증도 함께 갱신한다.
- 향후 PostgreSQL에서도 같은 업무 경계를 RPC로 대응하고 동시성 제약을 원격 transaction에서 보장한다.

## 체중·인바디와 조회

- 인바디 유래 체중은 `source + source_ref_id`로 원본을 식별하고 생성·수정·삭제·복원을 함께 처리한다.
- `BaseScopedRepository.list()`를 유지한다. 기능별 `listByDateRange()`를 추가하여 기존 Profile+시각 복합 인덱스를 사용한다.
- 실제 클래스는 `ExerciseLogRepository`, `ExerciseScheduleRepository`, `WeightRepository`, `InbodyRepository`, `DietLogRepository`다.
- 날짜 구간은 Profile timezone 기준으로 만들고 UTC의 `[start, end)` 범위로 조회한다. 조회 결과는 기본적으로 soft-delete 행을 제외한다.

## 백업 단계 분리

- Backup Core는 현재 데이터의 JSON 파일만 다룬다. [상세 설계](BACKUP_CORE_DESIGN.md)를 따른다.
- 사진 Blob 저장소가 생기면 Backup v2를 추가한다. ZIP 안에 `data.json`과 `media/` 원본·썸네일을 포함한다.
- diet_photos가 존재하면 Backup v1 Export/Import를 거절한다. 사진까지 완전 복구 가능한 릴리스 판정은 단계 5 검증 후에 한다.
- Backup v2 도입 후에도 Backup v1 reader를 유지한다. JSON v1 복원 시 사진이 있었다고 가정하거나 없는 파일을 생성하지 않는다.
- 기존 데이터 병합은 Backup Core 범위 밖이다. 동일 UUID, revision, deleted_at, 관계 충돌 정책을 Sync 설계 단계에서 다룬다.

## 작업 규칙

기존 기능 보존, 코드 기반 검토, Migration 사전 명시, 삭제 파일 명시, diff 제공, CHANGELOG/REQUIREMENTS/REGRESSION_TEST 갱신, PASS/FAIL/NOT RUN 및 사용자 QA 출처 구분은 [AGENTS.md](../AGENTS.md)를 따른다.
