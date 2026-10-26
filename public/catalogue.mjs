import { summarize, MIN_RANK_VOTES } from './lib.mjs';

const EMPTY_SUMMARY = summarize([]);
const titleOrder = new Intl.Collator('zh-CN', { numeric: true });
const platformAliases = { '洛谷': 'luogu lg', Codeforces: 'cf', AtCoder: 'at' };
export function selectCatalogue(problems, reviews, options = {}) {
  const { query = '', platform = '', purpose = 'contest', independentOnly = false, favoritesOnly = false,
    favorites = new Set(), mode = 'library', sort = 'catalogue', page = 1, pageSize = 25, keys = null } = options;
  const inputOrder = keys === null ? null : new Map(keys.map((key, index) => [key, index]));
  const grouped = new Map();
  for (const r of reviews) {
    if (r.purpose !== purpose || (independentOnly && r.experience !== 'independent')) continue;
    if (!grouped.has(r.key)) grouped.set(r.key, []);
    grouped.get(r.key).push(r);
  }
  const summaries = new Map([...grouped].map(([key, values]) => [key, summarize(values)]));
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let items = [];
  for (const p of problems) {
    if (inputOrder && !inputOrder.has(p.key)) continue;
    if ((platform && p.platform !== platform) || (favoritesOnly && !favorites.has(p.key))) continue;
    const s = summaries.get(p.key) || EMPTY_SUMMARY;
    if (mode === 'rank' && s.n < MIN_RANK_VOTES) continue;
    const text = `${p.title} ${p.code} ${p.source} ${p.platform} ${p.id} ${p.url} ${platformAliases[p.platform] || ''} ${p.code.replaceAll('_', ' ')}`.toLowerCase();
    if (terms.some(t => !text.includes(t))) continue;
    items.push({ p, s });
  }
  const order = inputOrder ? 'batch' : mode === 'rank' && sort === 'catalogue' ? 'score-desc' : sort;
  if (order !== 'catalogue') items.sort((a, b) => {
    if (order === 'batch') return inputOrder.get(a.p.key) - inputOrder.get(b.p.key);
    if (order === 'title') return titleOrder.compare(a.p.title, b.p.title);
    if (order === 'votes') return b.s.n - a.s.n;
    if (a.s.mean === null) return b.s.mean === null ? 0 : 1;
    if (b.s.mean === null) return -1;
    return order === 'score-asc' ? a.s.mean - b.s.mean : b.s.mean - a.s.mean;
  });
  const size = [25, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 25;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), total: items.length, page: current, pages,
    first: items.length ? start + 1 : 0, last: Math.min(start + size, items.length) };
}
