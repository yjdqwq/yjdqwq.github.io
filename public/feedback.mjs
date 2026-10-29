const rows = [...document.getElementById('feedbackRows').children];
const search = document.getElementById('feedbackSearch');
const author = document.getElementById('feedbackAuthor');
const purpose = document.getElementById('feedbackPurpose');
const reasonOnly = document.getElementById('feedbackReasonOnly');
const url = new URL(location.href);
search.value = url.searchParams.get('q') || '';
author.value = url.searchParams.get('author') || '';
purpose.value = url.searchParams.get('purpose') || '';
reasonOnly.checked = url.searchParams.get('reason') === '1';
function filterFeedback() {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const row of rows) {
    row.hidden = Boolean(terms.some(term => !row.dataset.search.includes(term)) || author.value && row.dataset.author !== author.value || purpose.value && row.dataset.purpose !== purpose.value || reasonOnly.checked && row.dataset.reason !== '1');
    if (!row.hidden) visible++;
  }
  document.getElementById('feedbackCount').textContent = `${visible} / ${rows.length} 条记录`;
  document.getElementById('feedbackEmpty').hidden = visible > 0;
  const next = new URL(location.href);
  for (const [key, value] of [['q', search.value], ['author', author.value], ['purpose', purpose.value], ['reason', reasonOnly.checked ? '1' : '']]) {
    if (value) next.searchParams.set(key, value); else next.searchParams.delete(key);
  }
  history.replaceState(null, '', next);
}
for (const element of [search, author, purpose, reasonOnly]) element.addEventListener('input', filterFeedback);
filterFeedback();
