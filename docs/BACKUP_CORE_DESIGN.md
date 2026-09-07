# Backup Core — v0.4.0

2026-09-07 사용자 최종 작업지시에 따른 구현 명세다. 앞서 작성한 Seed 생성 전 복원, 다른 envelope, 20 MiB 제한 설계를 대체한다.

## 버전과 범위

- App 0.4.0 / DB 1 / Schema 1 / Seed 1 / BACKUP_FORMAT_VERSION 1.
- 기존 14 Store/Index 변경 없음, IndexedDB Migration 없음.
- 현재 활성 Profile 1건과 그 Profile의 portable 데이터만 백업한다. 삭제 행·superseded Template 포함.
- 기존 데이터 병합, 부분 복원, Profile 복사, 사진 Blob/ZIP, 클라우드·자동 주기 백업은 구현하지 않는다.
- 다음 이용권·예약 버전은 v0.5.0이다.

## 파일 형식

파일명: `personal-health-backup-v1-YYYYMMDDTHHMMSSZ.json`.
UTF-8 JSON, 최대 50 MB(50,000,000 bytes). 파일을 읽기 전 크기를 검사한다.

``
{
  "format": "personal-health-pwa-backup",
  "backupVersion": 1,
  "source": {
    "appVersion": "0.4.0",
    "dbVersion": 1,
    "schemaVersion": 1,
    "seedVersion": 1
  },
  "exportedAt": "UTC ISO",
  "scope": { "type": "profile", "profileId": "원본 UUID" },
  "counts": { "각 Store": "행 수" },
  "data": { "각 Store": [] },
  "integrity": { "algorithm": "SHA-256", "payloadHash": "64자리 소문자 hex" }
}
``

위 코드는 구조 설명이며 다운로드 가능한 예시 백업 파일은 아니다.

12개 data/counts 키는 다음과 같다. 빈 Store도 배열/0으로 명시한다.

``
profiles, exercise_types, exercise_templates, exercise_logs,
exercise_schedules, passes, pass_usage_logs, diet_logs, diet_photos,
weight_logs, inbody_logs, user_settings
``

profiles는 scope.profileId와 같은 원본 1행이다. 나머지 행은 해당 profile_id만 포함한다. device_settings/app_logs와 캐시는 제외한다. diet_photos에 삭제 행을 포함해 한 행이라도 있으면 Export/Import 모두 BACKUP_MEDIA_UNSUPPORTED로 거절한다.

## Snapshot과 무결성

- BackupSnapshotReader는 12 Store를 한 번의 readonly transaction으로 읽는다.
- Store별 행을 id ASC로 정렬한다. Profile 범위 필터는 Adapter에서 수행한다.
- SHA-256 대상은 **scope + counts + data**다. source/exportedAt은 체크섬 대상이 아니며 별도로 형식을 검증한다.
- canonical JSON은 객체 key를 UTF-16 사전순으로 직접 출력한다. 업무 배열 순서는 유지한다. Store 행 배열만 id 순으로 정규화한다.
- 공백/들여쓰기와 객체 key 입력 순서는 hash에 영향을 주지 않는다. 문자열 trim이나 Unicode 정규화를 하지 않는다. 음의 0은 -0 표기를 보존한다.
- Blob/Date/undefined/비유한 수/순환 참조/64단계 초과 중첩은 조용히 변환하지 않고 오류로 처리한다.
- Export 문서도 동일 Validator를 통과해야 다운로드된다.
- checksum은 손상 검출 정보이며 보안서명·암호화가 아니다. 실제 파일은 Git에 넣지 않는다.

## 계층

``
Settings Page
  -> BackupExportService / BackupImportService
  -> BackupValidationService
  -> BackupValidator / BackupMigrationRegistry / canonical JSON / integrity
  -> BackupSnapshotReaderContract / BackupRestoreCommandContract
  -> IndexedDbBackupSnapshotReader / IndexedDbBackupRestoreCommand
  -> IndexedDB
``

RestoreTargetInspector는 Adapter에서 동작하며 Service에 IDBTransaction을 노출하지 않는다. 일반 Repository create/update/restore를 import에 재사용하지 않는다. 일반 RepositoryContract와 BaseScopedRepository는 변경하지 않았다.

## Import 검증

파일 크기 → JSON → format/backupVersion/schemaVersion → 12개 Store와 counts → checksum → 행/UUID/메타데이터 → Profile 범위 → 참조 → 고유키 → 사진 지원 여부 → 대상 상태 → 미리보기 → 복원 실행 순으로 처리한다.

- v1/schema1 reader를 지원한다. 미지원 backup/schema 버전은 거절한다.
- appVersion과 dbVersion 차이 자체는 거절 기준이 아니다. metadata로 유효한 값인지만 검사한다.
- BackupMigrationRegistry는 v1→v1 no-op이며 실제 변환은 없다.
- UUID v4, 양의 정수 revision, UTC ISO, created_at ≤ updated_at, deleted_at null/UTC를 검사한다.
- 복원 뒤 bootstrap이 원본을 변경하지 않도록 Profile seed_version은 현재 Seed 이상이어야 한다.
- exercise_templates → exercise_types, exercise_logs → type/template 및 운동 일치를 검사한다.
- schedules의 운동/완료 기록, passes의 운동, usages의 pass/log 및 운동 일치를 검사한다.
- weight_logs.source=inbody이면 source_ref_id가 inbody_logs에 존재해야 한다.
- 삭제된 참조 대상은 정상적인 역사적 연결로 인정한다.
- 현재 DB v1의 7개 고유 인덱스를 사전 검사한다. 빠진 optional key를 null/새 UUID로 보충하지 않는다.
- Template fields와 과거 values를 검증하며 최신 양식으로 변환하지 않는다.
- 파일 검증 상태는 Service 내부에 보관한다. UI에 반환한 미리보기를 수정하여 복원 payload를 바꿀 수 없다.
- 재선택/취소는 이전 미리보기를 폐기한다.

