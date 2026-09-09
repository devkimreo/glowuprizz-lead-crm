(function () {
  let activeForm = null;
  let submitButton = null;
  let originalLabel = '';

  function setButtonLabel(label) {
    if (!submitButton) return;
    if (submitButton.tagName === 'INPUT') submitButton.value = label;
    else submitButton.textContent = label;
  }

  function showMessage(message, ok) {
    if (!activeForm) return;
    let box = activeForm.querySelector('[data-glow-result]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-glow-result', '');
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.style.cssText = 'margin-top:12px;padding:14px 16px;border-radius:10px;font:600 14px/1.5 system-ui,sans-serif;text-align:center;';
      activeForm.appendChild(box);
    }
    box.textContent = message;
    box.style.background = ok ? '#e2f5e9' : '#fde8e8';
    box.style.color = ok ? '#11633f' : '#9f2f2f';
  }

  document.addEventListener('submit', function (event) {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.glowSubmitting === 'true') return;
    activeForm = form;
    form.dataset.glowSubmitting = 'true';
    submitButton = form.querySelector('button[type="submit"],input[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      originalLabel = submitButton.tagName === 'INPUT' ? submitButton.value : submitButton.textContent;
      setButtonLabel('신청 중…');
    }
    showMessage('신청 정보를 전송하고 있습니다…', true);
    const data = {};
    new FormData(form).forEach(function (value, key) {
      if (data[key] !== undefined) data[key] = Array.isArray(data[key]) ? data[key].concat(value) : [data[key], value];
      else data[key] = value;
    });
    parent.postMessage({ type: 'glow-submit', data }, '*');
  });

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'glow-result' || !activeForm) return;
    delete activeForm.dataset.glowSubmitting;
    showMessage(event.data.message, event.data.ok);
    if (event.data.ok) {
      activeForm.reset();
      setButtonLabel('신청 완료 ✓');
    } else if (submitButton) {
      submitButton.disabled = false;
      setButtonLabel(originalLabel);
    }
  });
})();
