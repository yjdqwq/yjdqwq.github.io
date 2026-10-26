import { canonicalProblem } from '../public/lib.mjs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

export const SOURCES = [
  { id: 'luogu', platform: '洛谷', label: '洛谷官方主题库导出', url: 'https://docs.lgapi.cn/open/judge/', endpoint: 'https://cdn.luogu.com.cn/problemset-open/latest.ndjson.gz' },
  { id: 'codeforces', platform: 'Codeforces', label: 'Codeforces 官方 API', url: 'https://codeforces.com/apiHelp/methods#problemset.problems', endpoint: 'https://codeforces.com/api/problemset.problems' },
  { id: 'atcoder', platform: 'AtCoder', label: 'AtCoder Problems 社区索引', url: 'https://github.com/kenkoooo/AtCoderProblems/blob/main/doc/api.md', endpoint: 'https://kenkoooo.com/atcoder/resources/problems.json' }
];
const LUOGU_DIFFICULTIES = [null, '入门', '普及−', '普及', '普及+/提高−', '提高', '提高+/省选−', '省选/NOI−', 'NOI/NOI+/CTS'];
function text(value, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('题库元数据的文字字段不合法。');
  return value.trim();
}
function problem(url, title, source, difficulty = null) {
  const p = canonicalProblem(url);
  return { ...p, key: `${p.id}@public-v1`, title: text(title), source: text(source, 300), version: 'public-v1', tags: [], difficulty };
}
export function fromCodeforces(data, contests = []) {
  if (data?.status !== 'OK' || !Array.isArray(data.result?.problems)) throw new Error('Codeforces API 未返回完整题库。');
  const names = new Map(contests.map(c => [c.id, c.name]));
  return data.result.problems.map(p => {
    if (!Number.isSafeInteger(p.contestId) || p.contestId < 1 || !/^(?:[A-Z]\d{0,2}|\d{1,2})$/i.test(p.index)) throw new Error('Codeforces 题号格式变化。');
    return problem(`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`, p.name, names.get(p.contestId) || `Codeforces Contest ${p.contestId}`, Number.isInteger(p.rating) ? `CF ${p.rating}` : null);
  });
}
export function fromAtCoder(data, contests = []) {
  if (!Array.isArray(data)) throw new Error('AtCoder Problems 未返回题库数组。');
  const names = new Map(contests.map(c => [c.id, c.title]));
  return data.map(p => {
    if (!/^[a-z0-9_-]+$/i.test(p.contest_id) || !/^[a-z0-9_-]+$/i.test(p.id)) throw new Error('AtCoder 题号格式变化。');
    const prefix = p.id.slice(0, p.id.lastIndexOf('_'));
    const contest = [prefix, prefix.replaceAll('_', '-'), p.contest_id].find(id => names.has(id)) || p.contest_id;
    return problem(`https://atcoder.jp/contests/${contest}/tasks/${p.id}`, p.name, names.get(contest) || contest);
  });
}
export function fromLuoguRow(p) {
  if (p.type !== 'P') return null;
  if (!/^P\d+$/.test(p.pid)) throw new Error('洛谷主题库题号格式变化。');
  const title = text(p.title);
  return problem(`https://www.luogu.com.cn/problem/${p.pid}`, title, title.match(/^\[([^\]]+)\]/)?.[1] || '洛谷主题库', LUOGU_DIFFICULTIES[p.difficulty] ?? null);
}
export async function readLuoguMetadata(compressed) {
  const problems = [];
  await pipeline(compressed, createGunzip(), async source => {
    const decoder = new StringDecoder('utf8'); let pending = ''; let bytes = 0;
    const row = line => {
      if (!line.trim()) return;
      if (line.length > 5000000) throw new Error('题库单条记录异常过大');
      const p = fromLuoguRow(JSON.parse(line)); if (p) problems.push(p);
    };
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > 512 * 1024 * 1024) throw new Error('题库导出文件异常过大');
      pending += decoder.write(chunk);
      let end;
      while ((end = pending.indexOf('\n')) !== -1) { row(pending.slice(0, end)); pending = pending.slice(end + 1); }
      if (pending.length > 5000000) throw new Error('题库单条记录异常过大');
    }
    row(pending + decoder.end());
  });
  return problems;
}
export function mergeCatalogue(seed, imported) {
  const map = new Map(imported.map(p => [p.key, p]));
  for (const p of seed) map.set(p.key, { ...map.get(p.key), ...p, difficulty: map.get(p.key)?.difficulty ?? p.difficulty });
  // Keep the original entry points first, then the full imported index.
  return [...seed.map(p => map.get(p.key)), ...[...map.values()].filter(p => !seed.some(s => s.key === p.key))];
}
export function acceptImport(previous, source, problems, now = new Date().toISOString()) {
  if (!Array.isArray(problems) || problems.length < 1000) throw new Error(`${source.platform} 返回题目过少，拒绝覆盖已有快照。`);
  const unique = new Map(problems.map(p => [p.key, p]));
  if (unique.size !== problems.length) throw new Error(`${source.platform} 返回重复题号，拒绝覆盖。`);
  const old = previous.problems.filter(p => p.platform === source.platform);
  if (problems.length < old.length * 0.8) throw new Error(`${source.platform} 题库数量异常下降，保留旧快照。`);
  return {
    schema: 1,
    problems: [...previous.problems.filter(p => p.platform !== source.platform), ...problems],
    sources: [...previous.sources.filter(s => s.id !== source.id), { id: source.id, platform: source.platform, label: source.label, url: source.url, count: problems.length, updatedAt: now, attemptedAt: now, status: 'ready' }]
  };
}
export function retainImport(previous, source, error, now = new Date().toISOString()) {
  const old = previous.sources.find(s => s.id === source.id);
  return { ...previous, sources: [...previous.sources.filter(s => s.id !== source.id), {
    ...old, id: source.id, platform: source.platform, label: source.label, url: source.url,
    count: previous.problems.filter(p => p.platform === source.platform).length,
    updatedAt: old?.updatedAt ?? null, attemptedAt: now, status: 'stale', error: String(error.message).slice(0, 300)
  }] };
}
