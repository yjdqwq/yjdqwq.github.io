import { REPOSITORY, MIN_RANK_VOTES, EXPERIENCES, PURPOSES, TAGS, BANDS, signed, bandFor, toneFor, validatePayload, issueLink, summarize } from './lib.mjs';
import { selectCatalogue } from './catalogue.mjs';
import { parseBatchInput, resolveBatch, batchCodesFromURL, batchURL } from './batch.mjs';
const $ = id => document.getElementById(id);
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`problem-notes:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`problem-notes:${key}`, JSON.stringify(value)); return true; } catch { return false; } }
};
const savedFavorites = storage.get('favorites', []);
const state = { data: { problems: [], reviews: [] }, purpose: 'contest', mode: 'library', hidden: storage.get('hide-scores', false) === true,
  favorites: new Set(Array.isArray(savedFavorites) ? savedFavorites : []), current: null, score: null, tags: new Set(), loaded: false, page: 1,
  batchCodes: null, batchRaw: '' };
let toastTimer;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
function readableDate(date) { const d = new Date(date); return Number.isNaN(d.valueOf()) ? '时间未提供' : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); }
function reviewsFor(key) { return state.data.reviews.filter(r => r.key === key && r.purpose === state.purpose && (!$('independentOnly').checked || r.experience === 'independent')); }
function scoreLabel(value) { if (state.hidden) return '已隐藏'; return value === null ? '待评' : signed(value, 1); }
function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
function draftKey() { return `draft:${state.current.key}:${state.purpose}`; }
function batchActive() { return state.batchCodes !== null && state.mode === 'library'; }
function hasDraftInput(p) { return p && (p.score !== null && p.score !== undefined || p.reason?.trim() || p.spoiler?.trim() || p.experience || p.tags?.length); }
function saveBatchState() {
  storage.set('batch-list', { active: state.batchCodes !== null, codes: state.batchCodes || [], raw: state.batchRaw });
  try { history.replaceState(null, '', batchURL(location.href, state.batchCodes)); } catch { /* File previews may not permit history changes. */ }
}
function renderBatchBar(selection) {
  const active = batchActive(); $('batchSummary').hidden = !active;
  $('sort').disabled = active; $('sort').options[0].textContent = active ? '输入顺序' : '建档顺序';
  if (active) {
    $('sort').value = 'catalogue';
    $('startBatch').disabled = !state.loaded || !selection.problems.length;
    $('batchCount').textContent = state.loaded ? `批量清单 · ${selection.problems.length} / ${state.batchCodes.length} 道已找到` : `正在读取 ${state.batchCodes.length} 道题…`;
    $('batchMissing').replaceChildren();
    if (state.loaded && selection.missing.length) {
      $('batchMissing').append(el('span', '', '尚未收录：'));
      for (const code of selection.missing) {
        const b = el('button', 'text-button', `收录 ${code}`); b.type = 'button';
        b.addEventListener('click', () => openAddProblem(code)); $('batchMissing').append(b);
      }
    }
  }
  $('libraryHeading').textContent = state.mode === 'rank' ? '有评价，才有位置' : active ? '按清单逐题评价' : '找到下一道值得讨论的题';
}
function renderBatchNavigation() {
  const selection = batchActive() ? resolveBatch(state.batchCodes, state.data.problems) : { problems: [] };
  const index = selection.problems.findIndex(p => p.key === state.current?.key);
  $('batchNavigation').hidden = index < 0;
  if (index >= 0) {
    $('batchPosition').textContent = `清单第 ${index + 1} / ${selection.problems.length} 题`;
    $('batchPrevious').disabled = index === 0;
    $('batchNext').textContent = index + 1 < selection.problems.length ? '保存草稿并下一题 →' : '保存本题草稿';
  }
}
function saveCurrentBatchDraft() {
  if (!batchActive() || !state.current) return true;
  const payload = currentPayload();
  return !hasDraftInput(payload) || storage.set(draftKey(), payload);
}
function moveBatch(delta) {
  const selection = resolveBatch(state.batchCodes || [], state.data.problems);
  const index = selection.problems.findIndex(p => p.key === state.current?.key);
  if (index < 0) return;
  if (!saveCurrentBatchDraft()) { toast('草稿保存失败，请先保留当前内容再切换。'); return; }
  const next = selection.problems[index + delta];
  if (next) { state.page = Math.floor((index + delta) / Number($('pageSize').value)) + 1; showProblem(next); }
  else toast('已保存本题草稿。公开评分仍需在 GitHub 确认提交。');
  renderTable();
}
function openAddProblem(code = '') {
  $('addForm').reset(); $('addError').hidden = true;
  if (code) $('newUrl').value = `https://www.luogu.com.cn/problem/${code}`;
  openDialog($('addDialog'));
}
function previewBatch() {
  $('batchParseErrors').replaceChildren();
  try {
    const parsed = parseBatchInput($('batchInput').value);
    const resolved = resolveBatch(parsed.codes, state.data.problems);
    $('batchPreview').textContent = parsed.codes.length ? `识别 ${parsed.codes.length} 道 · ${resolved.problems.length} 道已收录${parsed.duplicates ? ` · 去重 ${parsed.duplicates} 项` : ''}` : '粘贴题号或洛谷题目链接后，在这里检查识别结果。';
    for (const e of parsed.errors.slice(0, 8)) $('batchParseErrors').append(el('p', '', `${e.token}：${e.message}`));
    if (parsed.errors.length) $('batchParseErrors').append(el('p', '', '无法识别的项目不会加入清单，请检查后再继续。'));
    $('batchApply').disabled = !parsed.codes.length || !state.loaded;
    return parsed;
  } catch (error) { $('batchPreview').textContent = error.message; $('batchApply').disabled = true; return null; }
}
function openBatchDialog() { $('batchInput').value = state.batchRaw; previewBatch(); openDialog($('batchDialog')); }

