import { MIN_RANK_VOTES, EXPERIENCES, PURPOSES, TAGS, BANDS, signed, bandFor, toneFor, validatePayload, prepareSubmissions, summarize } from './lib.mjs';
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
  batchCodes: null, batchRaw: '', batchExperience: storage.get('batch-experience', ''), currentPurpose: 'contest' };
let toastTimer, draftTimer;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
function readableDate(date) { const d = new Date(date); return Number.isNaN(d.valueOf()) ? '时间未提供' : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); }
function reviewsFor(key) { return state.data.reviews.filter(r => r.key === key && r.purpose === state.purpose && (!$('independentOnly').checked || r.experience === 'independent')); }
function scoreLabel(value) { if (state.hidden) return '已隐藏'; return value === null ? '待评' : signed(value, 1); }
function aiAnchorFor(key) { return state.purpose === 'contest' ? state.aiByKey?.get(key) : null; }
function renderAIAnchorDetail() {
  const section = $('detailAIAnchor'); const anchor = aiAnchorFor(state.current?.key);
  section.replaceChildren(); section.hidden = !anchor;
  if (!anchor) return;
  section.append(el('strong', '', state.hidden ? 'AI 参考分数已隐藏' : `AI 参考 ${signed(anchor.score)} · 题面初评`));
  section.append(el('p', '', `与真人评分分开，不计入均分、人数或榜单。${anchor.confidence === 'low' ? '完整解法尚待复核。' : '主要结构判断较明确。'}未逐题实现或实测。`));
  if (!state.hidden) {
    const details = el('details'); details.append(el('summary', '', '查看 AI 理由（可能剧透）'), el('p', '', anchor.reason)); section.append(details);
  }
  const link = el('a', 'inline-link', '查看整套 AI 参考与复核说明 ↗'); link.href = `./ai-anchors.html#${anchor.code}`; section.append(link);
}
function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
function draftKey(problem = state.current, purpose = state.currentPurpose) { return `draft:${problem.key}:${purpose}`; }
function batchActive() { return state.batchCodes !== null && state.mode === 'library'; }
function hasDraftInput(p) { return p && (p.score !== null && p.score !== undefined || p.reason?.trim() || p.spoiler?.trim() || p.experience || p.tags?.length); }
function problemDraft(problem, purpose = state.purpose) {
  const saved = storage.get(draftKey(problem, purpose), null);
  return { schema: 1, type: 'review', problemUrl: problem.url, problemTitle: problem.title, version: problem.version, purpose,
    score: Number.isInteger(saved?.score) && saved.score >= -10 && saved.score <= 10 ? saved.score : null,
    experience: Object.hasOwn(EXPERIENCES, saved?.experience) ? saved.experience : batchActive() && Object.hasOwn(EXPERIENCES, state.batchExperience) ? state.batchExperience : '',
    reason: typeof saved?.reason === 'string' ? saved.reason : '', spoiler: typeof saved?.spoiler === 'string' ? saved.spoiler : '',
    tags: Array.isArray(saved?.tags) ? saved.tags.filter(t => TAGS.includes(t)).slice(0, 4) : [] };
}
function batchDrafts() {
  return resolveBatch(state.batchCodes || [], state.data.problems).problems.map(p => ({ p, draft: problemDraft(p) }));
}
function renderBatchProgress() {
  if (!batchActive()) return;
  const drafts = batchDrafts(); const rated = drafts.filter(({ draft }) => draft.score !== null).length;
  $('batchProgress').textContent = `已打分 ${rated} / ${drafts.length} · 自动保存在本浏览器，尚未公开提交`;
  $('submitBatch').textContent = `提交本批评分（${rated}）`;
  $('submitBatch').disabled = !rated;
  $('startBatch').textContent = rated && rated < drafts.length ? '继续未评题目 →' : rated ? '检查本批评分 →' : '逐题评分 →';
}
function saveBatchState() {
  storage.set('batch-list', { active: state.batchCodes !== null, codes: state.batchCodes || [], raw: state.batchRaw });
  try { history.replaceState(null, '', batchURL(location.href, state.batchCodes)); } catch { /* File previews may not permit history changes. */ }
}
function renderBatchBar(selection) {
  const active = batchActive(); $('batchSummary').hidden = !active;
  $('quickScoreHeading').hidden = !active;
  $('problemRows').closest('table').classList.toggle('batch-table', active);
  $('sort').disabled = active; $('sort').options[0].textContent = active ? '输入顺序' : '建档顺序';
  if (active) {
    $('sort').value = 'catalogue';
    $('startBatch').disabled = !state.loaded || !selection.problems.length;
    $('batchCount').textContent = state.loaded ? `批量清单 · ${selection.problems.length} / ${state.batchCodes.length} 道已找到` : `正在读取 ${state.batchCodes.length} 道题…`;
    $('batchExperience').value = Object.hasOwn(EXPERIENCES, state.batchExperience) ? state.batchExperience : '';
    renderBatchProgress();
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
    $('batchNext').textContent = index + 1 < selection.problems.length ? '下一题 →' : '完成，返回清单';
  }
}
function saveCurrentDraft() {
  clearTimeout(draftTimer);
  if (!state.current) return true;
  const saved = storage.set(draftKey(), currentPayload());
  $('draftStatus').textContent = saved ? '已自动保存到本浏览器，尚未公开提交。' : '草稿保存失败，请下载或复制当前内容。';
  $('draftStatus').classList.toggle('form-error', !saved);
  return saved;
}
function scheduleDraftSave() {
  $('draftStatus').textContent = '正在保存草稿…';
  clearTimeout(draftTimer); draftTimer = setTimeout(saveCurrentDraft, 250);
}
function moveBatch(delta) {
  const selection = resolveBatch(state.batchCodes || [], state.data.problems);
  const index = selection.problems.findIndex(p => p.key === state.current?.key);
  if (index < 0 || index + delta < 0) return;
  if (!saveCurrentDraft()) { toast('草稿保存失败，请先保留当前内容再切换。'); return; }
  const next = selection.problems[index + delta];
  if (next) { state.page = Math.floor((index + delta) / Number($('pageSize').value)) + 1; showProblem(next); }
  else { $('problemDialog').close(); toast('本批草稿已保存，可以在清单中统一提交。'); }
  renderTable();
}
function quickScoreCell(problem) {
  const cell = el('td', 'quick-score-cell'); const draft = problemDraft(problem);
  const score = el('select', 'quick-score'); score.setAttribute('aria-label', `${problem.code} 我的质量评分`);
  score.append(new Option('未打分', ''));
  for (let n = -10; n <= 10; n++) score.append(new Option(`${signed(n)} · ${bandFor(n).label}`, String(n)));
  score.value = draft.score === null ? '' : String(draft.score);
  const experience = el('select', 'quick-experience'); experience.setAttribute('aria-label', `${problem.code} 解题经历`);
  experience.append(new Option('选择经历', ''));
  for (const [value, label] of Object.entries(EXPERIENCES)) experience.append(new Option(label, value));
  experience.value = draft.experience;
  function saveQuickScore() {
    const previous = problemDraft(problem);
    const next = { ...previous, score: score.value === '' ? null : Number(score.value), experience: experience.value };
    if (!storage.set(draftKey(problem, state.purpose), next)) {
      score.value = previous.score === null ? '' : String(previous.score); experience.value = previous.experience;
      toast('草稿保存失败，当前修改尚未保存。'); return;
    }
    cell.classList.toggle('has-score', next.score !== null); renderBatchProgress();
  }
  score.addEventListener('change', saveQuickScore); experience.addEventListener('change', saveQuickScore);
  cell.classList.toggle('has-score', draft.score !== null); cell.append(score, experience); return cell;
}

