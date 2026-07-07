// Página de serie / categoría (Cloudflare Pages Function → /serie/<id>-<slug>).
//
// Cada categoría de `categories` es una serie histórica (Magallanes y Elcano, La
// conquista de México…), que son justo las búsquedas por las que interesa
// rankear. Esta función sirve el SPA (index.html) e inyecta, para bots y render
// sin JS, un H1 con el nombre de la serie y la lista de sus efemérides enlazadas
// (hub de enlaces internos hacia ?id=N), más un JSON-LD CollectionPage.
//
// La URL es `/serie/<category_id>-<slug>`: el id manda para el lookup (robusto),
// el slug es decorativo y se genera desde categories.name. Si el slug no coincide
// con el canónico, redirigimos 301 al correcto (una sola URL indexable).
//
// La anon key es pública por diseño (la barrera real es la RLS de Supabase).

const SITE = 'https://draconum.app';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// categories.name → slug: sin acentos/ñ, minúsculas, separado por guiones.
function slugify(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Serializa a <script type="application/ld+json"> seguro (< escapado).
function jsonLd(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function fmtYear(y) {
  if (y == null) return '';
  return y < 0 ? `${-y} a.C.` : String(y);
}

class AttrSetter {
  constructor(attr, value) { this.attr = attr; this.value = value; }
  element(el) { el.setAttribute(this.attr, this.value); }
}
class TextSetter {
  constructor(content) { this.content = content; }
  element(el) { el.setInnerContent(this.content); }
}
class HtmlSetter {
  constructor(html) { this.html = html; }
  element(el) { el.setInnerContent(this.html, { html: true }); }
}
class HtmlAppender {
  constructor(html) { this.html = html; }
  element(el) { el.append(this.html, { html: true }); }
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

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);
  const asset = () => env.ASSETS.fetch(`${url.origin}/index.html`);

  if (request.method !== 'GET') return asset();

  // El id es el prefijo numérico del parámetro ("136-magallanes..." → 136).
  const raw = String(params.param || '');
  const m = raw.match(/^(\d+)/);
  if (!m) return asset();
  const catId = m[1];

  const cfg = supaConfig(env);
  let cat, rows;
  try {
    [cat] = await supaGet(cfg, `categories?select=id,name&id=eq.${catId}&limit=1`);
    if (!cat) return asset();
    rows = await supaGet(cfg,
      `chronicles?select=id,title,historical_year&active=eq.true&category_id=eq.${catId}&order=display_order.asc`);
  } catch (_) {
    return asset(); // si Supabase falla, servimos el SPA sin tocar
  }
  if (!rows || !rows.length) return asset(); // serie vacía: nada que indexar

  const slug = slugify(cat.name);
  const canonicalId = `${catId}-${slug}`;
  const canonical = `${SITE}/serie/${canonicalId}`;

  // Slug incorrecto o ausente → 301 a la URL canónica (una sola indexable).
  if (raw !== canonicalId) {
    return new Response(null, { status: 301, headers: { Location: canonical } });
  }

  const name = cat.name || '';
  const title = `${name} — Hic Sunt Dracones`;
  const desc = `Las ${rows.length} efemérides de la serie «${name}» en Hic Sunt Dracones. `
    + `Donde los mapas terminan, comienza la historia.`;

  const items = rows.map((c) => {
    const y = fmtYear(c.historical_year);
    const yr = y ? `<span class="fact-year">${esc(y)}</span> ` : '';
    return `<li>${yr}<a href="/?id=${c.id}">${esc(c.title)}</a></li>`;
  }).join('');

  const seoContent =
    `<h1 class="fact-headline">${esc(name)}</h1>` +
    `<div class="fact-body">` +
    `<p>${esc(String(rows.length))} efemérides de esta serie histórica.</p>` +
    `<ul class="seo-index">${items}</ul>` +
    `</div>`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    url: canonical,
    inLanguage: 'es',
    about: { '@type': 'CreativeWorkSeries', name },
    hasPart: rows.map((c) => ({
      '@type': 'Article',
      headline: c.title,
      url: `${SITE}/?id=${c.id}`,
    })),
  };

  return new HTMLRewriter()
    .on('title', new TextSetter(title))
    .on('link[rel="canonical"]', new AttrSetter('href', canonical))
    .on('meta[name="description"]', new AttrSetter('content', desc))
    .on('meta[property="og:title"]', new AttrSetter('content', name))
    .on('meta[property="og:description"]', new AttrSetter('content', desc))
    .on('meta[property="og:url"]', new AttrSetter('content', canonical))
    .on('meta[name="twitter:title"]', new AttrSetter('content', name))
    .on('meta[name="twitter:description"]', new AttrSetter('content', desc))
    .on('#content', new HtmlSetter(seoContent))
    .on('head', new HtmlAppender(jsonLd(ld)))
    .transform(await asset());
}
