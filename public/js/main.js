/* ============================================================
 * LOADER
 * ============================================================ */
window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('loader');
    const skeleton = document.getElementById('skeleton');
    const grid = document.getElementById('grid');

    if (loader) loader.classList.add('hidden');
    if (skeleton) skeleton.style.display = 'none';
    if (grid) grid.style.display = 'grid';
  }, 900);
});

/* ============================================================
 * COPY BUTTON
 * ============================================================ */
document.querySelectorAll('[data-copy]').forEach((el) => {
  el.addEventListener('click', async () => {
    const text = el.getAttribute('data-copy');
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    const icon = el.querySelector('.material-symbols-rounded');
    const textSpan = el.querySelector('span:not(.material-symbols-rounded)');
    const oldIcon = icon ? icon.textContent : null;
    const oldText = textSpan ? textSpan.textContent : null;

    if (icon) icon.textContent = 'check';
    if (textSpan) textSpan.textContent = 'OK';
    el.classList.add('copied');

    setTimeout(() => {
      if (icon && oldIcon) icon.textContent = oldIcon;
      if (textSpan && oldText) textSpan.textContent = oldText;
      el.classList.remove('copied');
    }, 1300);
  });
});

/* ============================================================
 * FILTER + TABS
 * ============================================================ */
const filterInput = document.getElementById('filter');
const tabButtons = document.querySelectorAll('.tab');
const cards = Array.from(document.querySelectorAll('.card'));
const emptyState = document.getElementById('empty');
const grid = document.getElementById('grid');

let currentCat = 'all';
let currentQuery = '';

function applyFilter() {
  let visible = 0;

  cards.forEach((card) => {
    const cat = card.getAttribute('data-cat');
    const path = (card.getAttribute('data-path') || '').toLowerCase();
    const desc = (card.getAttribute('data-desc') || '').toLowerCase();
    const q = currentQuery.toLowerCase();

    const catOk = currentCat === 'all' || cat === currentCat;
    const queryOk = !q || path.includes(q) || desc.includes(q);
    const show = catOk && queryOk;

    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  if (emptyState) emptyState.style.display = visible === 0 ? 'flex' : 'none';
  if (grid) grid.style.display = visible === 0 ? 'none' : 'grid';
}

if (filterInput) {
  filterInput.addEventListener('input', (e) => {
    currentQuery = e.target.value;
    applyFilter();
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.getAttribute('data-cat') || 'all';
    applyFilter();
  });
});