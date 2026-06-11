/* Google Sheets CSV data loader */
const SHEET_URLS = {
  main: "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7j8MROdIeQXpjG81X20HAfjSN_A9XLGVk0RwxewVbmJRR0usBTA-9XbhxxvVKUPK-9xYiG6k-xynA/pub?gid=668167993&single=true&output=csv",
  languages: "https://docs.google.com/spreadsheets/d/e/2PACX-1vROKr3p5N3-lELInxrg_-tkfNgyzVWP_61mLs82H82JUi5g02WKK85mhipOuuiYHi3sTmVuSySA-Uaz/pub?gid=894202183&single=true&output=csv",
  thanks: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-VIsr3EjSu2P8eI3yBdqvm5oTqa-bZur3k8K_SqbPNRUwY-rITuIuvOCpCATWttQMAI8zxV8xLvMC/pub?gid=1634059129&single=true&output=csv"
};

const STATUS = {
  found: "found",
  notFound: "not-found"
};

const CATEGORY_KEYS = {
  original: "original",
  turkish: "turkish",
  spanish: "spanish"
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanStatus(value) {
  const status = normalizeText(value).replace(/\s+/g, "-");

  if (status === "found") return STATUS.found;
  if (status === "not-found" || status === "notfound") return STATUS.notFound;

  return status || STATUS.notFound;
}

function displayStatus(value) {
  return cleanStatus(value) === STATUS.found ? "Found" : "Not Found";
}

function cleanCategory(value) {
  const category = normalizeText(value).replace(/\s+/g, "-");

  if (category.includes("turkish")) return CATEGORY_KEYS.turkish;
  if (category.includes("spanish")) return CATEGORY_KEYS.spanish;

  return CATEGORY_KEYS.original;
}

function cleanLanguage(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function firstLetter(value) {
  const letter = String(value || "").trim().charAt(0).toUpperCase();
  return letter || "#";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sourceToHtml(value) {
  const source = String(value || "").trim();

  if (!source) return "Unknown";
  if (/^https?:\/\//i.test(source)) {
    return `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source)}</a>`;
  }

  return escapeHtml(source);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);

      if (row.some(value => String(value).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);

  if (row.some(value => String(value).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function rowsFromCsv(text) {
  const parsed = parseCsv(text);
  const headers = (parsed.shift() || []).map(header => String(header || "").trim());

  return parsed.map(values => {
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  }).filter(row => Object.values(row).some(value => String(value || "").trim() !== ""));
}

async function loadCsv(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Impossible de charger le Google Sheet CSV: ${response.status}`);
  }

  return rowsFromCsv(await response.text());
}

async function loadSheet(sheetName) {
  if (sheetName === "Main List" || sheetName === "main") {
    return loadCsv(SHEET_URLS.main);
  }

  if (sheetName === "languages" || sheetName === "Languages") {
    return loadCsv(SHEET_URLS.languages);
  }

  if (sheetName === "thanks" || sheetName === "Special Thanks") {
    return loadCsv(SHEET_URLS.thanks);
  }

  throw new Error(`Onglet inconnu: ${sheetName}`);
}

const SHEET_NAMES = {
  main: "main",
  languages: "languages",
  thanks: "thanks"
};

function getRowValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }

  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeText(key).replace(/\s+/g, ""), value])
  );

  for (const name of names) {
    const key = normalizeText(name).replace(/\s+/g, "");
    if (normalized[key] !== undefined) return normalized[key];
  }

  return "";
}

function prepareMainRows(rows) {
  return rows
    .map(row => {
      const name = String(getRowValue(row, ["Name", "name"])).trim();
      const category = String(getRowValue(row, ["Category", "category"])).trim();
      const status = String(getRowValue(row, ["Status", "status"])).trim();
      const source = String(getRowValue(row, ["Source", "source"])).trim();
      const image = String(getRowValue(row, ["Images", "Image", "images", "image"])).trim();

      return {
        name,
        category: cleanCategory(category),
        categoryLabel: category || "Original",
        status: cleanStatus(status),
        statusLabel: displayStatus(status),
        source,
        image
      };
    })
    .filter(row => row.name)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

function prepareLanguageRows(rows) {
  return rows
    .map(row => {
      const language = String(getRowValue(row, ["Language", "language"])).trim();
      const name = String(getRowValue(row, ["Name", "name"])).trim();
      const status = String(getRowValue(row, ["Status", "status"])).trim();
      const source = String(getRowValue(row, ["Source", "source"])).trim();
      const image = String(getRowValue(row, ["Images", "Image", "images", "image"])).trim();

      return {
        language: cleanLanguage(language),
        languageLabel: language,
        name,
        status: cleanStatus(status),
        statusLabel: displayStatus(status),
        source,
        image
      };
    })
    .filter(row => row.language && row.name)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

function buildUsernameCard(row) {
  const card = document.createElement("article");
  card.className = "username-card";
  card.dataset.status = row.status;
  card.dataset.source = sourceToHtml(row.source);

  card.innerHTML = `
    <h3>${escapeHtml(row.name)}</h3>
    <span class="status ${row.status}">${row.statusLabel}</span>
  `;

  return card;
}

function cleanImagePath(value, row) {
  let image = String(value || "").trim();

  if (!image) {
    image = `usernames/${row.category || "original"}/${row.name}.png`;
  }

  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  image = image.replace(/^\/?images\//i, "").replace(/^\//, "");

  if (image.startsWith("usernames/") || image.startsWith("languages/")) {
    return `images/${image}`;
  }

  return image;
}

function buildPhotoCard(row) {
  const card = document.createElement("article");
  card.className = "photo-card";

  const image = cleanImagePath(row.image, row);

  card.innerHTML = `
    <img src="${escapeHtml(image)}" alt="${escapeHtml(row.name)}" loading="lazy">
    <h3>${escapeHtml(row.name)}</h3>
  `;

  return card;
}

function renderGroupedList(container, rows, idPrefix) {
  container.replaceChildren();

  const byLetter = new Map();

  rows.forEach(row => {
    const letter = firstLetter(row.name);

    if (!byLetter.has(letter)) {
      byLetter.set(letter, []);
    }

    byLetter.get(letter).push(row);
  });

  byLetter.forEach((items, letter) => {
    const section = document.createElement("div");
    section.className = "letter-section";
    section.id = `${idPrefix}-${normalizeText(letter)}`;
    section.dataset.letter = letter;

    const title = document.createElement("h2");
    title.textContent = letter;

    const grid = document.createElement("div");
    grid.className = "username-grid";

    items.forEach(row => grid.append(buildUsernameCard(row)));

    section.append(title, grid);
    container.append(section);
  });
}

function setLoading(container) {
  if (!container) return;
  container.innerHTML = `<p class="language-empty">Loading...</p>`;
}

function setError(container) {
  if (!container) return;
  container.innerHTML = `<p class="language-empty">Unable to load data. Please try again later.</p>`;
}


function cleanThanksCategory(value) {
  const category = normalizeText(value);

  if (category.includes("website")) return "website";
  if (category.includes("info") || category.includes("information")) return "info";
  if (category.includes("archive")) return "archive";

  return "archive";
}

function prepareThanksRows(rows) {
  return rows
    .map(row => {
      const name = String(getRowValue(row, ["Name", "name"])).trim();
      const category = String(getRowValue(row, ["Category", "category"])).trim();
      const credit = String(getRowValue(row, ["Credit", "Credits", "Link", "URL", "credit", "credits", "link", "url"])).trim();

      return {
        name,
        category: cleanThanksCategory(category),
        credit
      };
    })
    .filter(row => row.name)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

function buildThanksCard(row) {
  const isLink = /^https?:\/\//i.test(row.credit);
  const tag = isLink ? "a" : "article";
  const card = document.createElement(tag);

  card.className = isLink ? "thanks-card thanks-card-link" : "thanks-card";

  if (isLink) {
    card.href = row.credit;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  card.innerHTML = `<h3>${escapeHtml(row.name)}</h3>`;

  return card;
}

