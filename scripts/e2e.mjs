import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.DEMO_BASE_URL || 'http://localhost:3000';
const defaultChrome = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = process.env.CHROME_PATH || defaultChrome;
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const stamp = Date.now();
const formName = `E2E 폼 ${stamp}`;
const campaignName = `E2E 캠페인 ${stamp}`;

try {
  await page.goto(`${baseUrl}/admin`);
  await page.getByLabel('이메일').fill('admin@example.com');
  await page.getByLabel('비밀번호').fill('ChangeMe123!');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByRole('heading', { name: '성과 대시보드' }).waitFor();

  await page.getByRole('link', { name: '폼 관리' }).click();
  await page.getByRole('link', { name: '새 폼 등록' }).click();
  await page.getByLabel('폼 이름').fill(formName);
  await page.getByLabel('HTML 파일').setInputFiles(join(root, 'examples', 'sample-form.html'));
  await page.getByRole('button', { name: '폼 등록' }).click();
  await page.locator('#form-list').getByText(formName, { exact: true }).waitFor();

  await page.getByRole('link', { name: '캠페인 관리' }).click();
  await page.getByRole('link', { name: '새 캠페인' }).click();
  await page.getByLabel('캠페인 이름').fill(campaignName);
  await page.getByLabel('사용할 폼').selectOption({ label: formName });
  await page.getByRole('button', { name: '캠페인 생성' }).click();

  const card = page.getByRole('link', { name: `${campaignName} 성과 상세 보기` });
  await card.getByRole('button', { name: 'Instagram 링크 만들기' }).click();
  await page.getByText('링크 복사됨 ✓').waitFor();
  const publicUrl = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(publicUrl);

  const frame = page.frameLocator('#form');
  await frame.getByLabel('이름').fill('테스트 신청자');
  await frame.getByLabel('이메일').fill('e2e@example.com');
  await frame.getByRole('button', { name: '무료로 신청하기' }).click();
  await page.getByText('신청이 완료되었습니다.').waitFor();

  const cookieAccess = await frame.locator('body').evaluate(() => {
    try { return document.cookie; } catch { return 'blocked'; }
  });
  assert.equal(cookieAccess, 'blocked', 'sandboxed upload must not read cookies');

  await page.goto(`${baseUrl}/admin/campaigns`);
  await page.getByRole('link', { name: campaignName, exact: true }).click();
  await page.getByRole('heading', { name: campaignName }).waitFor();
  await page.locator('#analytics-view').getByText('100%', { exact: true }).first().waitFor();
  console.log('E2E success: login → upload → campaign → submission → analytics; iframe cookie access blocked');
} finally {
  await context.close();
  await browser.close();
}
