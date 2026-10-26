import { canonicalProblem } from './lib.mjs';

export const MAX_BATCH_PROBLEMS = 500;
const luoguCodePattern = /^(?:[PBTU]\d+|CF\d+[A-Z]\d{0,2})$/i;

export function parseBatchInput(input) {
  if (typeof input !== 'string' || input.length > 100000) throw new Error('清单不能超过 100000 个字符。');
  const events = [];
  let remaining = input;
  const mask = (match, offset) => ' '.repeat(match.length);
  // Mask the entire Markdown link, including its title, so titles never create extra IDs.
  remaining = remaining.replace(/\[[^\[\]\r\n]*\]\((https?:\/\/[^\s<>"')]+)(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?\s*\)/gi,
    (match, url, offset) => { events.push({ index: offset, url }); return mask(match, offset); });
  remaining = remaining.replace(/https?:\/\/[^\s<>"')\]]+/gi, (match, offset) => {
    events.push({ index: offset, url: match.replace(/[，,；;。.!?]+$/, '') }); return mask(match, offset);
  });
  for (const match of remaining.matchAll(/(?<![a-z0-9_])(?:CF\d+[A-Z]\d{0,2}|[PBTU]\d+)(?![a-z0-9_])/gi)) events.push({ index: match.index, code: match[0] });
  const codes = []; const seen = new Set(); const errors = []; let duplicates = 0;
  for (const event of events.sort((a, b) => a.index - b.index)) {
    let code;
    try {
      if (event.url) {
        const p = canonicalProblem(event.url);
        if (p.platform !== '洛谷') throw new Error('批量题号清单请使用洛谷链接。');
        code = p.code;
      } else code = event.code.toUpperCase();
      if (!luoguCodePattern.test(code)) throw new Error('暂支持洛谷 P、B、T、U 和 CF 题号。');
    } catch (error) { errors.push({ token: event.url || event.code, message: error.message }); continue; }
    if (seen.has(code)) { duplicates++; continue; }
    seen.add(code); codes.push(code);
    if (codes.length > MAX_BATCH_PROBLEMS) throw new Error(`一次最多输入 ${MAX_BATCH_PROBLEMS} 道不同题目。`);
  }
  // Report malformed code-like tokens instead of partially interpreting e.g. P1081x.
  const malformed = remaining.match(/(?<![a-z0-9_])(?:CF|[PBTU])\d+[a-z0-9_-]*(?![a-z0-9_])/gi) || [];
  for (const token of malformed) if (!luoguCodePattern.test(token)) errors.push({ token, message: '题号格式无法识别。' });
  return { codes, duplicates, errors };
}

export function resolveBatch(codes, catalogue) {
  const byCode = new Map();
  for (const p of catalogue) {
    if (p.platform !== '洛谷') continue;
    if (!byCode.has(p.code) || p.version === 'public-v1') byCode.set(p.code, p);
  }
  const problems = []; const missing = [];
  for (const code of codes) { const p = byCode.get(code); if (p) problems.push(p); else missing.push(code); }
  return { problems, keys: problems.map(p => p.key), missing };
}

export function batchCodesFromURL(url) {
  const value = new URL(url).searchParams.get('list');
  return value === null ? null : parseBatchInput(value);
}

export function batchURL(url, codes) {
  const u = new URL(url);
  if (codes?.length) u.searchParams.set('list', codes.join(',')); else u.searchParams.delete('list');
  return u.href;
}
