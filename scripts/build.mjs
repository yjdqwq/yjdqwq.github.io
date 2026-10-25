import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { buildDataset, REPOSITORY } from '../public/lib.mjs';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const catalogue = JSON.parse(await readFile(new URL('public/data/catalogue.json', root), 'utf8'));
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('public/', root), dist, { recursive: true });
let issues = [];
if (process.env.GH_TOKEN) {
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
await writeFile(new URL('data/ratings.json', dist), JSON.stringify(data));
await writeFile(new URL('scoring.md', dist), (await readFile(new URL('SCORING.md', root), 'utf8')).replaceAll('(RESEARCH.md)', '(research.md)'));
await cp(new URL('RESEARCH.md', root), new URL('research.md', dist));
const css = await readFile(new URL('public/styles.css', root), 'utf8');
const lib = (await readFile(new URL('public/lib.mjs', root), 'utf8')).replace(/^export /gm, '');
const app = (await readFile(new URL('public/app.mjs', root), 'utf8')).replace(/^import .*from '\.\/lib\.mjs';\n/, '');
const embeddedData = JSON.stringify(data).replaceAll('<', '\\u003c');
const preview = (await readFile(new URL('public/index.html', root), 'utf8'))
  .replace('<link rel="stylesheet" href="./styles.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="./app.mjs"></script>', `<script>window.PROBLEM_NOTES_PREVIEW_DATA=${embeddedData};</script><script type="module">${(lib + '\n' + app).replaceAll('</script', '<\\/script')}</script>`);
await writeFile(new URL('preview.html', dist), preview);
console.log(`Built ${data.problems.length} problems and ${data.reviews.length} active ratings.`);
