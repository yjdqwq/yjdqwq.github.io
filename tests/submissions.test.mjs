import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, issueBody, parseIssue, buildDataset, prepareSubmissions, MAX_BATCH_REVIEWS, MAX_ISSUE_BODY_BYTES, MAX_ISSUE_URL_LENGTH } from '../public/lib.mjs';

const review = (id = 1001, extra = {}) => ({ schema: 1, type: 'review', problemUrl: `https://www.luogu.com.cn/problem/P${id}`,
  problemTitle: `Problem ${id}`, version: 'public-v1', purpose: 'contest', score: 0, experience: 'independent', ...extra });
const batch = reviews => ({ schema: 1, type: 'review-batch', reviews });
const issue = (number, payload, extra = {}) => ({ number, state: 'open', body: issueBody(payload),
  user: { id: 42, login: 'learner', type: 'User' }, labels: [], created_at: '2026-10-26T01:00:00Z',
  updated_at: `2026-10-26T01:${String(number).padStart(2, '0')}:00Z`, ...extra });

test('score-only and short comments count equally, including a real zero', () => {
  for (const reason of [undefined, '', '  ', '好']) {
    const value = validatePayload(review(1001, { reason }));
    assert.equal(value.reason, reason?.trim() || '');
    assert.equal(buildDataset([], [issue(1, value)]).reviews[0].score, 0);
  }
  assert.throws(() => validatePayload(review(1001, { reason: 'x'.repeat(2001) })));
  assert.throws(() => validatePayload(review(1001, { experience: '' })));
});

test('a compact batch round-trips shared fields and individual overrides', () => {
  const source = batch([review(), review(1002, { score: -4, purpose: 'training', experience: 'editorial', reason: '有价值' })]);
  const parsed = parseIssue(issue(1, source));
  assert.equal(parsed.reviews.length, 2);
  assert.equal(parsed.reviews[0].score, 0);
  assert.equal(parsed.reviews[1].reason, '有价值');
  const data = buildDataset([], [issue(1, source)]);
  assert.equal(data.problems.length, 2);
  assert.equal(data.reviews.length, 2);
  assert.deepEqual(data.reviews.map(r => r.purpose), ['contest', 'training']);
  assert.ok(data.reviews.every(r => r.authorId === 42 && r.issue === 1 && r.type === 'review'));
});

test('batch and legacy single votes deduplicate per author, version and purpose', () => {
  const first = issue(1, batch([review(1001, { score: 3 }), review(1002, { score: 4 })]));
  const newer = issue(2, review(1001, { score: -1 }));
  const data = buildDataset([], [first, newer]);
  assert.equal(data.reviews.length, 2);
  assert.equal(data.reviews.find(r => r.key === 'luogu:P1001@public-v1').score, -1);
  assert.equal(data.reviews.find(r => r.key === 'luogu:P1002@public-v1').score, 4);
  const edited = { ...first, updated_at: '2026-10-26T02:00:00Z' };
  assert.equal(buildDataset([], [edited, newer]).reviews.find(r => r.key === 'luogu:P1001@public-v1').score, 3);
});

test('closing or excluding a batch withdraws its latest votes without reviving old ones', () => {
  const old = issue(1, review(1001, { score: 8 }));
  const latest = issue(2, batch([review(), review(1002)]));
  for (const extra of [{ state: 'closed' }, { labels: [{ name: 'rating:excluded' }] }]) {
    assert.equal(buildDataset([], [old, { ...latest, ...extra }]).reviews.length, 0);
  }
  const newest = issue(3, review(1001, { score: 2 }));
  assert.equal(buildDataset([], [old, { ...latest, state: 'closed' }, newest]).reviews.length, 1);
});

test('malformed, duplicate and oversized batches fail as a whole', () => {
  for (const reviews of [[], [review(), review()], [review(), review(1002, { score: null })], [review(), null]]) {
    assert.throws(() => validatePayload(batch(reviews)));
  }
  assert.throws(() => validatePayload(batch(Array.from({ length: MAX_BATCH_REVIEWS + 1 }, (_, i) => review(i + 1)))));
  const malformed = issue(1, batch([review(), review(1002)]));
  malformed.body = malformed.body.replace('"score":0', '"score":50');
  assert.equal(parseIssue(malformed), null);
  assert.equal(buildDataset([], [malformed]).reviews.length, 0);
});

test('every batch item uses the GitHub identity rather than supplied names', () => {
  const raw = batch([review(1001, { author: 'admin', authorId: 1 }), review(1002)]);
  const data = buildDataset([], [issue(1, raw)]);
  assert.ok(data.reviews.every(r => r.author === 'learner' && r.authorId === 42));
  const bot = issue(1, raw, { user: { id: 1, login: 'bot', type: 'Bot' } });
  assert.equal(buildDataset([], [bot]).reviews.length, 0);
});

test('short submissions are prefilled; long ones use a short URL and copyable body', () => {
  const short = prepareSubmissions(batch([review(), review(1002)]));
  assert.equal(short.length, 1); assert.equal(short[0].manual, false);
  assert.equal(short[0].count, 2);
  assert.equal(new URL(short[0].url).searchParams.get('body'), short[0].body);
  const long = prepareSubmissions(review(1001, { reason: '评'.repeat(2000), spoiler: '解'.repeat(5000) }));
  assert.equal(long.length, 1); assert.equal(long[0].manual, true);
  assert.ok(long[0].url.length < MAX_ISSUE_URL_LENGTH);
  assert.equal(new URL(long[0].url).searchParams.has('body'), false);
  assert.equal(parseIssue({ ...issue(1, review()), body: long[0].body }).reason.length, 2000);
});

test('large batches are split within the body limit without dropping or changing any votes', () => {
  const reviews = Array.from({ length: MAX_BATCH_REVIEWS }, (_, i) => review(i + 1, { reason: '评'.repeat(100) }));
  const parts = prepareSubmissions(batch(reviews));
  assert.ok(parts.length > 1 && parts.length < reviews.length);
  assert.equal(parts.reduce((n, p) => n + p.count, 0), reviews.length);
  assert.ok(parts.every(p => new TextEncoder().encode(p.body).length <= MAX_ISSUE_BODY_BYTES && p.url.length < MAX_ISSUE_URL_LENGTH));
  const issues = parts.map((p, index) => ({ ...issue(index + 1, review()), body: p.body }));
  const data = buildDataset([], issues);
  assert.equal(data.reviews.length, reviews.length);
  assert.equal(new Set(data.reviews.map(r => r.key)).size, reviews.length);
  assert.ok(data.reviews.every(r => r.score === 0 && r.reason === '评'.repeat(100)));
});
