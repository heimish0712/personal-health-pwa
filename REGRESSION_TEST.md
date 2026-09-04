# Regression Test

## v0.1.0

기준: 최초 버전

### 자동 정적 검증

실행 명령:

```bash
node tests/smoke-test.mjs
```

실제 실행 결과: **TOTAL 32 / PASS 32 / FAIL 0**

### 요구사항별 결과

| Test ID | 검증 항목 | 결과 | 검증 방법 |
|---|---|---|---|
| APP-001 | GitHub Pages 접속 | 미검증 | 실제 repository 배포 후 수동 |
| APP-002 | PWA 설치 가능 | 미검증 | 갤럭시 Chrome에서 수동 |
| APP-003 | standalone 실행 | 미검증 | 설치 후 주소창 없는 실행 확인 |
| APP-004 | 오프라인 재실행 | 미검증 | 온라인 1회 실행 후 비행기모드 테스트 |
| NAV-001 | 하단 5탭 구성 | 자동검증 | smoke-test |
| NAV-002 | Hash Router 사용 | 코드검증 | router.js 확인 |
| NAV-003 | 잘못된 라우트 홈 복귀 | 코드검증 | normalizeRoute 확인 |
| NAV-004 | 설정은 헤더 진입 | 코드검증 | index/app 확인 |
| UPD-001 | 강제 업데이트 금지 | 자동검증 | waiting worker 방식 확인 |
| UPD-002 | 사용자 승인 후 업데이트 | 자동검증 | SKIP_WAITING 호출 경로 확인 |
| CACHE-001 | 구 캐시 정리 | 자동검증 | service-worker 정적 검사 |
| CACHE-002 | 사용자 DB 삭제 없음 | 코드검증 | IndexedDB 미구현/캐시만 처리 |
| DATA-001 | 사용자 데이터 저장 없음 | 자동검증 | DB_VERSION=0 |
| DATA-002 | 캐시 정리가 DB에 영향 없음 | 코드검증 | Cache Storage API만 사용 |
| ERROR-001 | 내부 오류 직접 노출 안 함 | 자동검증 | 사용자 메시지 경로 확인 |
| VERSION-001 | 버전 중앙 관리 | 자동검증 | config.js 확인 |

### 운영 환경에서 반드시 확인할 항목

1. GitHub Pages URL 정상 접속
2. 갤럭시 Chrome 설치 메뉴 노출
3. 홈 화면 아이콘 정상 표시
4. standalone 실행
5. 5개 탭 이동
6. 브라우저/앱 뒤로가기 정상
7. 네트워크 OFF 후 재실행
8. 다음 버전 배포 시 업데이트 배너 노출
9. 업데이트 선택 후 새 버전 반영
10. 치명적인 console error 없음
