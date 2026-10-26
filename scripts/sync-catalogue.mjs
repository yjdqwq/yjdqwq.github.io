import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { SOURCES, fromCodeforces, fromAtCoder, readLuoguMetadata, acceptImport, retainImport } from './catalogue.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('../.cache/catalogue.json.gz', import.meta.url);
const baseline = new URL('data/catalogue-snapshot.json.gz', root);
const force = process.argv.includes('--force');
const userAgent = 'ProblemNotes/1.1 (+https://github.com/yjdqwq/yjdqwq.github.io)';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function response(url) {
  const r = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}
async function json(url) { return (await response(url)).json(); }
let snapshot = { schema: 1, problems: [], sources: [] };
for (const file of [output, baseline]) {
  try {
    const data = JSON.parse(gunzipSync(await readFile(file)));
    if (data.schema !== 1 || !Array.isArray(data.problems) || !Array.isArray(data.sources)) throw new Error('快照格式错误');
    snapshot = data; break;
  } catch (e) { if (e.code !== 'ENOENT') console.warn(`快照读取失败：${e.message}`); }
}
for (const source of SOURCES) {
  const previous = snapshot.sources.find(s => s.id === source.id);
  // Failed requests back off as well; issue edits never trigger a burst of retries.
  if (!force && previous?.attemptedAt && Date.now() - Date.parse(previous.attemptedAt) < 24 * 3600000) {
    console.log(`${source.platform}: using snapshot (${previous.count} problems)`); continue;
  }
  try {
    let problems;
    if (source.id === 'codeforces') {
      const data = await json(source.endpoint);
      await delay(2200); // Official API: at most one request per two seconds.
      let contests = [];
      try { const c = await json('https://codeforces.com/api/contest.list?gym=false'); if (c.status === 'OK' && Array.isArray(c.result)) contests = c.result; } catch (e) { console.warn(`CF 比赛名称暂不可用：${e.message}`); }
      problems = fromCodeforces(data, contests);
    } else if (source.id === 'atcoder') {
      const data = await json(source.endpoint);
      await delay(1200); // AtCoder Problems asks for more than one second between requests.
      let contests = [];
      try { contests = await json('https://kenkoooo.com/atcoder/resources/contests.json'); } catch (e) { console.warn(`AtCoder 比赛名称暂不可用：${e.message}`); }
      problems = fromAtCoder(data, contests);
    } else {
      const r = await response(source.endpoint);
      problems = await readLuoguMetadata(Readable.fromWeb(r.body));
    }
    snapshot = acceptImport(snapshot, source, problems);
    console.log(`${source.platform}: imported ${problems.length} problems`);
  } catch (error) {
    snapshot = retainImport(snapshot, source, error);
    console.warn(`${source.platform}: ${error.message}; kept previous snapshot`);
  }
}
if (!snapshot.problems.length) throw new Error('所有题库均不可用，停止发布。');
await mkdir(new URL('.cache/', root), { recursive: true });
const temp = new URL(`${output.href}.tmp`);
await writeFile(temp, gzipSync(JSON.stringify(snapshot), { level: 9 }));
await rename(temp, output);
console.log(`Catalogue snapshot: ${snapshot.problems.length} problems.`);