function openSubmission(raw) {
  const parts = prepareSubmissions(raw); const total = parts.reduce((n, part) => n + part.count, 0);
  $('submissionSummary').textContent = parts.length === 1 ? `本次包含 ${total} 条记录，只需提交一个 Issue。` : `本次包含 ${total} 条记录，内容较长，已分为 ${parts.length} 份。请逐份提交。`;
  $('submissionParts').replaceChildren();
  parts.forEach((part, index) => {
    const section = el('section', 'submission-part');
    section.append(el('h3', '', parts.length > 1 ? `第 ${index + 1} / ${parts.length} 份 · ${part.count} 条记录` : '确认提交'));
    section.append(el('p', 'muted small', part.manual ? '先复制内容，打开 GitHub 后粘贴到 Issue 正文，再确认提交。' : '打开 GitHub 后会自动填入本批内容，再确认提交即可。'));
    const actions = el('div', 'submission-actions');
    const copy = el('button', 'button small', '复制内容'); copy.type = 'button';
    const details = el('details', 'submission-data'); details.open = part.manual;
    details.append(el('summary', '', '查看或手动复制内容'));
    const body = el('textarea'); body.readOnly = true; body.value = part.body; body.rows = 6;
    body.setAttribute('aria-label', `第 ${index + 1} 份提交内容`); details.append(body);
    copy.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(part.body); copy.textContent = '已复制';
      } catch { details.open = true; body.focus(); body.select(); toast('请按 Ctrl+C 或长按复制选中的内容。'); }
    });
    const link = el('a', 'button primary small', part.manual ? '打开 GitHub 并粘贴 ↗' : '前往 GitHub 确认 ↗');
    link.href = part.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    actions.append(copy, link); section.append(actions, details); $('submissionParts').append(section);
  });
  openDialog($('submissionDialog'));
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
    nameButton.dataset.problemKey = p.key;
    nameButton.type = 'button'; nameButton.append(el('span', 'problem-code', p.code), document.createTextNode(p.title));
    nameButton.addEventListener('click', () => showProblem(p));
    const description = el('div', 'problem-description');
    description.append(el('span', `platform-pill ${p.platform.toLowerCase()}`, p.platform), el('span', 'source-text', p.source || '社区收录'));
    if (batchActive() && hasDraftInput(storage.get(`draft:${p.key}:${state.purpose}`, null))) description.append(el('span', 'draft-pill', '本地草稿'));
    nameCell.append(nameButton, description);
    const score = el('td', 'community-score');
    score.append(el('span', !s.n || state.hidden ? 'quality-unrated' : `quality-value ${toneFor(s.mean)}`, scoreLabel(s.mean)));
    const anchor = aiAnchorFor(p.key);
    if (anchor) {
      const ai = el('a', 'ai-reference-score', state.hidden ? 'AI 分数已隐藏' : `AI 参考 ${signed(anchor.score)}`);
      ai.href = `./ai-anchors.html#${anchor.code}`; ai.title = 'AI 题面初评，未计入真人评分'; score.append(ai);
    }
    const chart = el('td', 'chart-cell'); chart.append(miniature(s));
    const count = el('td', 'vote-count', String(s.n));
    const action = el('td'); const arrow = el('button', 'row-open', '↗'); arrow.type = 'button';
    arrow.setAttribute('aria-label', `查看 ${p.title} 并评分`); arrow.addEventListener('click', () => showProblem(p)); action.append(arrow);
    tr.append(starCell, nameCell, score, chart, count);
    if (batchActive()) tr.append(quickScoreCell(p));
    tr.append(action); $('problemRows').append(tr);
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
    const empty = el('div', 'reviews-empty'); empty.append(el('h3', '', '第一份评价，还留着空位。'), el('p', '', '只打分也可以，有想法再补充理由。')); $('reviews').append(empty); return;
  }
  for (const r of reviews) {
    const article = el('article', 'review-card');
    const head = el('div', 'review-card-head'); const author = el('a', '', r.author); author.href = `https://github.com/${encodeURIComponent(r.author)}`; author.target = '_blank'; author.rel = 'noopener noreferrer';
    head.append(author, el('span', state.hidden ? 'neutral' : toneFor(r.score), state.hidden ? '已隐藏' : signed(r.score)));
    article.append(head, el('p', 'review-card-meta', `${EXPERIENCES[r.experience]} · ${readableDate(r.updatedAt)}`));
    if (r.reason) article.append(el('p', '', r.reason));
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
    version: state.current.version, purpose: state.currentPurpose, experience: $('experience').value, score: state.score,
    reason: $('reason').value, spoiler: $('spoiler').value, tags: [...state.tags] };
}
function updateSubmit() {
  if (!state.current) return;
  try { validatePayload(currentPayload()); $('submitReview').setAttribute('aria-disabled', 'false'); }
  catch { $('submitReview').setAttribute('aria-disabled', 'true'); }
}
function renderTagChoices() {
  $('tagChooser').replaceChildren();
  for (const tag of TAGS) {
    const button = el('button', state.tags.has(tag) ? 'is-selected' : '', tag); button.type = 'button'; button.setAttribute('aria-pressed', String(state.tags.has(tag)));
    button.addEventListener('click', () => { if (state.tags.has(tag)) state.tags.delete(tag); else if (state.tags.size < 4) state.tags.add(tag); else { toast('最多选择四个标签。'); return; } renderTagChoices(); updateSubmit(); saveCurrentDraft(); });
    $('tagChooser').append(button);
  }
}
function showProblem(problem) {
  if ($('problemDialog').open && !saveCurrentDraft()) { toast('草稿保存失败，请先保留当前内容。'); return; }
  state.current = problem; state.currentPurpose = state.purpose; state.score = null; state.tags = new Set();
  $('detailCode').textContent = `${problem.platform} / ${problem.code}`;
  $('detailTitle').textContent = problem.title; $('detailSource').textContent = `${problem.source || '社区收录'}${problem.difficulty ? ` · 平台难度：${problem.difficulty}` : ''}`;
  $('originalLink').href = problem.url; $('detailPurpose').textContent = PURPOSES[state.purpose]; $('formPurpose').textContent = PURPOSES[state.purpose]; $('detailVersion').textContent = problem.version;
  const reviews = reviewsFor(problem.key); renderDistribution(reviews); renderReviews(reviews);
  renderAIAnchorDetail();
  $('reviewForm').reset(); $('formError').hidden = true;
  const draft = problemDraft(problem);
  state.score = draft.score; state.tags = new Set(draft.tags);
  $('experience').value = draft.experience; $('reason').value = draft.reason; $('spoiler').value = draft.spoiler;
  $('supplementalReview').open = Boolean(draft.reason || draft.spoiler || draft.tags.length);
  $('draftStatus').textContent = hasDraftInput(storage.get(draftKey(), null)) ? '已恢复本浏览器草稿，尚未公开提交。' : '评分和补充内容会自动保存在本浏览器。';
  $('draftStatus').classList.remove('form-error');
  renderTagChoices(); updateScoreSelection(); renderBatchNavigation(); openDialog($('problemDialog'));
}