function miniature(summary) {
  const chart = el('div', 'mini-chart');
  chart.setAttribute('aria-label', state.hidden ? '评分分布已隐藏' : summary.n ? `${summary.n} 人的完整评分分布，详情可查看` : '暂无评分');
  const max = Math.max(...summary.histogram, 1);
  summary.histogram.forEach((n, i) => {
    const bar = el('i', n && !state.hidden ? `filled ${toneFor(i - 10)}` : '');
    bar.style.height = `${state.hidden || !summary.n ? 2 : Math.max(2, n / max * 22)}px`;
    if (!state.hidden) bar.title = `${signed(i - 10)}：${n} 人`;
    chart.append(bar);
  });
  return chart;
}

function renderTable() {
  const selection = batchActive() ? resolveBatch(state.batchCodes, state.data.problems) : null;
  renderBatchBar(selection);
  const result = selectCatalogue(state.data.problems, state.data.reviews, {
    query: $('search').value, platform: $('platform').value, purpose: state.purpose,
    independentOnly: $('independentOnly').checked, favoritesOnly: $('favoritesOnly').checked,
    favorites: state.favorites, mode: state.mode, sort: $('sort').value, page: state.page, pageSize: $('pageSize').value,
    keys: selection?.keys ?? null
  });
  const { items, total, pages, first, last } = result; state.page = result.page;
  $('problemRows').replaceChildren();
  for (const { p, s } of items) {
    const tr = el('tr');
    const starCell = el('td');
    const star = el('button', `favorite-button ${state.favorites.has(p.key) ? 'is-saved' : ''}`, state.favorites.has(p.key) ? '★' : '☆');
    star.type = 'button'; star.setAttribute('aria-label', `${state.favorites.has(p.key) ? '取消收藏' : '收藏'} ${p.title}`);
    star.setAttribute('aria-pressed', String(state.favorites.has(p.key)));
    star.addEventListener('click', () => { state.favorites.has(p.key) ? state.favorites.delete(p.key) : state.favorites.add(p.key); storage.set('favorites', [...state.favorites]); renderTable(); });
    starCell.append(star);
    const nameCell = el('td');
    const nameButton = el('button', 'problem-title-button');
    nameButton.type = 'button'; nameButton.append(el('span', 'problem-code', p.code), document.createTextNode(p.title));
    nameButton.addEventListener('click', () => showProblem(p));
    const description = el('div', 'problem-description');
    description.append(el('span', `platform-pill ${p.platform.toLowerCase()}`, p.platform), el('span', 'source-text', p.source || '社区收录'));
    if (batchActive() && hasDraftInput(storage.get(`draft:${p.key}:${state.purpose}`, null))) description.append(el('span', 'draft-pill', '本地草稿'));
    nameCell.append(nameButton, description);
    const score = el('td');
    score.append(el('span', !s.n || state.hidden ? 'quality-unrated' : `quality-value ${toneFor(s.mean)}`, scoreLabel(s.mean)));
    const chart = el('td', 'chart-cell'); chart.append(miniature(s));
    const count = el('td', 'vote-count', String(s.n));
    const action = el('td'); const arrow = el('button', 'row-open', '↗'); arrow.type = 'button';
    arrow.setAttribute('aria-label', `查看 ${p.title} 并评分`); arrow.addEventListener('click', () => showProblem(p)); action.append(arrow);
    tr.append(starCell, nameCell, score, chart, count, action); $('problemRows').append(tr);
  }
  $('resultCount').textContent = `${total.toLocaleString('zh-CN')} 道题目 · ${PURPOSES[state.purpose]}${$('independentOnly').checked ? ' · 独立完成者' : ''}`;
  $('pageRange').textContent = total ? `第 ${first}–${last} 道` : '没有匹配题目';
  $('pageNumber').textContent = `${state.page} / ${pages}`;
  $('previousPage').disabled = state.page <= 1;
  $('nextPage').disabled = state.page >= pages;
  $('jumpPage').max = pages; $('jumpPage').value = state.page;
  $('pagination').hidden = total === 0;
  $('tableEmpty').hidden = items.length > 0 || !state.loaded;
  $('tableEmpty').querySelector('h3').textContent = state.mode === 'rank' ? '榜单还在等待第一批评价' : '没有找到匹配的题目';
  $('tableEmpty').querySelector('p').textContent = state.mode === 'rank' ? `同用途下至少 ${MIN_RANK_VOTES} 人评价后进入榜单。先去题库留下第一份判断。` : '试试其他关键词，或收录一道你想讨论的题。';
  $('clearFilters').textContent = state.mode === 'rank' ? '回到题库' : '清除筛选';
  $('problemCount').textContent = state.data.problems.length.toLocaleString('zh-CN');
  $('reviewCount').textContent = state.data.reviews.length;
  const eye = $('hideScores'); eye.textContent = state.hidden ? '◉ 显示评分' : '◉ 隐藏评分'; eye.setAttribute('aria-pressed', String(state.hidden));
}

