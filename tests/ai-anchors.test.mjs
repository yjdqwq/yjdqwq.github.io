import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { validateAIAnchors, buildDataset, summarize } from '../public/lib.mjs';
import { selectCatalogue } from '../public/catalogue.mjs';
import { renderAIAnchorPage } from '../scripts/ai-anchors.mjs';

const raw = JSON.parse(await readFile(new URL('../public/data/ai-anchors.json', import.meta.url), 'utf8'));
const anchors = validateAIAnchors(raw);

test('AI reference coverage includes all indexed official contests in the requested years', async () => {
  const snapshot = JSON.parse(gunzipSync(await readFile(new URL('../data/catalogue-snapshot.json.gz', import.meta.url))));
  const scope = /^\[(?:(?:CSP-[JS]|NOIP|NOI|IOI|APIO|WC(?:\/CTS)?|AHOI|ZJOI|SNOI|LNOI|SDOI\/SXOI)\s*202[2-6]|省选联考 202[2-6]|CSP-J 2022 山东)\]/;
  const selected = snapshot.problems.filter(p => p.platform === '洛谷' && scope.test(p.title));
  const keys = new Set(anchors.entries.map(p => p.key));
  for (const problem of selected) assert.ok(keys.has(problem.key), `Missing ${problem.code}`);
  assert.ok(keys.has('luogu:P8077@public-v1'), 'WC2022 task without local judge data is still included');
  assert.equal(anchors.entries.length, 206);
  assert.equal(anchors.entries.filter(p => p.contest === 'APIO 2026 中国赛区').length, 3);
  assert.equal(anchors.entries.some(p => p.year === 2026 && ['CSP-J', 'CSP-S', 'NOIP'].includes(p.family)), false);
  assert.equal(anchors.entries.filter(p => p.contest === 'IOI 2025').length, 7, 'The split Triples entries are both indexed');
});

test('AI scores never supply human votes, means, or ranking eligibility', () => {
  const dataset = buildDataset(anchors.entries, []);
  assert.equal(dataset.reviews.length, 0);
  assert.equal(summarize(dataset.reviews).mean, null);
  assert.equal(selectCatalogue(dataset.problems, dataset.reviews, { mode: 'rank' }).total, 0);
});

test('AI references reject missing scores, duplicate IDs, out-of-scope years and unsafe URLs', () => {
  for (const change of [{ score: null }, { score: 11 }, { year: 2027 }, { problemUrl: 'javascript:alert(1)' }, { confidence: 'verified-ac' }, { sourceUrls: ['javascript:alert(1)'] }]) {
    assert.throws(() => validateAIAnchors({ ...raw, entries: [{ ...raw.entries[0], ...change }] }));
  }
  assert.throws(() => validateAIAnchors({ ...raw, entries: [raw.entries[0], raw.entries[0]] }));
});

test('shareable AI pages include static scores, source notes and escaped untrusted text', () => {
  const data = { ...anchors, entries: [{ ...anchors.entries[0], title: '<img src=x onerror=alert(1)>', reason: '<script>alert(1)</script>' }] };
  const page = renderAIAnchorPage(data, 'version');
  assert.ok(page.includes('&lt;img'));
  assert.ok(page.includes('&lt;script&gt;'));
  assert.ok(page.includes('data-score='));
  assert.ok(page.includes('不计入真人均分'));
  assert.ok(page.includes('2026-10-31'));
  assert.doesNotMatch(page, /<img src=x|<script>alert/);
});
