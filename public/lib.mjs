export const REPOSITORY = 'yjdqwq/yjdqwq.github.io';
export const MIN_RANK_VOTES = 5;
export const EXPERIENCES = { independent: '独立完成', editorial: '参考题解并理解' };
export const PURPOSES = { contest: '竞赛体验', training: '学习训练' };
export const TAGS = ['观察有趣', '模型自然', '证明漂亮', '学习路径清楚', '实现负担重', '题意绕', '工具拼装感', '资源设置欠妥'];
export const BANDS = [
  { min: -10, max: -9, label: '极差', text: '有根本性的设计失衡，负担远大于解题收益。' },
  { min: -8, max: -6, label: '很差', text: '严重的设计或体验问题压过了题目本身的价值。' },
  { min: -5, max: -3, label: '较差', text: '有具体缺点，完成成本与获得的洞察不相称。' },
  { min: -2, max: -1, label: '略差', text: '仍有一定价值，但整体体验略逊于同用途的一般题。' },
  { min: 0, max: 0, label: '一般', text: '正常的一道题。可以有观察和优化，尚无明显的额外亮点或失衡。' },
  { min: 1, max: 2, label: '稍好', text: '有具体而有限的亮点，足以抵偿额外的阅读和完成负担。' },
  { min: 3, max: 5, label: '好题', text: '有清楚的结构收益、合理的线索和相称的实现成本。' },
  { min: 6, max: 8, label: '优秀', text: '核心发现与模型结合突出，值得推荐和反复回味。' },
  { min: 9, max: 10, label: '极优秀', text: '在充分理解和比较后，仍属于难得的出色设计。' }
];
export const signed = (value, digits = 0) => { const rounded = Number(Number(value).toFixed(digits)); return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}`; };
export const bandFor = score => BANDS.find(b => Math.round(score) >= b.min && Math.round(score) <= b.max);
export const toneFor = score => score < 0 ? 'negative' : score > 0 ? 'positive' : 'neutral';

export function canonicalProblem(input) {
  let u;
  try { u = new URL(input.trim()); } catch { throw new Error('请输入完整的 https 题目链接。'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('题目链接必须使用 https，且不能包含账号、密码或端口。');
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/$/, '');
  let m;
  if (['luogu.com.cn', 'www.luogu.com.cn'].includes(host) && (m = path.match(/^\/problem\/((?:P|B|T|U)\d+|CF\d+[a-z]\d{0,2})$/i))) {
    const id = m[1].toUpperCase();
    return { id: `luogu:${id}`, code: id, platform: '洛谷', url: `https://www.luogu.com.cn/problem/${id}` };
  }
  if (host === 'qoj.ac' && (m = path.match(/^\/problem\/([1-9]\d*)$/))) {
    return { id: `qoj:${m[1]}`, code: `#${m[1]}`, platform: 'QOJ', url: `https://qoj.ac/problem/${m[1]}` };
  }
  if (['codeforces.com', 'www.codeforces.com'].includes(host) && (m = path.match(/^\/(?:problemset\/problem|contest)\/(\d+)\/(?:problem\/)?([a-z]\d{0,2}|\d{1,2})$/i))) {
    const code = `${m[1]}${/^\d/.test(m[2]) ? '-' : ''}${m[2].toUpperCase()}`;
    return { id: `codeforces:${code}`, code, platform: 'Codeforces', url: `https://codeforces.com/problemset/problem/${m[1]}/${m[2].toUpperCase()}` };
  }
  if (host === 'atcoder.jp' && (m = path.match(/^\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)$/i))) {
    return { id: `atcoder:${m[2]}`, code: m[2], platform: 'AtCoder', url: `https://atcoder.jp/contests/${m[1]}/tasks/${m[2]}` };
  }
  throw new Error('暂支持洛谷 P/B/T/U/CF、QOJ、Codeforces 和 AtCoder 的正式题目链接。');
}