function renderSources() {
  const container = $('catalogueSources'); container.replaceChildren();
  for (const source of state.data.catalogueSources || []) {
    const row = el('div', 'catalogue-source');
    row.append(el('strong', '', `${source.platform} · ${Number(source.count).toLocaleString('zh-CN')} 道`),
      el('span', '', source.label), el('small', '', source.updatedAt ? `${source.status === 'stale' ? '更新暂缓，保留快照 · ' : ''}${readableDate(source.updatedAt)}` : '暂未成功导入'));
    container.append(row);
  }
  container.append(el('p', '', 'QOJ 目前通过社区收录扩充。题库只索引题号、标题和原题链接；题面请在原 OJ 阅读。'));
}

function renderDistribution(reviews) {
  const s = summarize(reviews);
  $('detailMean').textContent = scoreLabel(s.mean);
  $('detailMean').className = state.hidden || s.mean === null ? 'neutral' : toneFor(s.mean);
  $('detailMedian').textContent = state.hidden ? '已隐藏' : s.median === null ? '—' : signed(s.median, Number.isInteger(s.median) ? 0 : 1);
  $('detailCount').textContent = s.n;
  const container = $('detailHistogram'); container.replaceChildren(); container.classList.toggle('is-hidden', state.hidden);
  if (state.hidden) container.textContent = '评分已隐藏。可以先留下自己的判断。';
  else {
    const max = Math.max(...s.histogram, 1);
    s.histogram.forEach((n, i) => {
      const column = el('div', 'histogram-column'); column.title = `${signed(i - 10)} 分：${n} 人`;
      const bar = el('div', `histogram-bar ${n ? toneFor(i - 10) : ''}`); bar.style.height = `${Math.max(3, n / max * 82)}px`;
      column.append(bar);
      if ([0, 5, 10, 15, 20].includes(i)) column.append(el('span', '', signed(i - 10)));
      container.append(column);
    });
  }
  $('detailSampleNote').textContent = !s.n ? '目前没有有效评价。待评没有默认分数，你可以成为第一位评价者。' : s.n < MIN_RANK_VOTES ? `只有 ${s.n} 位评价者，尚未达到榜单门槛。分数只是当前样本的摘要。` : '均值、中位数和分布描述当前样本，不代表所有选手的共识。';
}

