import { createRequire } from 'node:module';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outputDir = join(root, 'docs', 'demo-video');
const finalVideo = join(outputDir, 'glowuprizz-crm-demo.webm');
const defaultChrome = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const chrome = process.env.CHROME_PATH || defaultChrome;
const baseUrl = process.env.DEMO_BASE_URL || 'http://localhost:3000';
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chrome });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: outputDir, size: { width: 1280, height: 800 } },
  permissions: ['clipboard-read', 'clipboard-write'],
  colorScheme: 'light',
});
const page = await context.newPage();
const video = page.video();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const formName = `브랜드 성장 진단 ${stamp}`;
const campaignName = `크리에이터 성장 캠페인 ${stamp}`;

try {
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await pause(1200);
  await page.getByLabel('이메일').fill('admin@example.com');
  await page.getByLabel('비밀번호').fill('ChangeMe123!');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByRole('heading', { name: '성과 대시보드' }).waitFor();
  await pause(1400);

  await page.getByRole('link', { name: '폼 관리' }).click();
  await pause(900);
  await page.getByRole('link', { name: '새 폼 등록' }).click();
  await page.getByLabel('폼 이름').fill(formName);
  await page.getByLabel('HTML 파일').setInputFiles(join(root, 'examples', 'sample-form.html'));
  await pause(800);
  await page.getByRole('button', { name: '폼 등록' }).click();
  await page.locator('#form-list').getByText(formName, { exact: true }).waitFor();
  await pause(1300);

  await page.getByRole('link', { name: '캠페인 관리' }).click();
  await page.getByRole('link', { name: '새 캠페인' }).click();
  await page.getByLabel('캠페인 이름').fill(campaignName);
  await page.getByLabel('사용할 폼').selectOption({ label: formName });
  await pause(800);
  await page.getByRole('button', { name: '캠페인 생성' }).click();
  const campaignCard = page.getByRole('link', { name: `${campaignName} 성과 상세 보기` });
  await campaignCard.waitFor();
  await pause(1200);

  const instagramButton = campaignCard.getByRole('button', { name: 'Instagram 링크 만들기' });
  await instagramButton.click();
  await page.getByText('링크 복사됨 ✓').waitFor();
  const publicUrl = await page.evaluate(() => navigator.clipboard.readText());
  await pause(900);

  await page.goto(publicUrl, { waitUntil: 'networkidle' });
  await pause(1200);
  const form = page.frameLocator('#form');
  await form.getByLabel('이름').fill('김글로우');
  await form.getByLabel('이메일').fill('demo@glowuprizz.com');
  await form.getByLabel('관심 분야').selectOption({ label: '콘텐츠' });
  await pause(800);
  await form.getByRole('button', { name: '무료로 신청하기' }).click();
  await page.getByText('신청이 완료되었습니다.').waitFor();
  await pause(1600);

  await page.goto(`${baseUrl}/admin/campaigns`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: campaignName, exact: true }).click();
  await page.getByRole('heading', { name: campaignName }).waitFor();
  await pause(2200);
} finally {
  await context.close();
  await browser.close();
}

const recordedVideo = await video.path();
await rm(finalVideo, { force: true });
if (resolve(recordedVideo) !== resolve(finalVideo)) await rename(recordedVideo, finalVideo);
console.log(finalVideo);
