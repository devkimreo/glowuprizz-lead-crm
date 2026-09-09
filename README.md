# Glowuprizz Lead Magnet CRM

## 실행

Docker Desktop을 먼저 실행해 주세요.

### Windows PowerShell

```powershell
Copy-Item .env.example .env
docker compose up --build
```

### macOS Terminal

```bash
cp .env.example .env
docker compose up --build
```

- 관리자: http://localhost:3000/admin
- API 문서: http://localhost:3000/api/docs
- 초기 계정: `admin@example.com` / `ChangeMe123!`
- 샘플 업로드 파일: `examples/sample-form.html`

초기 계정은 `.env`의 `ADMIN_EMAIL`, `ADMIN_PASSWORD`로 변경할 수 있습니다.

종료(Windows/macOS 공통):

```bash
docker compose down
```

데이터까지 초기화:

```bash
docker compose down -v
```

## 테스트

Windows PowerShell 또는 macOS Terminal에서 다음 명령을 실행합니다.

```bash
docker build --target build -t glowuprizz-test .
docker run --rm glowuprizz-test pnpm test
```

Docker 앱을 실행한 상태에서 Node.js 22 이상과 Chrome으로 전체 브라우저 흐름을 검증하려면:

```bash
pnpm install
pnpm test:e2e
```

브라우저 테스트는 Windows와 macOS의 기본 Google Chrome 설치 위치를 자동으로 사용합니다. Chrome을 다른 위치에 설치했다면 `CHROME_PATH` 환경 변수로 실행 파일 경로를 지정할 수 있습니다.

## 참고 문서

- [자동화 테스트 시나리오](docs/test-scenarios.md)
- [ADR 0001: 단일 Node 애플리케이션과 PostgreSQL](docs/adr/0001-architecture.md)
- [ADR 0002: 업로드 HTML 격리](docs/adr/0002-untrusted-html-isolation.md)
- [ADR 0003: 방문자와 전환율 정의](docs/adr/0003-metrics.md)
- [화면 녹화 안내](docs/demo-video/README.md)
- 실행 중인 API 문서: http://localhost:3000/api/docs
