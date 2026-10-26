import { signed, toneFor } from '../public/lib.mjs';

const escapeHTML = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function renderAIAnchorPage(data, assetVersion) {
  const families = [...new Set(data.entries.map(p => p.family))];
  const groups = new Map();
  for (const entry of data.entries) {
    if (!groups.has(entry.contest)) groups.set(entry.contest, []);
    groups.get(entry.contest).push(entry);
  }
  const options = values => values.map(value => `<option>${escapeHTML(value)}</option>`).join('');
  const rows = data.entries.map((p, index) => `<tr id="${p.code}" data-year="${p.year}" data-family="${escapeHTML(p.family)}" data-search="${escapeHTML(`${p.code} ${p.title} ${p.contest}`.toLowerCase())}" data-score="${p.score}" data-order="${index}">
    <td><a class="anchor-problem" href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer"><span class="problem-code">${p.code}</span>${escapeHTML(p.title)} ↗</a><p class="anchor-contest">${escapeHTML(p.contest)}</p></td>
    <td class="anchor-score ${toneFor(p.score)}">${signed(p.score)}</td>
    <td><details><summary>查看判断依据（可能剧透）</summary><p>${escapeHTML(p.reason)}</p>${p.sourceUrls.map((url, i) => `<a class="inline-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">补充参考 ${i + 1} ↗</a>`).join(' · ')}</details><span class="anchor-confidence">${p.confidence === 'low' ? '初评 · 解法需进一步复核' : '初评 · 结构判断较明确'}</span></td>
  </tr>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="2022—2026 年洛谷正赛题的 AI 质量参考评分，与真人投票分开。"><title>AI 参考评分 · 题评</title><link rel="icon" href="./favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="./styles.css?v=${assetVersion}"></head>
<body><a class="skip-link" href="#anchorRows">跳转到评分</a><header class="site-header"><div class="header-inner"><a class="brand" href="./#library">题评<span class="brand-en">PROBLEM NOTES</span></a><nav aria-label="主导航"><a href="./#library">题库</a><a href="./#rank">真人榜单</a><a href="./#guide">评分标准</a><a href="./ai-anchors.html" class="active" aria-current="page">AI 参考</a></nav></div></header>
<main class="page-shell anchor-page"><div class="document-top"><p class="eyebrow">AI REFERENCE · 2022—2026</p><h1>一份可讨论的<br><em>AI 评分起点。</em></h1><p>${data.entries.length} 个洛谷条目 · ${groups.size} 个赛事分组 · 截至 ${escapeHTML(data.generatedAt.slice(0, 10))}</p></div>
<section class="anchor-notice"><h2>怎样使用这套参考</h2><p>以竞赛体验评价质量，使用 −10～+10 分，0 表示一般题。全部为 Codex AI 以公开题面为主的初步判断，部分条目参考了作者公开解法，链接附在理由后。未逐题编写满分程序，也未实测数据、时限与评分器。标为“解法需进一步复核”的条目尤其需要保留判断。</p><p>AI 分数单独展示，不计入真人均分、人数或榜单。理由默认折叠，可先隐藏分数，留下自己的判断再比较。分值未按洛谷难度换算，也未导入站外投票。</p><p>${escapeHTML(data.scope)}</p><p>${escapeHTML(data.coverageNotes)}</p><p>各题标题链接指向洛谷原题。<a href="./data/ai-anchors.json" download>下载本套评分 JSON</a> · <a href="./#guide">查看评分标准</a></p></section>
<section class="anchor-pending"><h2>尚未举行的 2026 年赛事</h2><p>CSP-J/S 第二轮：2026-10-31；NOIP：2026-11-28。截止日为 2026-10-26，这两场没有预填分数。<a href="https://www.noi.cn/gs/index.shtml" target="_blank" rel="noopener noreferrer">NOI 官网赛程通知 ↗</a></p></section>
<section class="library-panel"><div class="anchor-toolbar"><label>年份 <select id="anchorYear"><option value="">全部</option>${options([2022,2023,2024,2025,2026])}</select></label><label>赛事 <select id="anchorFamily"><option value="">全部</option>${options(families)}</select></label><label class="anchor-search">搜索 <input type="search" id="anchorSearch" placeholder="题号、题名或赛事"></label><label>排序 <select id="anchorSort"><option value="order">赛事顺序</option><option value="desc">AI 分数由高到低</option><option value="asc">AI 分数由低到高</option></select></label><button class="button small" id="anchorHide" aria-pressed="false">隐藏 AI 分数</button></div><p id="anchorCount" class="anchor-result" role="status">${data.entries.length} 个条目</p><div class="table-scroll"><table class="anchor-table"><thead><tr><th>题目 / 正赛</th><th>AI 参考</th><th>判断与复核状态</th></tr></thead><tbody id="anchorRows">${rows}</tbody></table></div><p id="anchorEmpty" class="empty-state" hidden>没有符合筛选条件的题目。</p></section>
</main><footer class="site-footer"><a href="./#library">返回题库 →</a><p>AI 参考可以被质疑，也可以随着复核而修订。</p></footer><script type="module" src="./ai-anchors.mjs?v=${assetVersion}"></script></body></html>`;
}
