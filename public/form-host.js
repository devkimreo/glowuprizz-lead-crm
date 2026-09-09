const script = document.currentScript;
const token = script.dataset.token;
const nonce = script.dataset.nonce;
const bytes = Uint8Array.from(atob(script.dataset.html), character => character.charCodeAt(0));
const rawHtml = new TextDecoder('utf-8').decode(bytes);
let visitorId = localStorage.getItem('glow_visitor_id');
if (!visitorId) {
  visitorId = crypto.randomUUID();
  localStorage.setItem('glow_visitor_id', visitorId);
}

async function initializeForm() {
  const bridgeResponse = await fetch('/assets/form-bridge.js?v=1');
  if (!bridgeResponse.ok) throw new Error('폼 제출 모듈을 불러오지 못했습니다.');
  const bridgeSource = (await bridgeResponse.text()).replace(/<\/script/gi, '<\\/script');
  const bridge = `<script nonce="${nonce}">${bridgeSource}<\/script>`;
  const srcdoc = rawHtml.match(/<\/body>/i)
    ? rawHtml.replace(/<\/body>/i, bridge + '</body>')
    : rawHtml + bridge;
  document.querySelector('#form').srcdoc = srcdoc;

  fetch(`/api/public/${token}/visit`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({visitorId}),
  }).catch(() => {});
}

window.addEventListener('message', async event => {
  const frame = document.querySelector('#form');
  if (event.source !== frame.contentWindow || event.data?.type !== 'glow-submit') return;
  const status = document.querySelector('#status');
  status.textContent = '신청을 접수하고 있습니다…';
  try {
    const response = await fetch(`/api/public/${token}/submissions`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({visitorId, data: event.data.data}),
    });
    const result = await response.json();
    const message = response.ok ? result.message : (result.error || '신청을 접수하지 못했습니다.');
    status.textContent = message;
    frame.contentWindow.postMessage({type: 'glow-result', ok: response.ok, message}, '*');
  } catch {
    const message = '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    status.textContent = message;
    frame.contentWindow.postMessage({type: 'glow-result', ok: false, message}, '*');
  }
});

initializeForm().catch(() => {
  document.querySelector('#status').textContent = '폼을 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
});