async function loadData() {
  $('loadError').hidden = true;
  try {
    const res = window.PROBLEM_NOTES_PREVIEW_DATA ? { ok: true, json: async () => window.PROBLEM_NOTES_PREVIEW_DATA } : await fetch('./data/ratings.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.schema !== 1 || !Array.isArray(data.problems) || !Array.isArray(data.reviews)) throw new Error('数据格式不匹配');
    state.data = data; state.aiByKey = new Map((data.aiAnchors?.entries || []).map(p => [p.key, p])); state.loaded = true; $('updatedAt').textContent = readableDate(data.generatedAt); renderTable(); renderSources();
    if ($('batchDialog').open) previewBatch();
    if ($('problemDialog').open && state.current) { renderDistribution(reviewsFor(state.current.key)); renderReviews(reviewsFor(state.current.key)); renderAIAnchorDetail(); }
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
  b.addEventListener('click', () => { state.score = score; updateScoreSelection(); saveCurrentDraft(); }); $('scoreChooser').append(b);
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
  if ($('problemDialog').open && state.current) { renderDistribution(reviewsFor(state.current.key)); renderReviews(reviewsFor(state.current.key)); renderAIAnchorDetail(); }
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
  const drafts = batchDrafts(); const next = drafts.find(({ draft }) => draft.score === null) || drafts[0];
  if (next) showProblem(next.p); else toast('先收录清单里尚未找到的题目，再刷新数据。');
});
$('batchExperience').addEventListener('change', () => {
  state.batchExperience = $('batchExperience').value;
  if (!storage.set('batch-experience', state.batchExperience)) toast('浏览器无法保存默认经历。');
  for (const { p, draft } of batchDrafts()) {
    const saved = storage.get(draftKey(p, state.purpose), null);
    if (draft.score !== null && !Object.hasOwn(EXPERIENCES, saved?.experience) && !storage.set(draftKey(p, state.purpose), draft)) {
      toast('部分草稿保存失败，请检查后再提交。'); break;
    }
  }
  renderTable();
});
$('submitBatch').addEventListener('click', () => {
  try {
    const reviews = batchDrafts().filter(({ draft }) => draft.score !== null).map(({ p, draft }) => {
      try { return validatePayload(draft); } catch (error) { throw new Error(`${p.code}：${error.message}`); }
    });
    if (!reviews.length) throw new Error('先为清单中的题目打分；未打分的题目会跳过。');
    openSubmission({ schema: 1, type: 'review-batch', reviews });
  } catch (error) { toast(error.message); }
});
$('batchPrevious').addEventListener('click', () => moveBatch(-1)); $('batchNext').addEventListener('click', () => moveBatch(1));
$('problemDialog').addEventListener('close', () => {
  if (!saveCurrentDraft()) toast('草稿未能保存，请保留当前内容。');
  renderTable();
  const opener = [...document.querySelectorAll('.problem-title-button')].find(button => button.dataset.problemKey === state.current?.key);
  opener?.focus({ preventScroll: true });
});
$('problemDialog').addEventListener('cancel', event => { if (!saveCurrentDraft()) { event.preventDefault(); toast('草稿保存失败，请先保留当前内容。'); } });
function closeDialog(dialog) {
  if (dialog === $('problemDialog') && !saveCurrentDraft()) { toast('草稿保存失败，请先保留当前内容。'); return; }
  dialog.close();
}
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeDialog($(b.dataset.close)));
for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(d); } });
for (const id of ['reason', 'spoiler', 'experience']) $(id).addEventListener('input', () => { updateSubmit(); scheduleDraftSave(); });
$('saveDraft').addEventListener('click', () => { toast(saveCurrentDraft() ? '草稿已保存，仅存在此浏览器，尚未公开提交。' : '浏览器无法保存草稿，可以下载评分数据。'); renderTable(); });
$('downloadReview').addEventListener('click', () => {
  try {
    const p = validatePayload(currentPayload()); const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
    const a = el('a'); a.href = url; a.download = `rating-${state.current.code.replace(/[^a-zA-Z0-9-]/g, '')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { $('formError').textContent = error.message; $('formError').hidden = false; }
});
$('submitReview').addEventListener('click', event => {
  event.preventDefault();
  try {
    const payload = validatePayload(currentPayload());
    if (!saveCurrentDraft()) throw new Error('草稿保存失败，请先下载评分数据，保留当前内容。');
    $('formError').hidden = true; openSubmission(payload);
  }
  catch (error) { event.preventDefault(); $('formError').textContent = error.message; $('formError').hidden = false; }
});
$('reviewForm').addEventListener('submit', e => { e.preventDefault(); $('submitReview').click(); });
$('addForm').addEventListener('submit', event => {
  event.preventDefault();
  try { const p = { schema: 1, type: 'problem', problemUrl: $('newUrl').value, problemTitle: $('newTitle').value, version: $('newVersion').value }; openSubmission(p); $('addError').hidden = true; }
  catch (error) { $('addError').textContent = error.message; $('addError').hidden = false; }
});
$('refreshData').addEventListener('click', () => { loadData(); }); $('retryLoad').addEventListener('click', loadData);
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); if ($('libraryView').hidden) location.hash = 'library'; $('search').focus(); }
  if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key) && $('problemDialog').open && !$('submissionDialog').open && batchActive()) {
    e.preventDefault(); moveBatch(e.key === 'ArrowLeft' ? -1 : 1);
  }
});
window.addEventListener('pagehide', () => { if ($('problemDialog').open) saveCurrentDraft(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && $('problemDialog').open) saveCurrentDraft(); });
window.addEventListener('storage', event => {
  if (event.key?.startsWith('problem-notes:draft:') && !$('problemDialog').open) renderTable();
});
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

