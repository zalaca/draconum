// SEO dinámico en el edge (Cloudflare Pages Function).
//
// Los bots no ejecutan el JS de la página, así que aquí, según la URL, inyectamos
// en el HTML servido:
//
//   • /?id=N (o el antiguo ?d=YYYY-MM-DD): meta Open Graph/Twitter + <title> +
//     el titular y texto de esa efeméride en el <body>, un canonical propio y un
//     JSON-LD Article (con lugar y serie). Así redes y buscadores ven el
//     contenido concreto y cada efeméride puede indexarse por separado.
//
//   • / (home): un H1 de sitio, una intro y una lista de efemérides enlazadas
//     (enlaces internos reales hacia ?id=N) + un JSON-LD WebSite. Evita que la
//     home sea "thin content" sin encabezado para el crawler.
//
// El JS de la página sobrescribe #content al cargar, así que el usuario con JS no
// ve duplicados: el contenido inyectado es para bots y render sin JS.
//
// La anon key es pública por diseño (la barrera real es la RLS de Supabase);
// puede venir de una variable de entorno / secreto de Pages.

const SITE = 'https://draconum.app';

// Columnas que necesitamos para meta + JSON-LD de una efeméride.
const CHRON_COLS = 'id,title,body,category,event_date,date_label,historical_year,lat,lng,place_name';

class AttrSetter {
  constructor(attr, value) { this.attr = attr; this.value = value; }
  element(el) { el.setAttribute(this.attr, this.value); }
}

class TextSetter {
  // Ojo: NO usar `this.text`; HTMLRewriter interpreta una propiedad `text` en el
  // handler como el callback de nodos de texto y falla si no es una función.
  constructor(content) { this.content = content; }
  element(el) { el.setInnerContent(this.content); }
}

// Inyecta HTML como contenido del elemento (para el contenido SEO del <body>).
class HtmlSetter {
  constructor(html) { this.html = html; }
  element(el) { el.setInnerContent(this.html, { html: true }); }
}

// Añade HTML dentro de un elemento, al final (para colgar el <script> JSON-LD del <head>).
class HtmlAppender {
  constructor(html) { this.html = html; }
  element(el) { el.append(this.html, { html: true }); }
}

// Escapa HTML (el contenido es propio, pero evitamos que un carácter suelto rompa
// el marcado que inyectamos).
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Serializa un objeto a un <script type="application/ld+json"> seguro: escapamos
// `<` como < para que ningún texto pueda cerrar el <script> antes de tiempo.
function jsonLd(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function supaConfig(env) {
  return {
    url: env.SUPABASE_URL || 'https://cbmzxibsbftrdrbedloj.supabase.co',
    key: env.SUPABASE_ANON_KEY || 'sb_publishable_fvf0-ABfk_SMiSwFbzU7Iw_zVA1_aLM',
  };
}

async function supaGet(cfg, query) {
  const r = await fetch(`${cfg.url}/rest/v1/${query}`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
  });
  if (!r.ok) throw new Error('supabase ' + r.status);
  return r.json();
}

