# Personal Health PWA

개인용 건강 기록 앱의 PWA 기반 프로젝트입니다.

## 현재 버전

- App: v0.1.0
- DB: v0 (사용자 데이터 저장 기능 없음)

## v0.1.0 목적

GitHub Pages에서 설치 가능한 PWA 기반을 검증합니다.

- GitHub Pages 정적 배포
- Web App Manifest
- Service Worker App Shell 캐시
- 오프라인 재실행
- 홈 / 캘린더 / 운동 / 식단 / 체중 5탭
- Hash Router
- 사용자 선택형 앱 업데이트

실제 운동·식단·체중 데이터 저장은 후속 버전에서 구현합니다.

## GitHub Pages 배포

1. 이 프로젝트 전체를 repository 루트에 업로드합니다.
2. GitHub repository의 `Settings > Pages`로 이동합니다.
3. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
4. Branch를 `main`, Folder를 `/(root)`로 지정하고 저장합니다.
5. 배포가 끝난 뒤 표시되는 Pages URL로 접속합니다.

Repository 프로젝트 페이지 형태(`https://<user>.github.io/<repo>/`)를 고려하여 manifest와 Service Worker 경로는 상대경로로 구성했습니다.

## 갤럭시 Chrome 설치

1. GitHub Pages 주소를 Chrome에서 엽니다.
2. Chrome 메뉴에서 `앱 설치` 또는 `홈 화면에 추가`를 선택합니다.
3. 설치 후 홈 화면 아이콘으로 실행합니다.
4. 최초 온라인 실행 후 네트워크를 끄고 다시 실행하여 오프라인 App Shell을 확인합니다.

## 로컬 실행

Service Worker는 `file://`에서 정상 동작하지 않으므로 로컬 HTTP 서버가 필요합니다.

```bash
py -3 -m http.server 8080
```

그 후 `http://localhost:8080/`으로 접속합니다.

## 테스트

Node.js가 설치되어 있다면 프로젝트 루트에서:

```bash
node tests/smoke-test.mjs
```

정적 구성, manifest, 5탭, 캐시/업데이트 기본 정책을 검사합니다.

## 문서

- `REQUIREMENTS.md`: 고정 요구사항과 추적 ID
- `CHANGELOG.md`: 버전별 변경 이력
- `REGRESSION_TEST.md`: 버전별 회귀 검증 결과

## 다음 단계

v0.2.0에서 IndexedDB 스키마, 마이그레이션, Repository 기반을 상세 설계 후 구현합니다.