function renderReviews(reviews) {
  $('reviews').replaceChildren(); $('discussionCount').textContent = `${reviews.length} 条`;
  if (!reviews.length) {
    const empty = el('div', 'reviews-empty'); empty.append(el('h3', '', '第一份评价，还留着空位。'), el('p', '', '不用追求“标准答案”。写清你看到了什么、为什么这样打分。')); $('reviews').append(empty); return;
  }
  for (const r of reviews) {
    const article = el('article', 'review-card');
    const head = el('div', 'review-card-head'); const author = el('a', '', r.author); author.href = `https://github.com/${encodeURIComponent(r.author)}`; author.target = '_blank'; author.rel = 'noopener noreferrer';
    head.append(author, el('span', state.hidden ? 'neutral' : toneFor(r.score), state.hidden ? '已隐藏' : signed(r.score)));
    article.append(head, el('p', 'review-card-meta', `${EXPERIENCES[r.experience]} · ${readableDate(r.updatedAt)}`), el('p', '', r.reason));
    if (r.tags?.length) article.append(el('p', 'review-card-meta', r.tags.join(' · ')));
    if (r.spoiler) { const details = el('details'); details.append(el('summary', '', '展开剧透补充'), el('p', '', r.spoiler)); article.append(details); }
    const source = el('a', '', `查看 / 修改原记录 #${r.issue} ↗`); source.href = r.issueUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; article.append(source);
    $('reviews').append(article);
  }
}

