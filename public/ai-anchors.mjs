const anchorRows = document.getElementById('anchorRows');
const anchorEntries = [...anchorRows.children];
const anchorYear = document.getElementById('anchorYear');
const anchorFamily = document.getElementById('anchorFamily');
const anchorSearch = document.getElementById('anchorSearch');
const anchorSort = document.getElementById('anchorSort');
function filterAIAnchors() {
  const terms = anchorSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let count = 0;
  for (const row of anchorEntries) {
    row.hidden = Boolean(anchorYear.value && row.dataset.year !== anchorYear.value || anchorFamily.value && row.dataset.family !== anchorFamily.value || terms.some(term => !row.dataset.search.includes(term)));
    if (!row.hidden) count++;
  }
  const ordered = [...anchorEntries].sort((a, b) => anchorSort.value === 'order' ? Number(a.dataset.order) - Number(b.dataset.order) : (anchorSort.value === 'desc' ? -1 : 1) * (Number(a.dataset.score) - Number(b.dataset.score)));
  anchorRows.replaceChildren(...ordered);
  document.getElementById('anchorCount').textContent = `${count} / ${anchorEntries.length} 个条目`;
  document.getElementById('anchorEmpty').hidden = count > 0;
  const url = new URL(location.href);
  for (const [key, value] of [['year', anchorYear.value], ['family', anchorFamily.value], ['q', anchorSearch.value], ['sort', anchorSort.value === 'order' ? '' : anchorSort.value]]) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}
const anchorURL = new URL(location.href);
anchorYear.value = anchorURL.searchParams.get('year') || '';
anchorFamily.value = anchorURL.searchParams.get('family') || '';
anchorSearch.value = anchorURL.searchParams.get('q') || '';
anchorSort.value = ['asc', 'desc'].includes(anchorURL.searchParams.get('sort')) ? anchorURL.searchParams.get('sort') : 'order';
for (const input of [anchorYear, anchorFamily, anchorSearch, anchorSort]) input.addEventListener('input', filterAIAnchors);
document.getElementById('anchorHide').addEventListener('click', event => {
  const hidden = document.querySelector('.anchor-table').classList.toggle('scores-hidden');
  event.currentTarget.textContent = hidden ? '显示 AI 分数' : '隐藏 AI 分数';
  event.currentTarget.setAttribute('aria-pressed', String(hidden));
  for (const cell of document.querySelectorAll('.anchor-score')) {
    if (!cell.dataset.label) cell.dataset.label = cell.textContent;
    cell.textContent = hidden ? '已隐藏' : cell.dataset.label;
  }
});
filterAIAnchors();
if (/^#P\d+$/.test(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView();