// ---- Página de efeméride: /?id=N o /?d=YYYY-MM-DD ------------------------------
async function renderChronicle(response, cfg, filter, requestUrl) {
  let chron;
  try {
    chron = (await supaGet(cfg, `chronicles?select=${CHRON_COLS}&active=eq.true&${filter}&limit=1`))[0];
  } catch (_) {
    return response; // si falla, devolvemos el HTML estático sin tocar
  }
  if (!chron) return response;

  const title = chron.title || '';
  const fullTitle = `${title} — Hic Sunt Dracones`;
  const desc = String(chron.body || '').replace(/<[^>]*>/g, '').slice(0, 200);
  // Canonical único por efeméride: ?d y ?id de la misma crónica consolidan aquí.
  const canonical = `${SITE}/?id=${chron.id}`;

  // Contenido SEO para el <body>. Permitimos solo <em> (como en el cliente).
  const bodyHtml = esc(chron.body || '')
    .replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
  const seoContent =
    `<h1 class="fact-headline">${esc(title)}</h1>` +
    `<div class="fact-body">${bodyHtml}</div>`;

  // JSON-LD Article, enriquecido con serie (isPartOf) y lugar (spatialCoverage).
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: desc,
    inLanguage: 'es',
    url: canonical,
    image: `${SITE}/og.png`,
    publisher: {
      '@type': 'Organization',
      name: 'Hic Sunt Dracones',
      logo: { '@type': 'ImageObject', url: `${SITE}/favicon.png` },
    },
  };
  if (chron.category) ld.isPartOf = { '@type': 'CreativeWorkSeries', name: chron.category };
  const temporal = chron.historical_year != null ? String(chron.historical_year) : (chron.date_label || null);
  if (temporal) ld.temporalCoverage = temporal;
  if (chron.lat != null && chron.lng != null) {
    ld.spatialCoverage = {
      '@type': 'Place',
      geo: { '@type': 'GeoCoordinates', latitude: chron.lat, longitude: chron.lng },
    };
    if (chron.place_name) ld.spatialCoverage.name = chron.place_name;
  }

  return new HTMLRewriter()
    .on('title', new TextSetter(fullTitle))
    .on('link[rel="canonical"]', new AttrSetter('href', canonical))
    .on('meta[name="description"]', new AttrSetter('content', desc))
    .on('meta[property="og:title"]', new AttrSetter('content', title))
    .on('meta[property="og:description"]', new AttrSetter('content', desc))
    .on('meta[property="og:url"]', new AttrSetter('content', canonical))
    .on('meta[name="twitter:title"]', new AttrSetter('content', title))
    .on('meta[name="twitter:description"]', new AttrSetter('content', desc))
    .on('#content', new HtmlSetter(seoContent))
    .on('head', new HtmlAppender(jsonLd(ld)))
    .transform(response);
}

// ---- Home: H1 de sitio + enlaces internos + JSON-LD WebSite -------------------
async function renderHome(response, cfg) {
  let rows = [];
  try {
    // Mezcla de épocas (orden por id, que no es cronológico) para dar variedad.
    rows = await supaGet(cfg, 'chronicles?select=id,title,historical_year&active=eq.true&order=id.asc&limit=24');
  } catch (_) {
    // Sin datos igualmente inyectamos H1 + JSON-LD: mejor que una home sin encabezado.
  }

  const fmtYear = (y) => (y == null ? '' : (y < 0 ? `${-y} a.C.` : String(y)));
  const items = rows
    .filter((c) => c && c.id != null)
    .map((c) => {
      const y = fmtYear(c.historical_year);
      const yr = y ? `<span class="fact-year">${esc(y)}</span> ` : '';
      return `<li>${yr}<a href="/?id=${c.id}">${esc(c.title)}</a></li>`;
    })
    .join('');

  const seoContent =
    `<h1 class="fact-headline">Hic Sunt Dracones — la historia en el mapa</h1>` +
    `<div class="fact-body">` +
    `<p>Explora la historia a través de efemérides, mapas y expediciones. ` +
    `Donde los mapas terminan, comienza la historia.</p>` +
    (items ? `<ul class="seo-index">${items}</ul>` : '') +
    `</div>`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Hic Sunt Dracones',
    url: SITE,
    inLanguage: 'es',
    description: 'Explora la historia a través de efemérides, mapas y expediciones. Donde los mapas terminan, comienza la historia.',
  };

  return new HTMLRewriter()
    .on('#content', new HtmlSetter(seoContent))
    .on('head', new HtmlAppender(jsonLd(ld)))
    .transform(response);
}

export async function onRequest(context) {
  const { request, next, env } = context;

  if (request.method !== 'GET') return next();

  const url = new URL(request.url);
  const idParam = url.searchParams.get('id');
  const dParam = url.searchParams.get('d');

  // Filtro PostgREST según el parámetro disponible.
  let filter;
  let isHome = false;
  if (idParam && /^\d+$/.test(idParam)) filter = `id=eq.${idParam}`;
  else if (dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam)) filter = `event_date=eq.${dParam}`;
  else if (url.pathname === '/' || url.pathname === '/index.html') isHome = true;
  else return next();

  const response = await next();
  const ctype = response.headers.get('content-type') || '';
  if (!ctype.includes('text/html')) return response;

  const cfg = supaConfig(env);
  return isHome
    ? renderHome(response, cfg)
    : renderChronicle(response, cfg, filter, url);
}
