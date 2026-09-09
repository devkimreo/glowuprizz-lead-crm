const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let campaigns = [];
let forms = [];
const PAGE_SIZE = 6;

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(body.error || '요청에 실패했습니다.');
  }
  return body;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 2400);
}

function setSubmitting(form, submitting, pendingLabel) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (submitting) {
    button.dataset.label = button.textContent;
    button.textContent = pendingLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function showLogin() {
  $('#login').hidden = false;
  $('#app').hidden = true;
}

async function boot() {
  try {
    const me = await api('/api/me');
    $('#operator-email').textContent = me.email;
    $('#login').hidden = true;
    $('#app').hidden = false;
    await refreshData();
    await renderRoute();
  } catch {
    showLogin();
  }
}

async function refreshData() {
  [forms, campaigns] = await Promise.all([api('/api/forms'), api('/api/campaigns')]);
  renderFormOptions();
  renderDashboard();
  renderCampaignSelectors();
}

function currentRoute() {
  const path = location.pathname.replace(/\/+$/, '') || '/admin';
  if (path === '/admin') return { view: 'dashboard', path: '/admin/dashboard' };
  const detail = path.match(/^\/admin\/campaigns\/([0-9a-f-]+)\/analytics$/i);
  if (detail) return { view: 'analytics', campaignId: detail[1], path };
  if (path === '/admin/forms/new') return { view: 'form-create', path };
  if (path === '/admin/campaigns/new') return { view: 'campaign-create', path };
  const view = path.split('/')[2];
  return { view: ['dashboard', 'forms', 'campaigns', 'leads'].includes(view) ? view : 'dashboard', path };
}

async function renderRoute() {
  const route = currentRoute();
  if (location.pathname === '/admin' || route.path !== location.pathname) {
    history.replaceState({}, '', route.path);
  }
  $$('.view').forEach(view => { view.hidden = view.id !== `${route.view}-view`; });
  $$('.nav-item').forEach(item => {
    const section = route.view === 'form-create' ? 'forms'
      : route.view === 'campaign-create' ? 'campaigns'
      : route.view === 'analytics' ? 'dashboard' : route.view;
    const active = item.getAttribute('href') === `/admin/${section}`;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  const titles = {
    dashboard: ['성과 대시보드', 'LEAD MAGNET OPERATIONS'],
    forms: ['폼 관리', 'FORM LIBRARY'],
    campaigns: ['캠페인 관리', 'CAMPAIGN OPERATIONS'],
    'form-create': ['새 폼 등록', 'FORM LIBRARY'],
    'campaign-create': ['새 캠페인', 'CAMPAIGN OPERATIONS'],
    leads: ['신청자 CRM', 'LEAD DATABASE'],
    analytics: ['캠페인 상세 성과', 'CAMPAIGN ANALYTICS'],
  };
  $('#view-title').textContent = titles[route.view][0];
  $('#view-eyebrow').textContent = titles[route.view][1];
  document.title = `${titles[route.view][0]} · Glowuprizz CRM`;
  if (route.view === 'analytics') await renderAnalytics(route.campaignId);
  if (route.view === 'forms') renderFormsPage();
  if (route.view === 'campaigns') renderCampaignsPage();
}

function navigate(path) {
  if (`${location.pathname}${location.search}` === path) return;
  history.pushState({}, '', path);
  renderRoute().catch(error => toast(error.message));
}

document.addEventListener('click', event => {
  const link = event.target.closest('[data-route]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(link.getAttribute('href'));
});
window.addEventListener('popstate', () => renderRoute().catch(error => toast(error.message)));

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('#login-error').textContent = '';
  const form = event.currentTarget;
  setSubmitting(form, true, '로그인 중…');
  const data = Object.fromEntries(new FormData(form));
  try {
    await api('/api/auth/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(data)});
    await boot();
  } catch (error) {
    $('#login-error').textContent = error.message;
  } finally {
    setSubmitting(form, false);
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/auth/logout', {method: 'POST'});
  history.replaceState({}, '', '/admin');
  showLogin();
});

function renderDashboard() {
  const totals = campaigns.reduce((sum, campaign) => ({
    visits: sum.visits + Number(campaign.visits),
    visitors: sum.visitors + Number(campaign.visitors),
    submissions: sum.submissions + Number(campaign.submissions),
  }), {visits: 0, visitors: 0, submissions: 0});
  const conversion = totals.visitors ? (totals.submissions / totals.visitors * 100).toFixed(1) : '0.0';
  $('#metric-cards').innerHTML = [
    ['전체 방문', totals.visits],
    ['순 방문자', totals.visitors],
    ['신청', totals.submissions],
    ['전환율', `${conversion}%`],
  ].map(([label, value]) => `<article class="panel metric"><span>${label}</span><strong>${value}</strong></article>`).join('');

  $('#campaign-empty').hidden = campaigns.length > 0;
  $('#campaign-table').innerHTML = campaigns.map(campaign => `
    <tr>
      <td><strong>${escapeHtml(campaign.name)}</strong><small>${campaign.status}</small></td>
      <td>${escapeHtml(campaign.form_name)}</td><td>${campaign.visits}</td><td>${campaign.visitors}</td>
      <td>${campaign.submissions}</td><td class="rate">${campaign.conversionRate}%</td>
      <td><a class="text-button" href="/admin/campaigns/${campaign.id}/analytics" data-route>상세 보기</a></td>
    </tr>`).join('');
}

function renderFormOptions() {
  $('#form-select').innerHTML = forms.length
    ? '<option value="">폼 선택</option>' + forms.map(form => `<option value="${form.id}">${escapeHtml(form.name)}</option>`).join('')
    : '<option value="">폼을 먼저 등록하세요</option>';
}

function listState() {
  const params = new URLSearchParams(location.search);
  return {q: (params.get('q') || '').trim(), page: Math.max(1, Number(params.get('page')) || 1)};
}

function listUrl(path, q, page) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  return `${path}${params.size ? `?${params}` : ''}`;
}

function renderPagination(target, path, q, page, totalPages) {
  const links = [];
  if (page > 1) links.push(`<a href="${listUrl(path, q, page - 1)}" data-route aria-label="이전 페이지">이전</a>`);
  for (let number = 1; number <= totalPages; number += 1) {
    links.push(`<a href="${listUrl(path, q, number)}" data-route class="${number === page ? 'active' : ''}" ${number === page ? 'aria-current="page"' : ''}>${number}</a>`);
  }
  if (page < totalPages) links.push(`<a href="${listUrl(path, q, page + 1)}" data-route aria-label="다음 페이지">다음</a>`);
  $(target).innerHTML = totalPages > 1 ? links.join('') : '';
}

function renderFormsPage() {
  const {q, page: requestedPage} = listState();
  $('#form-query').value = q;
  $('#form-search .search-reset').hidden = !q;
  const filtered = forms.filter(form => `${form.name} ${form.filename}`.toLowerCase().includes(q.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) history.replaceState({}, '', listUrl('/admin/forms', q, page));
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  $('#form-count').textContent = q ? `“${q}” 검색 결과 ${filtered.length}개` : `전체 ${forms.length}개 폼`;
  $('#form-list').innerHTML = items.length ? items.map(form => `
    <article class="record-item">
      <div><strong>${escapeHtml(form.name)}</strong><span>${escapeHtml(form.filename)}</span></div>
      <time>${new Date(form.created_at).toLocaleDateString('ko-KR')}</time>
    </article>`).join('') : `<div class="empty">${q ? '검색 결과가 없습니다.' : '등록된 폼이 없습니다.'}</div>`;
  renderPagination('#form-pagination', '/admin/forms', q, page, totalPages);
}

function renderCampaignsPage() {
  const {q, page: requestedPage} = listState();
  $('#campaign-query').value = q;
  $('#campaign-search .search-reset').hidden = !q;
  const filtered = campaigns.filter(campaign => `${campaign.name} ${campaign.form_name}`.toLowerCase().includes(q.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) history.replaceState({}, '', listUrl('/admin/campaigns', q, page));
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  $('#campaign-count').textContent = q ? `“${q}” 검색 결과 ${filtered.length}개` : `전체 ${campaigns.length}개 캠페인`;
  $('#campaign-list').innerHTML = items.length ? items.map(campaign => `
    <article class="campaign-item clickable-card" data-card-route="/admin/campaigns/${campaign.id}/analytics" tabindex="0" role="link" aria-label="${escapeHtml(campaign.name)} 성과 상세 보기">
      <div class="campaign-head">
        <div><a class="campaign-title" href="/admin/campaigns/${campaign.id}/analytics" data-route>${escapeHtml(campaign.name)}</a><div>${escapeHtml(campaign.form_name)}</div></div>
        <span class="status">운영 중</span>
      </div>
      <div class="campaign-actions"><a href="/admin/campaigns/${campaign.id}/analytics" data-route>성과 상세</a></div>
      <div class="links">${['instagram', 'x', 'youtube', 'threads'].map(channel =>
        `<button class="link-button" data-link="${campaign.id}" data-channel="${channel}">${channel} 링크 만들기</button>`
      ).join('')}</div>
    </article>`).join('') : `<div class="empty">${q ? '검색 결과가 없습니다.' : '등록된 캠페인이 없습니다.'}</div>`;
  $$('[data-link]').forEach(button => button.addEventListener('click', () => createLink(button)));
  $$('[data-card-route]').forEach(card => {
    card.addEventListener('click', event => {
      if (!event.target.closest('a, button, input, select')) navigate(card.dataset.cardRoute);
    });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigate(card.dataset.cardRoute);
      }
    });
  });
  renderPagination('#campaign-pagination', '/admin/campaigns', q, page, totalPages);
}

function renderCampaignSelectors() {
  const current = $('#lead-campaign').value;
  $('#lead-campaign').innerHTML = '<option value="">캠페인 선택</option>' +
    campaigns.map(campaign => `<option value="${campaign.id}">${escapeHtml(campaign.name)}</option>`).join('');
  if (campaigns.some(campaign => campaign.id === current)) $('#lead-campaign').value = current;
}

$('#form-search').addEventListener('submit', event => {
  event.preventDefault();
  const query = new FormData(event.currentTarget).get('q').trim();
  navigate(listUrl('/admin/forms', query, 1));
});

$('#campaign-search').addEventListener('submit', event => {
  event.preventDefault();
  const query = new FormData(event.currentTarget).get('q').trim();
  navigate(listUrl('/admin/campaigns', query, 1));
});

$('#upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  setSubmitting(form, true, '등록 중…');
  try {
    await api('/api/forms', {method: 'POST', body: new FormData(form)});
    form.reset();
    toast('HTML 폼을 등록했습니다.');
    await refreshData();
    navigate('/admin/forms');
  } catch (error) {
    toast(error.message);
  } finally {
    setSubmitting(form, false);
  }
});

$('#campaign-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  setSubmitting(form, true, '생성 중…');
  try {
    await api('/api/campaigns', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(data)});
    form.reset();
    toast('캠페인을 생성했습니다.');
    await refreshData();
    navigate('/admin/campaigns');
  } catch (error) {
    toast(error.message);
  } finally {
    setSubmitting(form, false);
  }
});

