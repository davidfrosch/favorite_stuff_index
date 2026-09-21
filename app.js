
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1vYiKzxLO7M8rx0F_twAiKytgFj2kqN-MW4UX6n9B154/export?format=csv&gid=0';
// Preferred display order; any other category value found in the data is appended after these.
const CATEGORY_ORDER = ['music', 'art', 'documentary', 'film', 'text', 'research', 'food', 'portfolio', 'projects'];

const app = document.querySelector('#app');
let links = [];
let currentSuggestions = [];

function parseCsvRow(row) {
  const cells = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (inQuotes) {
      if (char === '"' && row[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') { inQuotes = false; }
      else { cell += char; }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map(parseCsvRow);
  const headers = rows.shift();
  return rows.map(row => Object.fromEntries(headers.map((header, index) => [header.trim(), (row[index] || '').trim()])));
}

function splitList(value) {
  return (value || '').split(';').map(item => item.trim()).filter(Boolean);
}

// Falls back to the link's hostname when the Title column is left blank.
function deriveTitle(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url || 'Untitled'; }
}

function buildLink(row) {
  const url = (row['Link'] || '').trim();
  return {
    url,
    title: (row['Title'] || '').trim() || deriveTitle(url),
    categories: splitList(row['Category']),
    commentary: (row['Enhanced Commentary'] || '').trim(),
    description: (row['Link Summary'] || '').trim(),
    questions: splitList(row['Question']),
    image: (row['Image Link'] || '').trim(),
  };
}

function searchText(link) {
  return [link.title, link.commentary, link.description, ...link.categories, ...link.questions].join(' ').toLowerCase();
}

function matchesFor(query) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return links.filter(link => searchText(link).includes(term));
}

function randomItems(items, count) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

function categoryLabel(link) {
  return link.categories.length ? link.categories.join(' \u00b7 ') : 'uncategorized';
}

function groupByCategory(items) {
  const groups = new Map();
  items.forEach(link => {
    const category = link.categories[0] || 'uncategorized';
    const key = category.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label: category, items: [] });
    groups.get(key).items.push(link);
  });
  const ordered = CATEGORY_ORDER.filter(category => groups.has(category));
  const extra = [...groups.keys()].filter(category => !CATEGORY_ORDER.includes(category)).sort();
  return [...ordered, ...extra].map(key => groups.get(key));
}

// One question per suggestion button, even when a link lists several.
function buildSuggestionPool(items) {
  return items.flatMap(link => (link.questions.length ? link.questions : [link.title]).map(question => ({ question, link })));
}

// Builds a shareable URL for a given view: {q}, {category}, or {link}.
function buildUrl(params) {
  const url = new URL(location.href);
  url.search = '';
  Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  return url.pathname + url.search;
}

function renderWordmark() {
  return '<button class="wordmark" type="button" aria-label="home">' + 'ask daavid'.split('').map(char => `<span>${char}</span>`).join('') + '</button>';
}

function renderAboutFooter() {
  return `<button class="about-toggle" type="button" aria-expanded="false">about</button>
    <p id="about-panel" class="about-panel" hidden>This is a collection of things i made, like or would like to share with you. for anything else, feel free to drop me a mail <a href="mailto:d@david2.de">d@david2.de</a>.</p>`;
}

function wireAbout() {
  const toggle = document.querySelector('.about-toggle');
  const panel = document.querySelector('#about-panel');
  toggle.addEventListener('click', () => {
    const willShow = panel.hidden;
    panel.hidden = !willShow;
    toggle.setAttribute('aria-expanded', String(willShow));
  });
}

