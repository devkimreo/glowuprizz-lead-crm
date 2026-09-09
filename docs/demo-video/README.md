# 화면 녹화

`glowuprizz-crm-demo.webm`은 Docker로 실행한 실제 애플리케이션을 대상으로 녹화한 영상입니다.

영상 흐름:

1. 관리자 로그인
2. HTML 폼 등록
3. 캠페인 생성
4. Instagram 공개 링크 생성
5. 공개 폼 작성 및 신청 완료
6. 캠페인 성과 상세 화면 확인

같은 시나리오는 `scripts/record-demo.mjs`로 다시 녹화할 수 있습니다. 실행 전에 애플리케이션이 `http://localhost:3000`에서 실행 중이어야 하며 Playwright와 Chrome이 필요합니다.