async function createLink(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '생성 중…';
  try {
    const link = await api(`/api/campaigns/${button.dataset.link}/links`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({channel: button.dataset.channel}),
    });
    await navigator.clipboard.writeText(link.url);
    button.textContent = '링크 복사됨 ✓';
    toast(`${button.dataset.channel} 배포 링크를 복사했습니다.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    toast(error.message);
  }
}

$('#lead-campaign').addEventListener('change', async event => {
  const campaignId = event.target.value;
  if (!campaignId) {
    $('#lead-table').innerHTML = '';
    $('#lead-empty').hidden = false;
    $('#lead-empty').textContent = '캠페인을 선택하세요.';
    return;
  }
  try {
    const leads = await api(`/api/campaigns/${campaignId}/submissions`);
    $('#lead-empty').hidden = leads.length > 0;
    $('#lead-empty').textContent = '아직 신청자가 없습니다.';
    $('#lead-table').innerHTML = leads.map(lead => `
      <tr><td>${new Date(lead.created_at).toLocaleString('ko-KR')}</td><td>${lead.channel}</td>
      <td>${Object.entries(lead.data).map(([key, value]) => `<strong>${escapeHtml(key)}</strong>: ${escapeHtml(String(value))}`).join(' · ')}</td></tr>`).join('');
  } catch (error) {
    toast(error.message);
  }
});

async function renderAnalytics(campaignId) {
  const campaign = campaigns.find(item => item.id === campaignId);
  if (!campaign) {
    toast('캠페인을 찾을 수 없습니다.');
    navigate('/admin/dashboard');
    return;
  }
  $('#view-title').textContent = campaign.name;
  document.title = `${campaign.name} 성과 · Glowuprizz CRM`;
  const data = await api(`/api/campaigns/${campaignId}/analytics`);
  const total = data.total;
  $('#analytics-metrics').innerHTML = [
    ['전체 방문', total.visits],
    ['순 방문자', total.visitors],
    ['신청', total.submissions],
    ['전환율', `${total.conversionRate}%`],
  ].map(([label, value]) => `<article class="panel metric"><span>${label}</span><strong>${value}</strong></article>`).join('');

  const visitorWidth = total.visitors ? 100 : 0;
  const submissionWidth = total.visitors ? Math.min(100, total.submissions / total.visitors * 100) : 0;
  $('#funnel-chart').innerHTML = `
    <div class="funnel-row"><div><span>순 방문자</span><strong>${total.visitors}</strong></div><div class="funnel-track"><i style="width:${visitorWidth}%"></i></div></div>
    <div class="funnel-row"><div><span>신청 완료</span><strong>${total.submissions}</strong></div><div class="funnel-track"><i class="conversion" style="width:${submissionWidth}%"></i></div></div>
    <p class="chart-note">순 방문자 100명 중 <strong>${total.conversionRate}명</strong>이 신청한 비율입니다.</p>`;

  const maximum = Math.max(1, ...data.channels.flatMap(channel => [Number(channel.visitors), Number(channel.submissions)]));
  $('#channel-chart').innerHTML = data.channels.length ? data.channels.map(channel => `
    <div class="bar-row" aria-label="${channel.channel}: 순 방문자 ${channel.visitors}명, 신청 ${channel.submissions}건">
      <strong>${channel.channel}</strong>
      <div class="bar-pair">
        <div><i class="visitors" style="width:${Number(channel.visitors) / maximum * 100}%"></i><span>${channel.visitors}</span></div>
        <div><i class="submissions" style="width:${Number(channel.submissions) / maximum * 100}%"></i><span>${channel.submissions}</span></div>
      </div>
    </div>`).join('') : '<div class="empty">채널 링크를 만들면 비교 차트가 표시됩니다.</div>';

  $('#analytics-empty').hidden = data.channels.length > 0;
  $('#channel-table').innerHTML = data.channels.map(channel => `
    <tr><td><strong class="channel-name">${channel.channel}</strong></td><td>${channel.visits}</td>
    <td>${channel.visitors}</td><td>${channel.submissions}</td><td class="rate">${channel.conversionRate}%</td></tr>`).join('');
}

boot();
