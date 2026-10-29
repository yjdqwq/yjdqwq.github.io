import { buildDataset, parseIssue, canonicalProblem, summarize, REPOSITORY, PURPOSES, EXPERIENCES, signed, toneFor } from '../public/lib.mjs';

const escapeHTML = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const countBy = (rows, field) => Object.fromEntries([...new Set(rows.map(row => row[field]))].sort().map(value => [value, rows.filter(row => row[field] === value).length]));
const issueURL = number => `https://github.com/${REPOSITORY}/issues/${number}`;

export function buildFeedbackReport(snapshot, aiAnchors = { entries: [] }) {
  if (snapshot?.repository !== REPOSITORY || !Array.isArray(snapshot.issues)) throw new Error('反馈快照格式不正确。');
  const seen = new Set();
  const issues = snapshot.issues.map(issue => {
    if (!Number.isInteger(issue.number) || seen.has(issue.number)) throw new Error('反馈快照的 Issue 编号无效或重复。');
    seen.add(issue.number);
    const parsed = parseIssue(issue, { includeInactive: true });
    const count = parsed?.type === 'review-batch' ? parsed.reviews.length : parsed?.type === 'review' ? 1 : 0;
    const status = issue.pull_request ? 'ignored-pull-request' : parsed?.active ? 'included' : issue.state === 'closed' ? (parsed ? 'withdrawn' : 'closed-unreadable') : parsed ? 'excluded' : 'invalid';
    return { number: issue.number, title: issue.title, author: issue.user?.login, state: issue.state, status, expandedRatings: count, url: issueURL(issue.number) };
  });
  const snapshotDate = snapshot.snapshotDate || (snapshot.downloadedAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) throw new Error('反馈快照缺少日期。');
  const dataset = buildDataset([], snapshot.issues, snapshot.downloadedAt || snapshotDate);
  const reviews = dataset.reviews.map(row => ({ ...row, code: canonicalProblem(row.problemUrl).code }));
  const groups = new Map();
  for (const review of reviews) {
    const key = `${review.key}|${review.purpose}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(review);
  }
  const summaries = [...groups.values()].map(rows => ({ key: rows[0].key, code: rows[0].code, title: rows[0].problemTitle, problemUrl: rows[0].problemUrl, purpose: rows[0].purpose,
    ...summarize(rows), min: Math.min(...rows.map(r => r.score)), max: Math.max(...rows.map(r => r.score)),
    ratings: rows.map(({ author, authorId, score, reason, experience, issue, issueUrl }) => ({ author, authorId, score, reason, experience, issue, issueUrl })) }));
  const anchors = new Map((aiAnchors.entries || []).map(entry => [entry.key, entry]));
  const comparisons = summaries.filter(row => row.purpose === 'contest' && anchors.has(row.key)).map(row => {
    const anchor = anchors.get(row.key);
    return { ...row, aiScore: anchor.score, aiReason: anchor.reason, aiConfidence: anchor.confidence, aiGeneratedAt: aiAnchors.generatedAt, delta: row.mean - anchor.score };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.code.localeCompare(b.code, 'en', { numeric: true }));
  const submittedRatings = issues.filter(issue => issue.status === 'included').reduce((sum, issue) => sum + issue.expandedRatings, 0);
  return { schema: 1, rubricVersion: '1.1', repository: REPOSITORY, snapshotDate, downloadedAt: snapshot.downloadedAt,
    scope: '本站公开 Issues 的已知反馈回归；不是盲测、社区随机样本或完整解法核验。',
    counts: { issues: issues.length, includedIssues: issues.filter(i => i.status === 'included').length, closedIssues: issues.filter(i => i.state === 'closed').length,
      submittedRatings, effectiveRatings: reviews.length, replacedOrWithdrawnRatings: submittedRatings - reviews.length,
      uniqueProblems: new Set(reviews.map(row => row.key)).size, authors: new Set(reviews.map(row => row.authorId)).size,
      withReasons: reviews.filter(row => row.reason).length, scoreOnly: reviews.filter(row => !row.reason).length, zeroScores: reviews.filter(row => row.score === 0).length },
    purposes: countBy(reviews, 'purpose'), experiences: countBy(reviews, 'experience'),
    authors: [...new Set(reviews.map(row => row.author))].map(author => {
      const rows = reviews.filter(row => row.author === author);
      return { author, count: rows.length, withReasons: rows.filter(row => row.reason).length, purposes: countBy(rows, 'purpose'), histogram: summarize(rows).histogram };
    }).sort((a, b) => b.count - a.count),
    histogram: summarize(reviews).histogram, issues, reviews,
    multipleRaters: summaries.filter(row => row.n > 1).sort((a, b) => (b.max - b.min) - (a.max - a.min)),
    aiReference: { id: aiAnchors.id || null, generatedAt: aiAnchors.generatedAt || null, entries: (aiAnchors.entries || []).length }, comparisons };
}

const ruleCards = [
  ['普通题可以有观察', '有一个性质、能练工具、做法正确，都不足以自动给正分。先说明超出一般题的具体收获。', '直接文字：P7093（0 分）；分数分布与模板条目只作辅助对照，不代写理由。', [17]],
  ['看每一步的回报', '观察之后的证明、分类与维护也要有价值；实现成本与发现收益一起判断。长推导和高级工具不自动加分，也不自动扣分。', '直接文字：登山（−1）、回归空白（+1）；树的价值（+10）保留为高分对照，不能概括成“复杂就差”。', [18,17,1]],
  ['多种解法要有实际意义', '替代路线能改变发现难度、证明、实现或常数时值得讨论；做法数量本身不换算成加分。', '直接文字：员工招聘（+3）、谐音替换（+3）；仍需核实具体路线，不把个人体验当 AC 证明。', [17,12]],
  ['比赛设置单独核验', '题位、部分分、时限与非预期解会影响竞赛体验。保留批评，同时区分已核验事实与评价者陈述。', '直接文字：道路修复（0）、布丁（−10）、松鼠（−2）；本轮没有实测数据或评分器。', [14,3,17]],
  ['不把难度落差换成质量', '简单也能优秀，困难也能普通。熟悉程度、平台标难与个人惊喜感，应与质量理由分别记录。', '边界案例：P6958 的 −3 分理由集中在洛谷难度；保留原票，不推广为“简单题扣分”规则。', [17]],
  ['保留分歧与未知', '0 不是未评价。仅有分数仍正常计票，但不能据此断言好评或差评原因；同题分歧不强行统一。', '统计约束：样本来自少数账号，绝大多数没有文字理由；训练用途仅一条，不据此拟合训练标准。', [4,9,10,17]]
];

export function renderFeedbackPage(report, assetVersion) {
  const h = escapeHTML, c = report.counts;
  const sourceLinks = numbers => numbers.map(n => `<a href="${issueURL(n)}" target="_blank" rel="noopener noreferrer">#${n} ↗</a>`).join(' · ');
  const reviewLinks = rows => rows.map(r => `<a href="${h(r.issueUrl)}" target="_blank" rel="noopener noreferrer">${h(r.author)} ${signed(r.score)}</a>`).join(' · ');
  const reasonReviews = report.reviews.filter(row => row.reason);
  const reasonCards = reasonReviews.map(row => `<article class="feedback-reason"><div><a href="${h(row.problemUrl)}" target="_blank" rel="noopener noreferrer"><strong>${h(row.code)} · ${h(row.problemTitle)}</strong></a><span class="feedback-score ${toneFor(row.score)}">${signed(row.score)}</span></div><p class="muted">${h(row.author)} · ${h(PURPOSES[row.purpose])} · ${h(EXPERIENCES[row.experience])} · ${sourceLinks([row.issue])}</p><details><summary>阅读评价原文（可能剧透）</summary><blockquote>${h(row.reason)}</blockquote>${row.spoiler ? `<p class="feedback-original">${h(row.spoiler)}</p>` : ''}</details></article>`).join('');
  const maxCount = Math.max(1, ...report.histogram);
  const distribution = report.histogram.map((n, i) => `<tr><th scope="row">${signed(i - 10)}</th><td class="feedback-meter"><span style="width:${100 * n / maxCount}%"></span></td><td>${n}</td></tr>`).join('');
  const authors = report.authors.map(row => `<tr><th scope="row">${h(row.author)}</th><td>${row.count}</td><td>${row.withReasons}</td></tr>`).join('');
  const disagreements = report.multipleRaters.map(row => `<tr><td><a href="${h(row.problemUrl)}">${h(row.code)} · ${h(row.title)}</a><small>${h(PURPOSES[row.purpose])}</small></td><td>${reviewLinks(row.ratings)}</td><td>${signed(row.mean, 1)}</td><td>${signed(row.min)}～${signed(row.max)}</td></tr>`).join('');
  const comparisons = report.comparisons.map(row => `<tr><td><a href="./ai-anchors.html#${h(row.code)}">${h(row.code)} · ${h(row.title)}</a></td><td>${signed(row.aiScore)}</td><td>${signed(row.mean, 1)}<small>${row.n} 人 · ${reviewLinks(row.ratings)}</small></td><td>${signed(row.delta, 1)}</td></tr>`).join('');
  const rows = report.reviews.map(row => `<tr data-search="${h(`${row.code} ${row.problemTitle} ${row.author}`.toLowerCase())}" data-author="${h(row.author)}" data-reason="${row.reason ? '1' : '0'}" data-purpose="${h(row.purpose)}"><td><a href="${h(row.problemUrl)}">${h(row.code)} · ${h(row.problemTitle)}</a><small>${h(row.version)}</small></td><td class="${toneFor(row.score)}">${signed(row.score)}</td><td>${h(row.author)}<small>${h(EXPERIENCES[row.experience])}</small></td><td>${h(PURPOSES[row.purpose])}</td><td>${sourceLinks([row.issue])}${row.reason ? `<details><summary>有文字理由</summary><p class="feedback-original">${h(row.reason)}</p></details>` : '<small>仅有分数，原因未知</small>'}</td></tr>`).join('');
  const issueRows = report.issues.map(row => `<tr><td><a href="${h(row.url)}">#${row.number} · ${h(row.title)}</a></td><td>${h(row.author)}</td><td>${row.status === 'included' ? `纳入 · 展开 ${row.expandedRatings} 条` : row.status === 'closed-unreadable' ? '已关闭 · 正文为空或不可解析，原条数未知' : h(row.status)}</td></tr>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>反馈校准 · 题评</title><meta name="description" content="从公开评分中校准题目评价标准，保留原始理由、个人分歧和证据边界。"><link rel="icon" href="./favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="./styles.css?v=${h(assetVersion)}"><style>
  .feedback-page{padding-bottom:60px}.feedback-page section{margin:24px 0}.feedback-panel{background:var(--paper,#fff);border:1px solid var(--line,#e2e6ed);border-radius:14px;padding:28px}.feedback-panel h2{margin:0 0 14px}.feedback-panel p{line-height:1.8}.feedback-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.feedback-stats div{padding:20px;border:1px solid #e2e6ed;border-radius:12px;background:#fff}.feedback-stats strong{display:block;font-size:32px}.feedback-stats span{font-size:13px;color:#69717d}.feedback-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.feedback-page table{border-collapse:collapse;width:100%;font-size:14px}.feedback-page td,.feedback-page th{text-align:left;padding:12px;border-bottom:1px solid #e6e9ef;vertical-align:top}.feedback-page th{font-weight:600}.feedback-page small{display:block;color:#6e7682;line-height:1.7;margin-top:4px}.feedback-page details{line-height:1.8}.feedback-page summary{cursor:pointer;color:#46576f}.feedback-page blockquote{margin:12px 0;padding:12px 16px;border-left:3px solid #b9cce8;background:#f6f8fb;white-space:pre-wrap;overflow-wrap:anywhere}.feedback-reason{padding:18px 0;border-bottom:1px solid #e6e9ef}.feedback-reason>div{display:flex;justify-content:space-between;gap:14px}.feedback-reason .muted{font-size:13px;margin:7px 0}.feedback-score{white-space:nowrap;font-size:20px;font-weight:700}.feedback-original{white-space:pre-wrap;overflow-wrap:anywhere;max-width:620px}.feedback-meter{width:75%}.feedback-meter span{display:block;height:12px;min-width:0;background:#7c9ac8;border-radius:4px;margin-top:4px}.feedback-distribution td,.feedback-distribution th{padding:5px 12px}.feedback-rules{display:grid;grid-template-columns:1fr 1fr;gap:18px}.feedback-rule{padding:20px;background:#f7f9fc;border-radius:12px}.feedback-rule h3{margin:0 0 9px}.feedback-rule p{margin:6px 0}.feedback-rule small{font-size:12px}.feedback-tools{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:16px 0}.feedback-tools input[type=search]{min-width:230px;padding:10px;border:1px solid #d5dce7;border-radius:7px}.feedback-tools select{padding:8px}.feedback-note{border-left:3px solid #7595c2;padding-left:18px}.feedback-page a{overflow-wrap:anywhere}.feedback-page .table-scroll{max-width:100%}.feedback-page [hidden]{display:none!important}@media(max-width:760px){.feedback-grid,.feedback-rules{grid-template-columns:1fr}.feedback-stats{grid-template-columns:1fr 1fr}.feedback-panel{padding:18px}.feedback-page table{min-width:580px}.feedback-page .feedback-distribution,.feedback-page .feedback-authors{min-width:0}.feedback-page .document-top h1{font-size:34px}}
  </style></head><body><a class="skip-link" href="#main">跳转到正文</a><header class="site-header"><div class="header-inner"><a class="brand" href="./#library">题评<span class="brand-en">PROBLEM NOTES</span></a><nav aria-label="主导航"><a href="./#library">题库</a><a href="./#rank">榜单</a><a href="./#guide">评分标准</a><a href="./feedback.html" class="active" aria-current="page">反馈校准</a><a href="./ai-anchors.html">AI 参考</a></nav></div></header>
  <main id="main" class="page-shell feedback-page"><div class="document-top"><p class="eyebrow">FEEDBACK CALIBRATION · ${h(report.snapshotDate)}</p><h1>让标准，<em>经得起具体评价。</em></h1><p>阅读公开 Issues，保留每个人的分数与理由，再检查评价标准遗漏了什么。标准 v1.1 的这轮校准是一份固定快照。</p></div>
  <section class="feedback-stats" aria-label="快照统计"><div><strong>${c.effectiveRatings}</strong><span>去重后的有效评分</span></div><div><strong>${c.uniqueProblems}</strong><span>题目版本</span></div><div><strong>${c.authors}</strong><span>公开评价账号</span></div><div><strong>${c.withReasons}</strong><span>附文字理由的评分</span></div></section>
  <section class="feedback-panel"><h2>这次读到了什么</h2><p>${c.issues} 个 Issues 中，${c.includedIssues} 个有效开放记录展开为 ${c.submittedRatings} 条评分；同账号、同题目版本、同用途只保留最后更新的一条，${c.replacedOrWithdrawnRatings} 条旧记录不再重复计票。${c.closedIssues} 个已关闭 Issue 不计入；#16 的正文为空，无法从标题还原其原评分。</p><p>${report.purposes.contest || 0} 条竞赛体验、${report.purposes.training || 0} 条学习训练；${c.zeroScores} 条真实零分，${c.scoreOnly} 条仅有分数。账号的评分数量只说明样本构成，不赋予额外票权。两种用途继续分别汇总。</p><p class="feedback-note">这些是少数评价者主动提交的反馈，不代表整个 OI 社区。文字理由可以支持具体校准；分数本身不能告诉我们原因。更新标准不重写真人评分，也不宣称预测精度提高。</p><p><a href="./#guide">阅读更新后的评分标准 →</a> · <a href="./data/feedback-calibration.json" download>下载汇总 JSON</a> · <a href="./data/feedback-source.json" download>下载来源快照</a></p></section>
  <section class="feedback-panel"><h2>从反馈得到的六项检查</h2><div class="feedback-rules">${ruleCards.map(([title, rule, evidence, links]) => `<article class="feedback-rule"><h3>${h(title)}</h3><p>${h(rule)}</p><small>${h(evidence)}</small><small>${sourceLinks(links)}</small></article>`).join('')}</div><p>这些是检查问题，不是按标签加减分的公式。具体算法、复杂度、时限或非预期解的说法仍需另行核验；本轮没有重新证明全部题目。</p></section>
  <div class="feedback-grid"><section class="feedback-panel"><h2>分数分布</h2><p>全部有效记录的数量分布；含两种用途，不计算跨用途质量均分。</p><table class="feedback-distribution"><thead><tr><th>分数</th><th>数量</th><th>条数</th></tr></thead><tbody>${distribution}</tbody></table></section><section class="feedback-panel"><h2>评价者构成</h2><table class="feedback-authors"><thead><tr><th>账号</th><th>有效评分</th><th>有理由</th></tr></thead><tbody>${authors}</tbody></table><p>同一账号的多条评分并不是多个独立评价者。没有理由的高分或低分，只能作为待比较的案例，不能补写其背后的动机。</p><h3>校准保留的边界</h3><p>有趣的转化可能值得高分，普通观察也可能只值 0 分。长推导、高级算法、简短代码或模板题都没有自动对应的质量分。</p><p>AI 的历史初评与人类反馈分别保存。对已见反馈的案例进行比较属于回归检查；不是盲评，也不是用真人均分替换 AI 独立判断。</p></section></div>
  <section class="feedback-panel"><h2>${reasonReviews.length} 条文字评价</h2><p>以下按原文保留。措辞属于各自评价者，包含主观感受与尚未核验的事实主张。默认折叠，以免剧透。</p>${reasonCards}</section>
  <section class="feedback-panel"><h2>同题分歧，继续保留</h2><p>只有同版本、同用途的记录才放在一起。${report.multipleRaters.length} 组有不止一位评价者，单个均值不能替代原分数。</p><div class="table-scroll"><table><thead><tr><th>题目</th><th>个人评分 / 来源</th><th>均分</th><th>范围</th></tr></thead><tbody>${disagreements}</tbody></table></div></section>
  <section class="feedback-panel"><h2>与历史 AI 初评对照</h2><p>${report.aiReference.entries} 条历史 AI 参考中，${report.comparisons.length} 个同版本条目在本快照有竞赛体验评分。下表保留 ${h(report.aiReference.generatedAt || '原')} 初评分数；差值是“真人均分 − 历史 AI 分数”，用于找出需要复核的案例，不代表 AI 已按新标准重新完成评审。</p><p>未有完整解法复核的条目仍不能成为可靠评分锚点。没有依据的分数不因贴近真人反馈而变得可信。</p><details><summary>展开 ${report.comparisons.length} 个对照条目</summary><div class="table-scroll"><table><thead><tr><th>题目</th><th>历史 AI</th><th>真人均分 / 样本</th><th>差值</th></tr></thead><tbody>${comparisons}</tbody></table></div></details></section>
  <section class="feedback-panel"><h2>全部有效评价</h2><div class="feedback-tools"><label>搜索 <input id="feedbackSearch" type="search" placeholder="题号、题名、账号"></label><label>账号 <select id="feedbackAuthor"><option value="">全部</option>${report.authors.map(row => `<option>${h(row.author)}</option>`).join('')}</select></label><label>用途 <select id="feedbackPurpose"><option value="">全部</option><option value="contest">竞赛体验</option><option value="training">学习训练</option></select></label><label><input id="feedbackReasonOnly" type="checkbox">仅有理由</label></div><p id="feedbackCount" role="status">${c.effectiveRatings} / ${c.effectiveRatings} 条记录</p><div class="table-scroll"><table><thead><tr><th>题目 / 版本</th><th>分数</th><th>账号 / 经历</th><th>用途</th><th>来源 / 理由</th></tr></thead><tbody id="feedbackRows">${rows}</tbody></table></div><p id="feedbackEmpty" hidden>没有符合筛选条件的评价。</p></section>
  <section class="feedback-panel"><details><summary>查看 ${c.issues} 个来源 Issues 的纳入状态</summary><div class="table-scroll"><table><thead><tr><th>Issue</th><th>账号</th><th>状态</th></tr></thead><tbody>${issueRows}</tbody></table></div></details><p>快照日期：${h(report.snapshotDate)}。之后编辑、关闭或新增的评分，会在题库与榜单的实时构建中更新；本页保留本轮标准校准所用证据。</p></section>
  </main><footer class="site-footer"><a href="./#guide">评分标准 v1.1 →</a><p>记录反馈，保留分歧，按证据修正判断。</p><a href="./#library">返回题库</a></footer><script type="module" src="./feedback.mjs?v=${h(assetVersion)}"></script></body></html>`;
}
