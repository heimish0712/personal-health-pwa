# Requirements

이 문서는 구현 중 임의 회귀를 방지하기 위한 요구사항 기준선입니다.

## Application

- **APP-001** 앱은 GitHub Pages에서 실행 가능해야 한다.
- **APP-002** 앱은 지원 브라우저에서 PWA로 설치 가능해야 한다.
- **APP-003** 설치된 앱은 `standalone` 모드로 실행되어야 한다.
- **APP-004** 최초 온라인 로딩 이후 App Shell은 오프라인에서 다시 열 수 있어야 한다.

## Navigation

- **NAV-001** 하단 탭은 `홈 / 캘린더 / 운동 / 식단 / 체중` 5개로 고정한다.
- **NAV-002** GitHub Pages 404 회피를 위해 Hash Router를 사용한다.
- **NAV-003** 알 수 없는 라우트는 `/home`으로 정규화한다.
- **NAV-004** 설정은 하단 독립 탭으로 추가하지 않고 헤더에서 진입한다.

## Update / Cache

- **UPD-001** 새 Service Worker 발견 시 앱을 강제 새로고침하지 않는다.
- **UPD-002** 사용자가 `업데이트`를 선택한 뒤에만 대기 중 Service Worker를 활성화한다.
- **CACHE-001** 새 캐시 활성화 시 현재 캐시 버전이 아닌 구 App Shell 캐시를 제거한다.
- **CACHE-002** Service Worker 캐시 정책과 향후 사용자 IndexedDB 데이터는 분리한다.

## Data

- **DATA-001** v0.1.0에서는 사용자 건강 데이터를 저장하지 않는다.
- **DATA-002** 앱 업데이트/캐시 정리 코드가 향후 사용자 DB를 삭제하는 구조가 되어서는 안 된다.

## Error Handling

- **ERROR-001** 내부 브라우저/DB 오류 문자열을 사용자에게 그대로 노출하지 않는다.

## Version

- **VERSION-001** 앱 버전, 캐시 버전, DB 버전은 `js/config.js`에서 중앙 관리한다.
