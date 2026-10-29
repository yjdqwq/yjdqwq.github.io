import { readFile } from 'node:fs/promises';
import { buildDataset, parseIssue, REPOSITORY, summarize } from '../public/lib.mjs';

export async function readIssueSnapshot(path) {
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  if (snapshot?.repository !== REPOSITORY || !Array.isArray(snapshot.issues)) throw new Error('Issue 快照须包含本站 repository 与完整 issues 数组。');
  const seen = new Set();
  for (const issue of snapshot.issues) {
    if (!issue || !Number.isInteger(issue.number) || seen.has(issue.number)) throw new Error('Issue 快照含有无效或重复编号。');
    seen.add(issue.number);
  }
  return snapshot;
}

export function auditIssues(snapshot) {
  const included = [], inactive = [], invalid = [], ignored = [];
  let submittedRatings = 0;
  for (const issue of snapshot.issues) {
    const record = { issue: issue.number, title: issue.title, author: issue.user?.login, url: `https://github.com/${REPOSITORY}/issues/${issue.number}` };
    if (issue.pull_request) { ignored.push({ ...record, reason: 'pull-request' }); continue; }
    const parsed = parseIssue(issue, { includeInactive: true });
    if (!parsed) { invalid.push({ ...record, reason: 'not-a-valid-rating-payload' }); continue; }
    const count = parsed.type === 'review-batch' ? parsed.reviews.length : parsed.type === 'review' ? 1 : 0;
    const details = { ...record, type: parsed.type, count };
    if (parsed.active) { included.push(details); submittedRatings += count; }
    else inactive.push({ ...details, reason: issue.state === 'closed' ? 'closed' : 'excluded-or-withdrawn' });
  }
  const dataset = buildDataset([], snapshot.issues, snapshot.downloadedAt || new Date().toISOString());
  const grouped = new Map();
  for (const review of dataset.reviews) {
    const key = `${review.key}|${review.purpose}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(review);
  }
  const summaries = [...grouped.values()].map(reviews => ({
    key: reviews[0].key, problemUrl: reviews[0].problemUrl, title: reviews[0].problemTitle, purpose: reviews[0].purpose,
    ...summarize(reviews), ratings: reviews.map(r => ({ author: r.author, authorId: r.authorId, score: r.score, experience: r.experience, issue: r.issue, issueUrl: r.issueUrl }))
  })).sort((a, b) => a.purpose.localeCompare(b.purpose) || b.mean - a.mean || a.key.localeCompare(b.key, 'en', { numeric: true }));
  const report = {
    schema: 1, repository: REPOSITORY, downloadedAt: snapshot.downloadedAt,
    issueCount: snapshot.issues.length, included, inactive, invalid, ignored,
    submittedRatings, effectiveRatings: dataset.reviews.length, uniqueProblems: new Set(dataset.reviews.map(r => r.key)).size,
    authors: Object.fromEntries([...new Set(dataset.reviews.map(r => r.author))].map(author => [author, dataset.reviews.filter(r => r.author === author).length])),
    purposes: Object.fromEntries(['contest', 'training'].map(purpose => [purpose, dataset.reviews.filter(r => r.purpose === purpose).length])),
    zeroScores: dataset.reviews.filter(r => r.score === 0).length, scoreOnly: dataset.reviews.filter(r => !r.reason).length,
    multipleRaters: summaries.filter(p => p.n > 1), summaries
  };
  return { report, dataset };
}
