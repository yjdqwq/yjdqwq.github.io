import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseBatchInput, resolveBatch, batchURL, batchCodesFromURL, MAX_BATCH_PROBLEMS } from '../public/batch.mjs';
import { canonicalProblem, validatePayload } from '../public/lib.mjs';
import { selectCatalogue } from '../public/catalogue.mjs';
import { mergeCatalogue } from '../scripts/catalogue.mjs';

test('batch IDs accept Chinese separators, normalize case and deduplicate in first-seen order', () => {
  const p = parseBatchInput('p1081，P1343\ncf985f; B3607 / P1081');
  assert.deepEqual(p.codes, ['P1081', 'P1343', 'CF985F', 'B3607']);
  assert.equal(p.duplicates, 1); assert.deepEqual(p.errors, []);
});
test('adjacent Markdown links are read once and their titles are never treated as IDs', () => {
  const p = parseBatchInput('[B3607](https://www.luogu.com.cn/problem/B3607 "[图论 P9999] 网络流_2")[P1081](https://www.luogu.com.cn/problem/P1081 "\\[NOIP 2012] 开车旅行") &#x20; [CF985F](https://www.luogu.com.cn/problem/CF985F "Isomorphic Strings")');
  assert.deepEqual(p.codes, ['B3607', 'P1081', 'CF985F']); assert.equal(p.duplicates, 0);
});
test('invalid and foreign URLs do not silently turn into Luogu IDs', () => {
  const p = parseBatchInput('[P1001](https://evil.example/problem/P1001) https://qoj.ac/problem/1002 P1081x https://user:password@www.luogu.com.cn/problem/P1003 P1343');
  assert.deepEqual(p.codes, ['P1343']); assert.equal(p.errors.length, 4);
  assert.deepEqual(parseBatchInput('P1081x').codes, []);
});
test('Luogu B and CF URLs are rateable and remain Luogu entries', () => {
  for (const code of ['B3607', 'CF985F']) {
    const p = canonicalProblem(`https://www.luogu.com.cn/problem/${code}`);
    assert.equal(p.platform, '洛谷'); assert.equal(p.id, `luogu:${code}`);
    assert.equal(validatePayload({ schema: 1, type: 'problem', problemUrl: p.url, problemTitle: '已核实题名', version: 'public-v1' }).key, `${p.id}@public-v1`);
  }
});
test('unmatched IDs are reported and exact matched IDs retain input order before pagination', () => {
  const make = code => ({ ...canonicalProblem(`https://www.luogu.com.cn/problem/${code}`), key: `luogu:${code}@public-v1`, title: code, source: '', version: 'public-v1' });
  const problems = [make('P10'), make('P1'), make('CF985F'), { ...make('P2'), platform: 'Codeforces' }];
  const resolved = resolveBatch(['P1', 'CF985F', 'P9999'], problems);
  assert.deepEqual(resolved.missing, ['P9999']);
  assert.deepEqual(selectCatalogue(problems, [], { keys: resolved.keys, sort: 'title' }).items.map(x => x.p.code), ['P1', 'CF985F']);
  assert.equal(selectCatalogue(problems, [], { keys: [] }).total, 0);
});
test('bookmark URLs round-trip the ordered list and can clear it without losing other parameters', () => {
  const link = batchURL('https://yjdqwq.github.io/?v=abc#library', ['B3607', 'P1081', 'CF985F']);
  assert.deepEqual(batchCodesFromURL(link).codes, ['B3607', 'P1081', 'CF985F']);
  const clear = batchURL(link, null); assert.equal(new URL(clear).searchParams.get('v'), 'abc'); assert.equal(batchCodesFromURL(clear), null);
});
test('large inputs fail explicitly rather than truncating the list', () => {
  assert.throws(() => parseBatchInput(Array.from({ length: MAX_BATCH_PROBLEMS + 1 }, (_, i) => `P${i + 1}`).join(',')));
  assert.throws(() => parseBatchInput(' '.repeat(100001)));
});
test('P, B and CF IDs resolve together against the saved catalogue and manual additions', async () => {
  const input = 'B3607 P1001 CF985F';
  const snapshot = JSON.parse(gunzipSync(await readFile(new URL('../data/catalogue-snapshot.json.gz', import.meta.url))));
  const seed = JSON.parse(await readFile(new URL('../public/data/catalogue.json', import.meta.url), 'utf8'));
  const p = parseBatchInput(input); assert.equal(p.codes.length, 3);
  const resolved = resolveBatch(p.codes, mergeCatalogue(seed, snapshot.problems));
  assert.deepEqual(resolved.missing, []); assert.equal(resolved.problems.length, 3);
  assert.equal(resolved.problems[0].code, 'B3607'); assert.equal(resolved.problems.at(-1).code, 'CF985F');
  for (const x of resolved.problems) assert.equal(validatePayload({ schema: 1, type: 'problem', problemUrl: x.url, problemTitle: x.title, version: x.version }).key, x.key);
});
