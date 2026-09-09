# ADR 0002: 업로드 HTML을 sandbox iframe으로 격리

- 상태: 승인
- 날짜: 2026-09-09

## 결정

업로드 HTML은 직접 같은 문서에서 실행하지 않는다. 공개 호스트 페이지가 `sandbox="allow-scripts allow-forms"` iframe의 `srcdoc`으로 렌더링하고, 제출 데이터만 `postMessage`로 받는다. `allow-same-origin`은 부여하지 않는다. CSP는 요청마다 생성한 nonce를 사용해 서버가 제공하는 제출 브리지 코드만 실행하고, 업로드 HTML의 임의 인라인 스크립트는 차단한다.

## 이유

불투명 오리진에서 실행되는 HTML은 관리자 쿠키나 같은 오리진 관리자 API 응답을 읽을 수 없다. nonce 기반 브리지는 일반적인 HTML `form` 제출을 CRM 공개 API에 연결하면서도 업로드된 코드에 추가 권한을 부여하지 않는다.

## 결과

업로드 HTML 내부 제출은 브리지 스크립트가 가로채며, 제출 중에는 버튼을 비활성화하고 성공·실패 결과를 iframe 안에 표시한다. 따라서 일반적인 `form` 요소가 필요하다. 외부 이미지·폰트는 iframe CSP 정책을 추가할 때 별도 허용 목록이 필요하다.