function renderHome({ skipPush = false } = {}) {
  if (!skipPush) history.pushState({}, '', buildUrl({}));
  app.innerHTML = `
    <section class="shell">
      ${renderWordmark()}
      <p class="tagline" hidden>Ask whatever...about David.</p>
      <form id="search-form" class="search-wrap" role="search">
        <div class="search-box"><span class="magnifier" aria-hidden="true"></span><input id="query" autocomplete="off" aria-label="Search David's portfolio" /></div>
        <div id="suggestions" role="listbox"></div>
      </form>
      <div class="actions"><button id="search-button" type="button">Search</button><button id="lucky-button" type="button">I'm Feeling Lucky</button><a class="image-search-link" href="${buildUrl({ images: '1' })}">Image Search</a></div>
      <button class="index-toggle" type="button" aria-expanded="false">browse the database</button>
      <section id="index"><p class="index-note">Every destination currently indexed.</p>${groupByCategory(links).map(group => `<h3 class="category-heading"><a href="${buildUrl({ category: group.label })}" data-category="${group.label}">${group.label}</a></h3><div class="index-grid">${group.items.map(link => `<a class="index-item" href="${link.url}">${link.title}</a>`).join('')}</div>`).join('')}</section>
    </section>
    ${renderAboutFooter()}`;

  const input = document.querySelector('#query');
  const suggestions = document.querySelector('#suggestions');
  const showSuggestions = () => {
    const term = input.value.trim().toLowerCase();
    const pool = buildSuggestionPool(links);
    const matched = term ? pool.filter(entry => entry.question.toLowerCase().includes(term) || searchText(entry.link).includes(term)) : [];
    currentSuggestions = matched.length ? matched : randomItems(pool, 5);
    suggestions.innerHTML = currentSuggestions.map(entry => `<button class="suggestion" type="button" role="option" data-question="${entry.question}">${entry.question}</button>`).join('');
    suggestions.classList.toggle('show', currentSuggestions.length > 0);
  };
  input.addEventListener('focus', showSuggestions);
  input.addEventListener('input', showSuggestions);
  input.addEventListener('blur', () => setTimeout(() => suggestions.classList.remove('show'), 150));
  suggestions.addEventListener('click', event => {
    const question = event.target.dataset.question;
    if (question) { input.value = question; showResults(question); }
  });
  document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); showResults(input.value); });
  document.querySelector('#search-button').addEventListener('click', () => showResults(input.value));
  document.querySelector('.wordmark').addEventListener('click', () => renderHome());
  document.querySelector('#lucky-button').addEventListener('click', () => {
    const choices = currentSuggestions.length ? currentSuggestions : randomItems(buildSuggestionPool(links), 5);
    if (choices[0]) window.location.assign(choices[0].link.url);
  });
  document.querySelector('.index-toggle').addEventListener('click', event => {
    const index = document.querySelector('#index');
    const isOpen = index.classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', isOpen);
    event.currentTarget.textContent = isOpen ? 'hide the database' : 'browse the database';
  });
  document.querySelectorAll('.category-heading a').forEach(el => {
    el.addEventListener('click', event => { event.preventDefault(); showCategory(el.dataset.category); });
  });
  wireAbout();
}

function renderResultsList(items, heading, { query = '', skipPush, pushParams } = {}) {
  if (!skipPush) history.pushState({}, '', buildUrl(pushParams));
  app.innerHTML = `
    <main class="results-shell">
      <header class="results-head">${renderWordmark()}<form id="results-form" class="search-wrap" role="search"><div class="search-box"><span class="magnifier" aria-hidden="true"></span><input id="result-query" value="${query.replace(/"/g, '&quot;')}" aria-label="Search David's portfolio" /></div></form></header>
      <p class="result-count">${heading}</p>
      <section>${items.map(link => `<article class="result"><p class="result-url">${link.url}</p><a class="result-title" href="${link.url}">${link.title}</a><p class="result-category">${categoryLabel(link)}</p><p class="result-desc">${link.commentary ? `<em>${link.commentary}</em><br>` : ''}${link.description}</p></article>`).join('')}</section>
      <a class="back-link" href="${buildUrl({})}">Home</a>
    </main>
    ${renderAboutFooter()}`;
  document.querySelector('#results-form').addEventListener('submit', event => { event.preventDefault(); showResults(document.querySelector('#result-query').value); });
  document.querySelector('.wordmark').addEventListener('click', () => renderHome());
  document.querySelector('.back-link').addEventListener('click', event => { event.preventDefault(); renderHome(); });
  wireAbout();
}