function updateScoreSelection() {
  for (const button of $('scoreChooser').children) {
    const selected = Number(button.dataset.score) === state.score && state.score !== null;
    button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  $('selectedScore').replaceChildren();
  if (state.score === null) $('selectedScore').textContent = '请主动选择一个分数；未选择不等于 0。';
  else { const b = bandFor(state.score); $('selectedScore').append(el('strong', toneFor(state.score), signed(state.score)), document.createTextNode(`${b.label} · ${b.text}`)); }
  updateSubmit();
}
function currentPayload() {
  return { schema: 1, type: 'review', problemUrl: state.current.url, problemTitle: state.current.title,
    version: state.current.version, purpose: state.purpose, experience: $('experience').value, score: state.score,
    reason: $('reason').value, spoiler: $('spoiler').value, tags: [...state.tags] };
}
function updateSubmit() {
  if (!state.current) return;
  try { const payload = currentPayload(); validatePayload(payload); $('submitReview').href = issueLink(payload); $('submitReview').setAttribute('aria-disabled', 'false'); }
  catch { $('submitReview').href = '#'; $('submitReview').setAttribute('aria-disabled', 'true'); }
}
function renderTagChoices() {
  $('tagChooser').replaceChildren();
  for (const tag of TAGS) {
    const button = el('button', state.tags.has(tag) ? 'is-selected' : '', tag); button.type = 'button'; button.setAttribute('aria-pressed', String(state.tags.has(tag)));
    button.addEventListener('click', () => { if (state.tags.has(tag)) state.tags.delete(tag); else if (state.tags.size < 4) state.tags.add(tag); else { toast('最多选择四个标签。'); return; } renderTagChoices(); updateSubmit(); });
    $('tagChooser').append(button);
  }
}
function showProblem(problem) {
  state.current = problem; state.score = null; state.tags = new Set();
  $('detailCode').textContent = `${problem.platform} / ${problem.code}`;
  $('detailTitle').textContent = problem.title; $('detailSource').textContent = `${problem.source || '社区收录'}${problem.difficulty ? ` · 平台难度：${problem.difficulty}` : ''}`;
  $('originalLink').href = problem.url; $('detailPurpose').textContent = PURPOSES[state.purpose]; $('formPurpose').textContent = PURPOSES[state.purpose]; $('detailVersion').textContent = problem.version;
  const reviews = reviewsFor(problem.key); renderDistribution(reviews); renderReviews(reviews);
  $('reviewForm').reset(); $('formError').hidden = true;
  const draft = storage.get(draftKey(), null);
  if (draft && typeof draft === 'object') {
    state.score = Number.isInteger(draft.score) && draft.score >= -10 && draft.score <= 10 ? draft.score : null;
    state.tags = new Set(Array.isArray(draft.tags) ? draft.tags.filter(x => TAGS.includes(x)).slice(0, 4) : []);
    $('experience').value = Object.hasOwn(EXPERIENCES, draft.experience) ? draft.experience : '';
    $('reason').value = typeof draft.reason === 'string' ? draft.reason : '';
    $('spoiler').value = typeof draft.spoiler === 'string' ? draft.spoiler : '';
  }
  renderTagChoices(); updateScoreSelection(); renderBatchNavigation(); openDialog($('problemDialog'));
}

async function loadData() {
  $('loadError').hidden = true;
  try {
    const res = window.PROBLEM_NOTES_PREVIEW_DATA ? { ok: true, json: async () => window.PROBLEM_NOTES_PREVIEW_DATA } : await fetch('./data/ratings.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.schema !== 1 || !Array.isArray(data.problems) || !Array.isArray(data.reviews)) throw new Error('数据格式不匹配');
    state.data = data; state.loaded = true; $('updatedAt').textContent = readableDate(data.generatedAt); renderTable(); renderSources();
    if ($('batchDialog').open) previewBatch();
    if ($('problemDialog').open && state.current) { renderDistribution(reviewsFor(state.current.key)); renderReviews(reviewsFor(state.current.key)); }
  } catch (error) {
    $('loadError').hidden = false; $('loadError').querySelector('p').textContent = `题库暂时无法读取（${error.message}）。请重新加载，或通过 HTTP 静态服务器打开网页。`;
    $('resultCount').textContent = state.loaded ? '显示上次成功读取的数据' : '数据读取失败';
  }
}

function changeView() {
  const view = location.hash.slice(1) || 'library';
  state.mode = view === 'rank' ? 'rank' : 'library';
  state.page = 1;
  $('libraryView').hidden = !['library', 'rank'].includes(view);
  $('libraryHero').hidden = view !== 'library'; $('guideView').hidden = view !== 'guide'; $('researchView').hidden = view !== 'research';
  if (!['library', 'rank', 'guide', 'research'].includes(view)) { location.hash = 'library'; return; }
  for (const a of document.querySelectorAll('nav a')) { const active = a.dataset.view === view; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  $('tableKicker').textContent = view === 'rank' ? 'COMMUNITY SHORTLIST' : 'THE PROBLEM INDEX';
  $('libraryHeading').textContent = view === 'rank' ? '有评价，才有位置' : '找到下一道值得讨论的题';
  if (view === 'rank') $('sort').value = 'score-desc';
  renderTable();
}

for (let score = -10; score <= 10; score++) {
  const b = el('button', toneFor(score), signed(score)); b.type = 'button'; b.dataset.score = score; b.setAttribute('aria-label', `${signed(score)} 分，${bandFor(score).label}`); b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => { state.score = score; updateScoreSelection(); }); $('scoreChooser').append(b);
}
for (const band of BANDS) {
  const row = el('div', `band-row ${band.min === 0 ? 'zero-row' : ''}`);
  row.append(el('span', `band-range ${toneFor(band.min)}`, band.min === band.max ? signed(band.min) : `${signed(band.min)}～${signed(band.max)}`), el('strong', '', band.label), el('p', '', band.text)); $('bandsTable').append(row);
}
let searchTimer;
$('search').addEventListener('input', () => { clearTimeout(searchTimer); state.page = 1; searchTimer = setTimeout(renderTable, 120); });
for (const id of ['platform', 'sort', 'independentOnly', 'favoritesOnly', 'pageSize']) $(id).addEventListener('change', () => { state.page = 1; renderTable(); });
for (const [id, delta] of [['previousPage', -1], ['nextPage', 1]]) $(id).addEventListener('click', () => {
  state.page += delta; renderTable(); $('libraryHeading').scrollIntoView({ block: 'start' });
});
$('jumpForm').addEventListener('submit', event => { event.preventDefault(); state.page = Number($('jumpPage').value); renderTable(); $('libraryHeading').scrollIntoView({ block: 'start' }); });
for (const b of document.querySelectorAll('[data-purpose]')) b.addEventListener('click', () => {
  state.purpose = b.dataset.purpose;
  state.page = 1;
  for (const x of document.querySelectorAll('[data-purpose]')) { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); }
  renderTable();
});
$('hideScores').addEventListener('click', () => {
  state.hidden = !state.hidden; storage.set('hide-scores', state.hidden); renderTable();
  if ($('problemDialog').open && state.current) { renderDistribution(reviewsFor(state.current.key)); renderReviews(reviewsFor(state.current.key)); }
});
$('clearFilters').addEventListener('click', () => {
  $('search').value = ''; $('platform').value = ''; $('favoritesOnly').checked = false; $('independentOnly').checked = false;
  state.page = 1;
  if (state.mode === 'rank') location.hash = 'library'; else renderTable();
});
$('heroReview').addEventListener('click', () => { $('search').focus(); $('search').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('搜索你想评价的题目，然后打开详情。'); });
$('addProblem').addEventListener('click', () => openAddProblem());
$('openBatch').addEventListener('click', openBatchDialog); $('editBatch').addEventListener('click', openBatchDialog);
$('batchInput').addEventListener('input', previewBatch);
$('batchForm').addEventListener('submit', event => {
  event.preventDefault(); const parsed = previewBatch(); if (!parsed?.codes.length) return;
  state.batchCodes = parsed.codes; state.batchRaw = $('batchInput').value; state.page = 1;
  $('search').value = ''; $('platform').value = ''; $('favoritesOnly').checked = false; $('sort').value = 'catalogue';
  saveBatchState(); $('batchDialog').close();
  if (state.mode !== 'library') location.hash = 'library'; else renderTable();
  $('libraryHeading').scrollIntoView({ block: 'start' });
});
$('exitBatch').addEventListener('click', () => { state.batchCodes = null; state.page = 1; saveBatchState(); renderTable(); });
$('startBatch').addEventListener('click', () => {
  const first = resolveBatch(state.batchCodes || [], state.data.problems).problems[0]; if (first) showProblem(first); else toast('先收录清单里尚未找到的题目，再刷新数据。');
});
$('batchPrevious').addEventListener('click', () => moveBatch(-1)); $('batchNext').addEventListener('click', () => moveBatch(1));
$('problemDialog').addEventListener('close', () => { if (!saveCurrentBatchDraft()) toast('草稿未能保存，请保留当前内容。'); renderTable(); });
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => $(b.dataset.close).close());
for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } });
for (const id of ['reason', 'spoiler', 'experience']) $(id).addEventListener('input', updateSubmit);
$('saveDraft').addEventListener('click', () => { toast(storage.set(draftKey(), currentPayload()) ? '草稿已保存，仅存在此浏览器，尚未公开提交。' : '浏览器无法保存草稿，可以下载评分数据。'); renderTable(); });
$('downloadReview').addEventListener('click', () => {
  try {
    const p = validatePayload(currentPayload()); const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = `rating-${state.current.code.replace(/[^a-zA-Z0-9-]/g, '')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { $('formError').textContent = error.message; $('formError').hidden = false; }
});
$('submitReview').addEventListener('click', event => {
  try { validatePayload(currentPayload()); storage.set(draftKey(), currentPayload()); $('formError').hidden = true; toast('请在 GitHub 页面确认提交。此处尚未计票。'); }
  catch (error) { event.preventDefault(); $('formError').textContent = error.message; $('formError').hidden = false; }
});
$('reviewForm').addEventListener('submit', e => { e.preventDefault(); $('submitReview').click(); });
$('addForm').addEventListener('submit', event => {
  event.preventDefault();
  try { const p = { schema: 1, type: 'problem', problemUrl: $('newUrl').value, problemTitle: $('newTitle').value, version: $('newVersion').value }; const url = issueLink(p); $('addError').hidden = true; window.open(url, '_blank', 'noopener,noreferrer'); }
  catch (error) { $('addError').textContent = error.message; $('addError').hidden = false; }
});
$('refreshData').addEventListener('click', () => { loadData(); }); $('retryLoad').addEventListener('click', loadData);
document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); if ($('libraryView').hidden) location.hash = 'library'; $('search').focus(); } });
window.addEventListener('hashchange', changeView);
$('previewNotice').hidden = location.hostname === 'yjdqwq.github.io';
try {
  const fromURL = batchCodesFromURL(location.href);
  const saved = storage.get('batch-list', null);
  const parsed = fromURL ?? (saved?.active && Array.isArray(saved.codes) ? parseBatchInput(saved.codes.join(',')) : null);
  if (parsed?.codes.length) { state.batchCodes = parsed.codes; state.batchRaw = fromURL ? parsed.codes.join('\n') : typeof saved?.raw === 'string' ? saved.raw : parsed.codes.join('\n'); }
  else if (typeof saved?.raw === 'string') state.batchRaw = saved.raw;
} catch (error) { toast(error.message); }
changeView(); loadData();