export function validatePayload(raw) {
  if (!raw || raw.schema !== 1 || !['review', 'problem'].includes(raw.type)) throw new Error('无法识别的评分格式。');
  const p = canonicalProblem(raw.problemUrl ?? '');
  const version = raw.version ?? 'public-v1';
  if (!/^[a-z0-9.-]{1,40}$/.test(version)) throw new Error('版本标识须为 1～40 位小写字母、数字、点或连字符。');
  const title = String(raw.problemTitle ?? '').trim();
  if (!title || title.length > 200) throw new Error('题目名称须为 1～200 个字符。');
  const base = { schema: 1, type: raw.type, problemUrl: p.url, problemTitle: title, version, key: `${p.id}@${version}` };
  if (raw.type === 'problem') return base;
  if (!Number.isInteger(raw.score) || raw.score < -10 || raw.score > 10) throw new Error('请选择 -10～10 的整数分；未选择不等于 0 分。');
  if (!Object.hasOwn(EXPERIENCES, raw.experience)) throw new Error('总评分需要独立完成，或参考题解后理解完整做法。');
  if (!Object.hasOwn(PURPOSES, raw.purpose)) throw new Error('请选择评分用途。');
  const reason = String(raw.reason ?? '').trim();
  if (reason.length < 12 || reason.length > 2000) throw new Error('请用 12～2000 个字符说明具体的亮点或问题。');
  const spoiler = String(raw.spoiler ?? '').trim();
  if (spoiler.length > 5000) throw new Error('剧透补充不能超过 5000 个字符。');
  const tags = [...new Set(Array.isArray(raw.tags) ? raw.tags.filter(x => TAGS.includes(x)) : [])].slice(0, 4);
  return { ...base, score: raw.score, experience: raw.experience, purpose: raw.purpose, reason, spoiler, tags };
}

export function issueBody(raw) {
  const p = validatePayload(raw);
  const { key, ...payload } = p;
  return `由题评网页生成。请保留下面的数据块；你可以修改后重新提交。关闭此 Issue 即撤回这条记录。\n\n<!-- problem-notes:v1 -->\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}
export function issueLink(payload) {
  const prefix = payload.type === 'review' ? '评分' : '收录';
  const u = new URL(`https://github.com/${REPOSITORY}/issues/new`);
  u.searchParams.set('title', `[${prefix}] ${payload.problemTitle}`);
  u.searchParams.set('body', issueBody(payload));
  return u.href;
}

export function parseIssue(issue, { includeInactive = false } = {}) {
  if (issue.pull_request || issue.user?.type !== 'User') return null;
  const active = issue.state === 'open' && !issue.labels?.some(l => ['rating:excluded', 'rating:withdrawn'].includes(typeof l === 'string' ? l : l.name));
  if (!active && !includeInactive) return null;
  const body = issue.body ?? '';
  if (!body.includes('<!-- problem-notes:v1 -->') || body.length > 20000) return null;
  const structured = body.slice(body.indexOf('<!-- problem-notes:v1 -->') + '<!-- problem-notes:v1 -->'.length);
  const m = structured.match(/```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```[^\S\r\n]*(?:\r?\n|$)/);
  if (!m) return null;
  try {
    const p = validatePayload(JSON.parse(m[1]));
    if (!Number.isInteger(issue.number) || !Number.isInteger(issue.user.id)) return null;
    const updatedAt = new Date(issue.updated_at).toISOString();
    return { ...p, active, issue: issue.number, author: issue.user.login, authorId: issue.user.id,
      updatedAt, createdAt: new Date(issue.created_at).toISOString(),
      issueUrl: `https://github.com/${REPOSITORY}/issues/${issue.number}` };
  } catch { return null; }
}

export function buildDataset(seed, issues, generatedAt = new Date().toISOString()) {
  const problems = new Map(seed.map(p => [p.key, p]));
  const parsed = issues.map(i => parseIssue(i, { includeInactive: true })).filter(Boolean).sort((a, b) => a.issue - b.issue);
  for (const p of parsed) {
    if (p.active && !problems.has(p.key)) {
      const c = canonicalProblem(p.problemUrl);
      problems.set(p.key, { ...c, key: p.key, title: p.problemTitle, version: p.version, source: '社区收录', tags: [], difficulty: null });
    }
  }
  const latest = new Map();
  for (const p of parsed.filter(x => x.type === 'review')) {
    const k = `${p.key}|${p.purpose}|${p.authorId}`;
    const previous = latest.get(k);
    if (!previous || p.updatedAt > previous.updatedAt || (p.updatedAt === previous.updatedAt && p.issue > previous.issue)) latest.set(k, p);
  }
  return { schema: 1, generatedAt, source: 'github-issues', repository: REPOSITORY,
    problems: [...problems.values()], reviews: [...latest.values()].filter(p => p.active && problems.has(p.key)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
}

export function summarize(reviews) {
  if (!reviews.length) return { n: 0, mean: null, median: null, spread: null, histogram: Array(21).fill(0) };
  const a = reviews.map(r => r.score).sort((x, y) => x - y);
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  const mid = Math.floor(a.length / 2);
  return { n: a.length, mean, median: a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2,
    spread: Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / a.length),
    histogram: Array.from({ length: 21 }, (_, i) => a.filter(x => x === i - 10).length) };
}

