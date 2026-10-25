import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProblem, validatePayload, issueBody, parseIssue, buildDataset, summarize, issueLink } from '../public/lib.mjs';
const payload = { schema: 1, type: 'review', problemUrl: 'https://www.luogu.com.cn/problem/P1001', problemTitle: 'A+B Problem', version: 'public-v1', purpose: 'training', score: 0, experience: 'independent', reason: '题意清楚，适合用来学习最初的输入与输出。', tags: ['模型自然'] };
const issue = (number, score = 0, extra = {}) => ({ number, state: 'open', body: issueBody({ ...payload, score }), user: { id: 42, login: 'learner', type: 'User' }, created_at: '2026-10-25T10:00:00Z', updated_at: `2026-10-25T10:${String(number).padStart(2, '0')}:00Z`, labels: [], ...extra });
test('unrated is distinct from a genuine zero score', () => {
  assert.equal(summarize([]).mean, null);
  assert.equal(summarize([{ score: 0 }]).mean, 0);
  assert.throws(() => validatePayload({ ...payload, score: null }));
});
test('the same account counts once; latest edit wins', () => {
  const data = buildDataset([], [issue(1, 5), issue(2, -2)]);
  assert.equal(data.reviews.length, 1);
  assert.equal(data.reviews[0].score, -2);
  const edited = issue(1, 3, { updated_at: '2026-10-25T11:00:00Z' });
  assert.equal(buildDataset([], [edited, issue(2, -2)]).reviews[0].score, 3);
});
test('purposes and revisions do not mix', () => {
  const b = issue(2, 1, { body: issueBody({ ...payload, purpose: 'contest', score: 1 }) });
  const c = issue(3, 2, { body: issueBody({ ...payload, version: 'revised-v2', score: 2 }) });
  assert.equal(buildDataset([], [issue(1), b, c]).reviews.length, 3);
});
test('withdrawing the latest record does not resurrect an older vote', () => {
  const closed = issue(2, -2, { state: 'closed' });
  assert.equal(buildDataset([], [issue(1, 7), closed]).reviews.length, 0);
  const excluded = issue(2, -2, { labels: [{ name: 'rating:excluded' }] });
  assert.equal(buildDataset([], [issue(1, 7), excluded]).reviews.length, 0);
});
test('closed, moderated, bot and pull-request records do not vote', () => {
  assert.equal(parseIssue(issue(1, 0, { state: 'closed' })), null);
  assert.equal(parseIssue(issue(1, 0, { labels: [{ name: 'rating:excluded' }] })), null);
  assert.equal(parseIssue(issue(1, 0, { user: { id: 1, login: 'bot', type: 'Bot' } })), null);
  assert.equal(parseIssue(issue(1, 0, { pull_request: {} })), null);
});
test('identity comes from GitHub metadata, never from the body', () => {
  const x = issue(1, 1, { body: '<!-- problem-notes:v1 -->\n```json\n' + JSON.stringify({ ...payload, author: 'admin', authorId: 1 }) + '\n```' });
  assert.equal(parseIssue(x).author, 'learner');
  assert.equal(parseIssue(x).authorId, 42);
});
test('unsafe URLs, malformed payloads and out-of-range scores are rejected', () => {
  for (const url of ['javascript:alert(1)', 'https://qoj.ac.evil.org/problem/1', 'https://u:p@qoj.ac/problem/1', 'http://qoj.ac/problem/1']) assert.throws(() => canonicalProblem(url));
  for (const score of [-11, 11, 1.5, '2']) assert.throws(() => validatePayload({ ...payload, score }));
  assert.throws(() => validatePayload({ ...payload, experience: 'read' }));
  assert.equal(parseIssue(issue(1, 0, { body: '<!-- problem-notes:v1 -->\n```json\n{bad}\n```' })), null);
});
test('canonical URLs merge query variants and Codeforces routes', () => {
  assert.equal(canonicalProblem('https://luogu.com.cn/problem/p1001/?x=1#x').id, 'luogu:P1001');
  assert.equal(canonicalProblem('https://codeforces.com/contest/4/problem/A').id, canonicalProblem('https://codeforces.com/problemset/problem/4/A').id);
});
test('mean, median and full distribution preserve disagreement', () => {
  const s = summarize([{ score: -10 }, { score: 0 }, { score: 4 }, { score: 10 }]);
  assert.equal(s.mean, 1); assert.equal(s.median, 2); assert.equal(s.histogram.reduce((a,b)=>a+b), 4);
});
test('review links are explicit GitHub submissions with round-trippable data', () => {
  const u = new URL(issueLink(payload));
  assert.equal(u.hostname, 'github.com');
  assert.match(u.searchParams.get('body'), /problem-notes:v1/);
  assert.equal(parseIssue(issue(1, 0, { body: u.searchParams.get('body') })).score, 0);
});
test('code fences and HTML in a review remain text data', () => {
  const p = { ...payload, reason: '这个关键观察可以通过以下代码表达：```cpp\nif(a<b)\n```', spoiler: '<img src=x onerror=alert(1)>' };
  const r = parseIssue(issue(1, 0, { body: issueBody(p) }));
  assert.equal(r.reason, p.reason);
  assert.equal(r.spoiler, p.spoiler);
});
