import { writeFile } from 'node:fs/promises';
import { readIssueSnapshot, auditIssues } from './issues.mjs';

const path = process.argv[2];
if (!path || process.argv.length !== 3 || !/\.json$/i.test(path)) throw new Error('用法：npm run audit:issues -- path/to/issues.json');
const snapshot = await readIssueSnapshot(path);
const { report, dataset } = auditIssues(snapshot);
const prefix = path.replace(/\.json$/i, '');
const reportPath = `${prefix}.audit.json`, ratingsPath = `${prefix}.ratings.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
await writeFile(ratingsPath, JSON.stringify(dataset, null, 2) + '\n');
console.log(JSON.stringify({ issueCount: report.issueCount, includedIssues: report.included.length, inactiveIssues: report.inactive.length,
  invalidIssues: report.invalid.length, effectiveRatings: report.effectiveRatings, uniqueProblems: report.uniqueProblems,
  purposes: report.purposes, zeroScores: report.zeroScores, scoreOnly: report.scoreOnly, reportPath, ratingsPath }, null, 2));
