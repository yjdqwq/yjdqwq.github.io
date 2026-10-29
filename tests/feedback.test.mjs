import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFeedbackReport, renderFeedbackPage } from '../scripts/feedback.mjs';
import { validateAIAnchors } from '../public/lib.mjs';

const snapshot = JSON.parse(await readFile(new URL('../data/feedback-2026-10-29.json', import.meta.url)));
const anchors = validateAIAnchors(JSON.parse(await readFile(new URL('../public/data/ai-anchors.json', import.meta.url))));
const report = buildFeedbackReport(snapshot, anchors);

test('feedback snapshot uses batch inheritance, latest votes, and withdrawn status', () => {
  assert.deepEqual(report.counts, { issues: 18, includedIssues: 17, closedIssues: 1, submittedRatings: 184, effectiveRatings: 179, replacedOrWithdrawnRatings: 5, uniqueProblems: 169, authors: 4, withReasons: 12, scoreOnly: 167, zeroScores: 61 });
  assert.deepEqual(report.purposes, { contest: 178, training: 1 });
  assert.equal(report.issues.find(i => i.number === 16).status, 'closed-unreadable');
  assert.equal(report.reviews.some(r => r.issue === 16), false);
  assert.equal(report.reviews.some(r => r.issue === 4 && r.experience === 'editorial'), true);
  assert.equal(report.reviews.filter(r => r.key === 'luogu:P14364@public-v1' && r.author === 'sxmqwq').length, 1);
  assert.equal(report.reviews.find(r => r.key === 'luogu:P14364@public-v1' && r.author === 'sxmqwq').issue, 17);
});

test('AI comparisons do not mutate historical AI or create human votes and match purpose/version', () => {
  const before = JSON.stringify(anchors);
  const extra = { ...anchors, entries: [...anchors.entries, { key: 'luogu:P6908@public-v1', score: 8 }, { key: 'luogu:P2048@revised-v2', score: 10 }] };
  const compared = buildFeedbackReport(snapshot, extra);
  assert.equal(compared.reviews.length, 179);
  assert.equal(compared.comparisons.some(row => row.key === 'luogu:P6908@public-v1'), false);
  assert.equal(compared.comparisons.some(row => row.key === 'luogu:P2048@public-v1'), false);
  assert.equal(JSON.stringify(anchors), before);
  assert.equal(compared.histogram.reduce((a, b) => a + b), 179);
});

test('feedback page preserves literal reason text without rendering untrusted HTML', () => {
  const copy = structuredClone(report);
  copy.reviews[0].reason = '<script>alert(1)</script> "quote"';
  copy.reviews[0].problemTitle = '<img src=x onerror=alert(1)>';
  const page = renderFeedbackPage(copy, 'test');
  assert.ok(page.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.doesNotMatch(page, /<script>alert|<img src=x/);
  assert.ok(page.includes('仅有分数，原因未知'));
  assert.ok(page.includes('不是盲评'));
  assert.ok(page.includes('正文为空'));
});
