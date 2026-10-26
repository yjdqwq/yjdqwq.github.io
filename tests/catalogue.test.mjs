import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { fromCodeforces, fromAtCoder, fromLuoguRow, readLuoguMetadata, mergeCatalogue, acceptImport, retainImport, SOURCES } from '../scripts/catalogue.mjs';
import { canonicalProblem, validatePayload } from '../public/lib.mjs';
import { selectCatalogue } from '../public/catalogue.mjs';

const row = (n, title = `测试题 ${n}`) => fromLuoguRow({ type: 'P', pid: `P${n}`, title, difficulty: 1 });
const empty = () => ({ schema: 1, problems: [], sources: [] });
test('official metadata produces canonical, rateable entries, including unusual CF indices', () => {
  const cf = fromCodeforces({ status: 'OK', result: { problems: [
    { contestId: 4, index: 'A', name: 'Watermelon', rating: 800 },
    { contestId: 123, index: 'D10', name: 'Part 10' },
    { contestId: 123, index: '01', name: 'Numeric index' }
  ] } }, [{ id: 4, name: 'Codeforces Beta Round 4' }]);
  assert.equal(cf[0].id, 'codeforces:4A');
  assert.equal(cf[0].difficulty, 'CF 800');
  assert.equal(cf[1].id, canonicalProblem('https://codeforces.com/contest/123/problem/D10').id);
  assert.equal(cf[2].id, 'codeforces:123-01');
  assert.equal(new Set(cf.map(p => p.key)).size, 3);
  const ac = fromAtCoder([{ id: 'abc350_a', contest_id: 'adt_easy_20261025', name: 'Past ABCs' }], [{ id: 'abc350', title: 'AtCoder Beginner Contest 350' }, { id: 'adt_easy_20261025', title: 'Daily Training' }]);
  assert.equal(ac[0].source, 'AtCoder Beginner Contest 350');
  assert.equal(ac[0].url, 'https://atcoder.jp/contests/abc350/tasks/abc350_a');
  assert.equal(ac[0].id, canonicalProblem('https://atcoder.jp/contests/adt_easy_20261025/tasks/abc350_a').id);
  for (const p of [...cf, ...ac, row(1001)]) assert.equal(validatePayload({ schema: 1, type: 'problem', problemUrl: p.url, problemTitle: p.title, version: p.version }).key, p.key);
  assert.throws(() => fromCodeforces({ status: 'FAILED', comment: 'limit' }));
  assert.throws(() => fromAtCoder([{ id: '../x', contest_id: 'abc350', name: 'Bad path' }]));
});
test('Luogu import retains metadata and streams UTF-8 safely; truncated feeds fail', async () => {
  const feed = [{ type: 'P', pid: 'P1001', title: '测试中文题名', difficulty: 1, description: '题面正文不进入索引' },
    { type: 'CF', pid: 'CF4A', title: 'Remote problem' }, { type: 'P', pid: 'P1002', title: '[NOIP 2002] 过河卒', difficulty: 2 }];
  const bytes = gzipSync(feed.map(p => JSON.stringify(p)).join('\n'));
  const records = await readLuoguMetadata(Readable.from([...bytes].map(x => Buffer.from([x]))));
  assert.equal(records.length, 2); assert.equal(records[0].title, '测试中文题名');
  assert.equal(records[1].source, 'NOIP 2002'); assert.equal(records[0].description, undefined);
  await assert.rejects(readLuoguMetadata(Readable.from([bytes.subarray(0, bytes.length - 10)])));
  await assert.rejects(readLuoguMetadata(Readable.from([gzipSync('{invalid json}\n')])));
});
test('imports merge without changing original keys or creating duplicate versions', () => {
  const imported = row(1001, '新标题'); const manual = { ...row(1001, '原入口'), difficulty: null, source: '原来源' };
  const merged = mergeCatalogue([manual], [imported, row(1002)]);
  assert.equal(merged.length, 2); assert.equal(merged[0].key, manual.key);
  assert.equal(merged[0].title, '原入口'); assert.equal(merged[0].difficulty, '入门');
});
test('partial, duplicate and suddenly shrinking imports never replace complete snapshots', () => {
  const source = SOURCES.find(s => s.id === 'luogu');
  const first = acceptImport(empty(), source, Array.from({ length: 1500 }, (_, i) => row(1000 + i)), '2026-10-25T00:00:00Z');
  assert.throws(() => acceptImport(first, source, [row(1001)]));
  assert.throws(() => acceptImport(first, source, Array(1500).fill(row(1001))));
  assert.throws(() => acceptImport(first, source, Array.from({ length: 1000 }, (_, i) => row(1000 + i))));
  const retained = retainImport(first, source, new Error('HTTP 503'), '2026-10-26T00:00:00Z');
  assert.equal(retained.problems, first.problems);
  assert.equal(retained.sources[0].updatedAt, '2026-10-25T00:00:00Z');
  assert.equal(retained.sources[0].attemptedAt, '2026-10-26T00:00:00Z');
  assert.equal(retained.sources[0].status, 'stale');
});
test('pagination covers every result once and clamps pages after filtering', () => {
  const problems = Array.from({ length: 76 }, (_, i) => row(1000 + i));
  const all = [];
  for (let page = 1; page <= 4; page++) all.push(...selectCatalogue(problems, [], { page }).items.map(x => x.p.key));
  assert.equal(all.length, 76); assert.equal(new Set(all).size, 76);
  const last = selectCatalogue(problems, [], { page: 500 });
  assert.equal(last.page, 4); assert.equal(last.first, 76); assert.equal(last.last, 76);
  assert.equal(selectCatalogue(problems, [], { query: '不存在', page: 500 }).page, 1);
  assert.equal(selectCatalogue(problems, [], { pageSize: 50 }).items.length, 50);
});
test('search, favorites and rating scopes apply before pagination', () => {
  const a = row(1001, '前缀 数据结构'); const b = row(1002, '另一道题');
  const reviews = [
    ...Array.from({ length: 5 }, () => ({ key: a.key, score: 0, purpose: 'contest', experience: 'independent' })),
    { key: b.key, score: 10, purpose: 'training', experience: 'editorial' }
  ];
  assert.equal(selectCatalogue([a, b], reviews, { query: 'LG P1001 数据' }).total, 1);
  assert.equal(selectCatalogue([a, b], reviews, { platform: 'QOJ' }).total, 0);
  const rank = selectCatalogue([a, b], reviews, { mode: 'rank' });
  assert.equal(rank.total, 1); assert.equal(rank.items[0].s.mean, 0);
  assert.equal(selectCatalogue([a, b], reviews, { purpose: 'training', independentOnly: true }).items[1].s.mean, null);
  assert.equal(selectCatalogue([a, b], reviews, { favoritesOnly: true, favorites: new Set([b.key]) }).items[0].p.key, b.key);
});
