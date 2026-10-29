import { signed, toneFor, summarize } from '../public/lib.mjs';

const escapeHTML = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function renderAIAnchorPage(data, assetVersion, feedback = null) {
  const reviews = feedback?.reviews ?? [];
  const feedbackDate = feedback?.snapshotDate ?? feedback?.downloadedAt?.slice(0, 10) ?? '2026-10-29';
  const feedbackByKey = new Map();
  for (const review of reviews) {
    if (review.purpose !== 'contest') continue;
    if (!feedbackByKey.has(review.key)) feedbackByKey.set(review.key, []);
    feedbackByKey.get(review.key).push(review);
  }
  const comparedCount = data.entries.filter(p => feedbackByKey.has(p.key)).length;
  const families = [...new Set(data.entries.map(p => p.family))];
  const groups = new Map();
  for (const entry of data.entries) {
    if (!groups.has(entry.contest)) groups.set(entry.contest, []);
    groups.get(entry.contest).push(entry);
  }
  const options = values => values.map(value => `<option>${escapeHTML(value)}</option>`).join('');
  const humanCell = p => {
    const records = feedbackByKey.get(p.key) ?? [];
    if (!records.length) return '<td class="anchor-human"><span class="muted">本次快照无同用途反馈</span></td>';
    const summary = summarize(records);
    return `<td class="anchor-human"><strong class="anchor-human-score ${toneFor(summary.mean)}">${signed(summary.mean, 1)}</strong><p>${summary.n} 位评价者 · 竞赛体验</p><details><summary>查看个人分数与理由（可能剧透）</summary>${records.map(r => `<p><a class="inline-link" href="${escapeHTML(r.issueUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(r.author)} · ${signed(r.score)} · #${r.issue} ↗</a><br>${r.reason ? escapeHTML(r.reason) : '仅提交分数，未提供文字理由。'}</p>`).join('')}</details></td>`;
  };
  const rows = data.entries.map((p, index) => `<tr id="${p.code}" data-year="${p.year}" data-family="${escapeHTML(p.family)}" data-search="${escapeHTML(`${p.code} ${p.title} ${p.contest}`.toLowerCase())}" data-score="${p.score}" data-feedback="${feedbackByKey.has(p.key) ? 'yes' : 'no'}" data-order="${index}">
    <td><a class="anchor-problem" href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer"><span class="problem-code">${p.code}</span>${escapeHTML(p.title)} ↗</a><p class="anchor-contest">${escapeHTML(p.contest)}</p></td>
    <td class="anchor-score ${toneFor(p.score)}">${signed(p.score)}</td>
    ${humanCell(p)}
    <td><details><summary>查看历史 AI 判断依据（可能剧透）</summary><p>${escapeHTML(p.reason)}</p>${p.sourceUrls.map((url, i) => `<a class="inline-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">补充参考 ${i + 1} ↗</a>`).join(' · ')}</details><span class="anchor-confidence">${p.confidence === 'low' ? '历史初评 · 解法需进一步复核' : '历史初评 · 结构判断较明确'}</span>${feedbackByKey.has(p.key) ? '<span class="anchor-feedback-status">已有反馈 · 待按新版标准复核</span>' : '<span class="anchor-confidence">尚未按新版标准逐题复核</span>'}</td>
  </tr>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="2022—2026 年洛谷正赛题的 AI 质量参考评分，与真人投票分开。"><title>AI 参考评分 · 题评</title><link rel="icon" href="./favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="./styles.css?v=${assetVersion}"></head>
<body><a class="skip-link" href="#anchorRows">跳转到评分</a><header class="site-header"><div class="header-inner"><a class="brand" href="./#library">题评<span class="brand-en">PROBLEM NOTES</span></a><nav aria-label="主导航"><a href="./#library">题库</a><a href="./#rank">真人榜单</a><a href="./#guide">评分标准</a><a href="./feedback.html">反馈校准</a><a href="./ai-anchors.html" class="active" aria-current="page">AI 参考</a></nav></div></header>
<main class="page-shell anchor-page"><div class="document-top"><p class="eyebrow">HISTORICAL AI REFERENCE · 2022—2026</p><h1>保留初评，<br><em>对照真实反馈。</em></h1><p>${data.entries.length} 个洛谷条目 · ${groups.size} 个赛事分组 · 原始初评 ${escapeHTML(data.generatedAt.slice(0, 10))}</p></div>
<section class="anchor-notice"><h2>历史初评与新版标准</h2><p>这 ${data.entries.length} 条分数保留原始初评。评分标准已更新至 v1.1，本页新增 ${escapeHTML(feedbackDate)} 的真人反馈对照，其中 ${comparedCount} 道题有同版本、同用途反馈；尚未按新标准逐题重评，不将真人均分直接替换成 AI 分数。</p><p>分歧是复核线索，不是客观误差或预测准确率。下列真人反馈来自同一批已知样本，仅用于回归检查。<a href="./feedback.html">查看完整反馈汇总与校准依据 →</a></p><p>以竞赛体验评价质量，使用 −10～+10 分，0 表示一般题。历史分数全部为 Codex AI 以公开题面为主的初步判断，部分条目参考了作者公开解法，链接附在理由后。未逐题编写满分程序，也未实测数据、时限与评分器。标为“解法需进一步复核”的条目尤其需要保留判断。</p><p>AI 分数单独展示，不计入真人均分、人数或榜单。理由默认折叠；“隐藏 AI 分数”只隐藏 AI 列，真人分数仍保留，便于按个人评价对照。分值未按洛谷难度换算，也未导入站外投票。</p><p>${escapeHTML(data.scope)}</p><p>${escapeHTML(data.coverageNotes)}</p><p>各题标题链接指向洛谷原题。<a href="./data/ai-anchors.json" download>下载原始 AI 评分 JSON</a> · <a href="./#guide">查看评分标准</a></p></section>
<section class="anchor-pending"><h2>原始初评的赛事覆盖边界</h2><p>原始初评在 2026-10-26 记录的赛程为：CSP-J/S 第二轮 2026-10-31，NOIP 2026-11-28。两场在该初评截止日尚未举行，因此原始参考集没有预填分数；这里保留原始覆盖说明。<a href="https://www.noi.cn/gs/index.shtml" target="_blank" rel="noopener noreferrer">NOI 官网赛程通知 ↗</a></p></section>
<section class="library-panel"><div class="anchor-toolbar"><label>年份 <select id="anchorYear"><option value="">全部</option>${options([2022,2023,2024,2025,2026])}</select></label><label>赛事 <select id="anchorFamily"><option value="">全部</option>${options(families)}</select></label><label class="anchor-search">搜索 <input type="search" id="anchorSearch" placeholder="题号、题名或赛事"></label><label>排序 <select id="anchorSort"><option value="order">赛事顺序</option><option value="desc">AI 分数由高到低</option><option value="asc">AI 分数由低到高</option></select></label><label>反馈 <select id="anchorFeedback"><option value="">全部条目</option><option value="yes">已有真人反馈</option><option value="no">暂无同用途反馈</option></select></label><button class="button small" id="anchorHide" aria-pressed="false">隐藏 AI 分数</button></div><p id="anchorCount" class="anchor-result" role="status">${data.entries.length} 个条目</p><div class="table-scroll"><table class="anchor-table"><thead><tr><th>题目 / 正赛</th><th>历史 AI 初评</th><th>真人反馈快照</th><th>判断与复核状态</th></tr></thead><tbody id="anchorRows">${rows}</tbody></table></div><p id="anchorEmpty" class="empty-state" hidden>没有符合筛选条件的题目。</p></section>
</main><footer class="site-footer"><a href="./#library">返回题库 →</a><p>保留原始判断与真实分歧；复核完成后，再逐题修订。</p></footer><script type="module" src="./ai-anchors.mjs?v=${assetVersion}"></script></body></html>`;
}
