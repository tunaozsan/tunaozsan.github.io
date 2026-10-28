const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#primary-nav');
if (menuButton && nav) {
  document.documentElement.classList.add('js');
  const closeMenu = (returnFocus = false) => {
    menuButton.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    if (returnFocus) menuButton.focus();
  };
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  });
  nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('is-open')) closeMenu(true); });
  document.addEventListener('click', e => { if (!e.target.closest('.site-header')) closeMenu(); });
  matchMedia('(min-width: 1100px)').addEventListener('change', () => closeMenu());
}
const filters = [...document.querySelectorAll('[data-filter]')];
const cards = [...document.querySelectorAll('[data-category]')];
if (filters.length && cards.length) {
  const filterBar = document.querySelector('[data-service-filters]');
  if (filterBar) filterBar.hidden = false;
  filters.forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      cards.forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; });
      const count = document.querySelector('[data-result-count]');
      if (count) count.textContent = `${cards.filter(card => !card.hidden).length} services shown`;
    });
  });
}