## Pristine 정의

기존 자동 부팅/Seed 생성은 유지한다. 설정에서 다음 상태만 복원 대상으로 인정한다.

- Profile 정확히 1개: 기본 이름·timezone·seed_version, revision1, 삭제 없음, created_at=updated_at.
- 기본 필라테스 종류 1개와 기본 Template v1 1개: system_key, 이름, 아이콘, 상태, 정렬, fields 전체가 최초 Seed와 같음.
- 세 행의 생성 시각이 같고 각각 revision1, 삭제 없음, updated_at=created_at. 예기치 않은 추가 필드도 허용하지 않는다.
- 다른 9개 portable Store는 모두 0행. user_settings도 현재 자동 기본값이 없으므로 0행이어야 한다.
- device_id가 존재하고 current_profile_id가 초기 Profile을 가리킴.
- 삭제 행, 수정 후 이름을 되돌린 행(revision 증가), 사용자 설정, 추가 Profile/고아 행도 데이터로 취급하여 복원 거절.

DB를 삭제/초기화하여 위 조건을 만들지 않는다. 새 브라우저의 자동 Seed만 있는 환경에서 복원한다. 기존 데이터가 있어도 정상 파일의 내용·무결성은 미리보기로 확인할 수 있고 실행 버튼만 차단한다.

## 13 Store 복원 transaction

1. 파일 검증과 SHA-256 계산은 transaction 밖에서 끝낸다.
2. 12 portable Store + device_settings를 단일 readwrite transaction으로 연다.
3. 실제 pristine 상태와 미리보기 당시 fingerprint(Profile/Seed/포인터/기기)을 다시 비교한다.
4. 조건이 맞으면 **확인된 초기 Template ID, 필라테스 ID, Profile ID 세 행만** 전용 Adapter 내부에서 제거한다.
5. 원본 Profile과 11개 Store 행을 add()한다. 원본 UUID/revision/timestamp/deleted_at/관계를 그대로 넣는다.
6. current_profile_id만 원본 Profile로 연결한다. device_id 및 나머지 기기 설정은 유지한다.
7. 어느 단계에서든 실패하면 세 초기 행의 제거부터 포인터 변경까지 전부 rollback한다. clear()/upsert나 DB 삭제는 없다.
8. commit 후 IdentityContext를 연결하고 12 Store를 재조회·재검증한다. 원본과 portable payload SHA-256이 일치해야 성공이다.
9. 검증 성공 후 앱을 다시 불러온다. 저장 후 검증 실패는 RESTORE_VERIFY_FAILED로 구분하고 중복 import 대신 앱 다시 열기를 제공한다.

물리삭제 예외는 사용자가 명시한 초기 자동생성 세 행의 복원 transaction 내부 교체에만 적용한다. 일반 CRUD 삭제 정책은 기존 soft-delete를 유지한다.

## 화면과 오프라인

설정에 백업 내보내기/백업 복원 버튼을 추가했다. 미리보기에는 생성 시각, 생성 앱/Schema, Profile, 12 Store 건수와 삭제 포함 수, 무결성·호환성, 복원 가능 여부를 표시한다.

파일 검사·생성·복원 중 중복 입력과 라우트 이동·앱 업데이트를 막는다. 진단 재실행으로 화면을 교체하는 경로도 같은 guard를 따른다. 다운로드 요청 뒤 실제 파일 보관 확인을 안내한다. 기능 모듈은 App Shell에 포함되어 오프라인에서도 동작한다.

## 검증과 후속 확장

- Node: Validator 15개 지정 시나리오와 파일 제한·canonical JSON·정보용 버전 호환·고유키 Schema parity·손실/잘못된 행·사진 거절 검사.
- 실제 IndexedDB: BACKUP-EXP-001~012, RESTORE-001~016, stale 미리보기·변경 Seed·동시 복원·snapshot 원자성.
- 실패 주입: Seed 제거 직후, Profile 추가 후, 운동 기록 중간, 체중 추가 후, commit 직전의 전체 rollback.
- 브라우저 화면: 오프라인 실제 JSON 다운로드, pristine 미리보기/복원/reload, non-pristine 미리보기 차단, reload 후 전체 hash 동일.
- 결과와 실기기 미실행 항목은 [REGRESSION_TEST.md](../REGRESSION_TEST.md) 및 tests/results/v0.4.0.json을 따른다. 이전 20개 계획 ID는 실제 BACKUP/RESTORE 테스트로 대체했다.

사진 단계의 Backup v2는 ZIP 안에 manifest.json/data.json/media를 포함하는 방향이며, JSON Backup v1 reader는 유지한다. 이용권·예약은 v0.5.0에서 별도로 구현한다.
