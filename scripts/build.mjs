import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { buildDataset, REPOSITORY, validateAIAnchors } from '../public/lib.mjs';
import { mergeCatalogue } from './catalogue.mjs';
import { bundlePreviewModules } from './preview.mjs';
import { renderAIAnchorPage } from './ai-anchors.mjs';
import { readIssueSnapshot } from './issues.mjs';
import { buildFeedbackReport, renderFeedbackPage } from './feedback.mjs';
const { values: options } = parseArgs({ options: { 'issues-file': { type: 'string' } } });
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const seed = JSON.parse(await readFile(new URL('public/data/catalogue.json', root), 'utf8'));
let snapshot = null;
for (const path of ['.cache/catalogue.json.gz', 'data/catalogue-snapshot.json.gz']) {
  try {
    const value = JSON.parse(gunzipSync(await readFile(new URL(path, root))));
    if (value.schema !== 1 || !Array.isArray(value.problems) || !Array.isArray(value.sources)) throw new Error('题库快照格式不正确');
    snapshot = value; break;
  } catch (error) { if (error.code !== 'ENOENT') console.warn(`题库快照不可用：${error.message}`); }
}
if (!snapshot) throw new Error('题库快照缺失；先运行 npm run sync:catalogue。');
const catalogue = mergeCatalogue(seed, snapshot.problems);
const aiAnchors = validateAIAnchors(JSON.parse(await readFile(new URL('public/data/ai-anchors.json', root), 'utf8')));
const feedbackSnapshot = await readIssueSnapshot(new URL('data/feedback-2026-10-29.json', root));
const feedbackReport = buildFeedbackReport(feedbackSnapshot, aiAnchors);
const feedbackData = buildDataset([], feedbackSnapshot.issues, feedbackSnapshot.downloadedAt);
const indexed = new Set(catalogue.map(p => p.key));
for (const p of aiAnchors.entries) {
  if (!indexed.has(p.key)) { catalogue.push({ id: p.id, key: p.key, code: p.code, platform: p.platform, title: p.title, url: p.url, source: p.contest, version: p.version, tags: [], difficulty: null }); indexed.add(p.key); }
}
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('public/', root), dist, { recursive: true });
let issues = feedbackSnapshot.issues;
if (options['issues-file']) {
  issues = (await readIssueSnapshot(options['issues-file'])).issues;
} else if (process.env.GH_TOKEN) {
  issues = [];
  const repository = process.env.GITHUB_REPOSITORY || REPOSITORY;
  if (repository !== REPOSITORY) throw new Error(`请先在 public/lib.mjs 修改 REPOSITORY；当前是 ${repository}。`);
  for (let page = 1; ; page++) {
    if (page > 100) throw new Error('超过 10000 条 Issue，请扩展分页策略后再发布；不发布截断数据。');
    const res = await fetch(`https://api.github.com/repos/${repository}/issues?state=all&per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}` }
    });
    if (!res.ok) throw new Error(`读取 GitHub Issues 失败：HTTP ${res.status}。`);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error('GitHub Issues 返回格式不正确。');
    issues.push(...batch);
    if (batch.length < 100) break;
  }
}
const data = buildDataset(catalogue, issues);
data.catalogueSources = snapshot.sources;
data.aiAnchors = aiAnchors;
data.calibration = { version: '1.1', snapshotDate: '2026-10-29', reviewedKeys: [...new Set(feedbackData.reviews.filter(r => r.purpose === 'contest').map(r => r.key))] };
await writeFile(new URL('data/ratings.json', dist), JSON.stringify(data));
await writeFile(new URL('data/feedback-calibration.json', dist), JSON.stringify(feedbackReport, null, 2) + '\n');
await writeFile(new URL('data/feedback-source.json', dist), JSON.stringify(feedbackSnapshot, null, 2) + '\n');
await writeFile(new URL('scoring.md', dist), (await readFile(new URL('SCORING.md', root), 'utf8')).replaceAll('(RESEARCH.md)', '(research.md)'));
await cp(new URL('RESEARCH.md', root), new URL('research.md', dist));
const css = await readFile(new URL('public/styles.css', root), 'utf8');
const html = await readFile(new URL('public/index.html', root), 'utf8');
const modulePaths = ['lib.mjs', 'catalogue.mjs', 'batch.mjs', 'app.mjs', 'ai-anchors.mjs', 'feedback.mjs'];
const modules = await Promise.all(modulePaths.map(path => readFile(new URL(`public/${path}`, root), 'utf8')));
const assetVersion = createHash('sha256').update(css + html + modules.join('\n')).digest('hex').slice(0, 12);
// Existing visitors must get the paginated app together with the much larger index.
await writeFile(new URL('index.html', dist), html.replace('./styles.css', `./styles.css?v=${assetVersion}`).replace('./app.mjs', `./app.mjs?v=${assetVersion}`));
for (let i = 0; i < modulePaths.length; i++) {
  await writeFile(new URL(modulePaths[i], dist), modules[i].replace(/from '(\.\/[^']+\.mjs)'/g, `from '$1?v=${assetVersion}'`));
}
await writeFile(new URL('ai-anchors.html', dist), renderAIAnchorPage(aiAnchors, assetVersion, { ...feedbackData, snapshotDate: feedbackSnapshot.snapshotDate }));
await writeFile(new URL('feedback.html', dist), renderFeedbackPage(feedbackReport, assetVersion));
const bundled = bundlePreviewModules(modules.slice(0, 4));
const embeddedData = JSON.stringify(data).replaceAll('<', '\\u003c');
const preview = html
  .replace('<link rel="stylesheet" href="./styles.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="./app.mjs"></script>', `<script>window.PROBLEM_NOTES_PREVIEW_DATA=${embeddedData};</script><script type="module">${bundled.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile(new URL('preview.html', dist), preview);
console.log(`Built ${data.problems.length} problems and ${data.reviews.length} active ratings.`);

