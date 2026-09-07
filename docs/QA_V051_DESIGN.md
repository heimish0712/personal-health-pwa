# v0.5.1 QA 패치 설계

## 기존 구조 문제와 수정

- 캘린더가 예약과 기록을 단순 결합해 완료 1건이 두 행으로 표시되었다. Calendar projection에만 연결 해석을 추가했다. 완료 일자는 실제 운동일을 사용하며 기존 날짜/연결 index로 월 경계를 넘는 관계를 찾아온다.
- 운동 전환은 동적 필드를 빈 값으로 렌더링했다. compatibleDraft로 동일 key/type 전달, 삭제/타입 불일치 제거, 비동기 응답 순서를 보호한다. 공통 필드 DOM을 교체하지 않는다.
- 이용권 버튼이 사용이력 유무로 삭제/비활성을 결정했다. 상태 변경 전용 Service 호출로 바꾸고 기존 Command의 revision/원장 보존을 유지한다.
- 복원 대상 fingerprint가 non-pristine에서 null이었다. 명시적 replace를 안전하게 지원하려고 전체 portable 원본과 pointer 값, device 정보를 포함하도록 바꿨다. pointer updated_at은 앱 재부팅만으로 바뀌므로 제외한다.
- 기존 anchor 다운로드는 브라우저의 실제 디스크 저장 완료를 알 수 없다. 다운로드 호출만으로 초기화하지 않고 저장 파일을 다시 선택해 기존 validator 및 생성 hash와 비교한다. 파일 미확인/불일치/백업 생성 실패 시 destructive Command 호출 없음.

## Reset / Replace

기존 BackupRestoreCommandContract에 reset 추가, restore에 명시 mode=pristine/replace 추가. Service의 일반 restorePreview는 강제 mode를 받지 않는다. 별도 prepareReplacement/confirmReplacement가 검증·백업 확인·경고 UX를 연결한다.

두 작업 모두 12 portable Store + device_settings 하나의 readwrite transaction. 교체는 clearPortable → 원본 add → current_profile_id 변경. 초기화는 clearPortable → 기본 Profile/Pilates/Template 생성 → pointer 변경 → pristine 검사. deleteDatabase 사용 없음. device_settings 전체 clear 금지, pointer 이외 모든 기기 설정과 app_logs 유지.

기존 pristine restore의 초기 3행만 교체하는 코드 경로는 유지한다. 초기화/강제 교체의 clear는 사용자 명시 요청에 따른 전용 Command 예외이며 Repository의 일반 create/update/clear API는 사용하지 않는다.

검증된 파일은 Service에 보관한다. checksum/schema/reference/unique를 실행 직전에 다시 확인하고, 대상 fingerprint가 준비 이후 바뀌면 transaction에서 거절한다. 강제 복원 commit 이후 전체 canonical snapshot hash를 다시 비교한다. reset은 transaction 안에서 정상 Seed 상태를 검사한다.

Backup v1은 현재 Profile 하나만 저장한다. 여러 Profile이 있을 때 전체 삭제 전 백업을 하나로 충분하다고 주장하지 않도록 backupFirst는 차단한다. 백업 없이 교체는 모든 Profile의 portable 데이터 삭제를 명확히 알린다.

## 유지 사항

App/cache만 0.5.1. DB1 / Schema1 / Seed1 / Backup1, Store/Index/Migration 변화 없음. 기존 운동/예약의 Semantic Command와 one-active-usage 규칙 유지. 월간 조회만 해당 기간 데이터를 읽으며 범용 BaseScopedRepository 전면 수정 없음.