function renderImageSearch({ skipPush = false } = {}) {
  const imageLinks = links.filter(link => link.image);
  if (!skipPush) history.pushState({}, '', buildUrl({ images: '1' }));
  app.innerHTML = `
    <main class="image-results-shell">
      <header class="image-results-head">
        ${renderWordmark()}
        <div class="image-search-box"><span class="magnifier" aria-hidden="true"></span><span>Image Search</span></div>
      </header>
      <nav class="image-tabs" aria-label="Search type"><a href="${buildUrl({})}">All</a><a class="active" href="${buildUrl({ images: '1' })}">Images</a></nav>
      <p class="result-count">${imageLinks.length} Scroll through my images</p>
      <h2 class="image-section-heading">Images</h2>
      <section class="image-grid">${imageLinks.map(link => `<a class="image-result" href="${buildUrl({ link: link.url })}" data-url="${link.url}"><div class="image-result-media"><img src="${link.image}" alt="${link.title}"></div><span class="image-result-title">${link.title}</span><span class="image-result-description">${link.commentary}</span></a>`).join('')}</section>
      <a class="back-link" href="${buildUrl({})}">Home</a>
    </main>
    ${renderAboutFooter()}`;
  document.querySelector('.wordmark').addEventListener('click', () => renderHome());
  document.querySelector('.back-link').addEventListener('click', event => { event.preventDefault(); renderHome(); });
  document.querySelectorAll('.image-result').forEach(el => {
    el.addEventListener('click', event => { event.preventDefault(); showLink(el.dataset.url); });
  });
  wireAbout();
}

function showResults(query, { skipPush = false } = {}) {
  const term = query.trim();
  const matched = matchesFor(term);
  const shown = matched.length ? matched : randomItems(links, 10);
  const heading = matched.length ? `About ${matched.length} results` : 'No exact results. Here are some pages from David.';
  renderResultsList(shown, heading, { query: term, skipPush, pushParams: { q: term } });
}

function showCategory(category, { skipPush = false } = {}) {
  const key = category.toLowerCase();
  const matched = links.filter(link => link.categories.some(c => c.toLowerCase() === key));
  const label = matched[0] ? matched[0].categories.find(c => c.toLowerCase() === key) : category;
  const heading = matched.length ? `${matched.length} link${matched.length === 1 ? '' : 's'} in ${label}` : `No links yet in ${category}`;
  renderResultsList(matched, heading, { skipPush, pushParams: { category } });
}

function showLink(url, { skipPush = false } = {}) {
  const matched = links.filter(link => link.url === url);
  const heading = matched.length ? 'Shared link' : 'This link is no longer in the database.';
  renderResultsList(matched, heading, { skipPush, pushParams: { link: url } });
}

// Reads ?q=, ?category=, or ?link= from the address bar so shared URLs load directly.
function routeFromLocation() {
  const params = new URLSearchParams(location.search);
  const link = params.get('link');
  const category = params.get('category');
  const q = params.get('q');
  const images = params.get('images');
  if (link) return showLink(link, { skipPush: true });
  if (category) return showCategory(category, { skipPush: true });
  if (q) return showResults(q, { skipPush: true });
  if (images) return renderImageSearch({ skipPush: true });
  return renderHome({ skipPush: true });
}

function loadCsv(url) {
  return fetch(url, { cache: 'no-store' }).then(response => response.ok ? response.text() : Promise.reject(new Error(`Could not load ${url}`)));
}

loadCsv(SHEET_CSV_URL)
  .then(text => { links = parseCsv(text).map(buildLink).filter(link => link.url); routeFromLocation(); })
  .catch(() => { app.innerHTML = '<p style="padding:2rem">The portfolio index could not be loaded.</p>'; });

window.addEventListener('popstate', () => routeFromLocation());
