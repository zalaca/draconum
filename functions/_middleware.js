// Open Graph dinámico para enlaces compartidos (Cloudflare Pages Function).
//
// Cuando la URL trae ?id=N (o el antiguo ?d=YYYY-MM-DD), busca esa efeméride en
// Supabase e inyecta su titular y resumen en las meta-etiquetas del HTML, para
// que WhatsApp/redes muestren el contenido concreto en lugar del genérico
// (los bots no ejecutan el JS de la página). Sin parámetro, deja pasar el HTML
// estático tal cual (coste cero en visitas normales).
//
// La key puede venir de una variable de entorno / secreto de Pages
// (SUPABASE_ANON_KEY); si no, usa el valor público por defecto (la anon key es
// pública por diseño; la barrera real es la RLS de Supabase).

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

// Escapa HTML (la efeméride es contenido propio, pero evitamos que un carácter
// suelto rompa el marcado que inyectamos).
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function onRequest(context) {
  const { request, next, env } = context;

  if (request.method !== 'GET') return next();

  const url = new URL(request.url);
  const idParam = url.searchParams.get('id');
  const dParam = url.searchParams.get('d');

  // Filtro PostgREST según el parámetro disponible.
  let filter;
  if (idParam && /^\d+$/.test(idParam)) filter = `id=eq.${idParam}`;
  else if (dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam)) filter = `event_date=eq.${dParam}`;
  else return next();

  const response = await next();
  const ctype = response.headers.get('content-type') || '';
  if (!ctype.includes('text/html')) return response;

  const SUPABASE_URL = env.SUPABASE_URL || 'https://cbmzxibsbftrdrbedloj.supabase.co';
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'sb_publishable_fvf0-ABfk_SMiSwFbzU7Iw_zVA1_aLM';

  let chron;
  try {
    const api = `${SUPABASE_URL}/rest/v1/chronicles?select=title,body&active=eq.true&${filter}&limit=1`;
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) chron = (await r.json())[0];
  } catch (_) {
    return response; // si falla, devolvemos el HTML estático sin tocar
  }
  if (!chron) return response;

  const title = chron.title || '';
  const fullTitle = `${title} — Hic Sunt Dracones`;
  const desc = String(chron.body || '').replace(/<[^>]*>/g, '').slice(0, 200);

  // Contenido SEO para el <body>: los buscadores (y el render sin JS) ven el
  // titular y el texto. El JS de la página sobrescribe #content al cargar, así
  // que para el usuario no hay duplicado. Permitimos solo <em> (como en cliente).
  const bodyHtml = esc(chron.body || '')
    .replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
  const seoContent =
    `<h1 class="fact-headline">${esc(title)}</h1>` +
    `<div class="fact-body">${bodyHtml}</div>`;

  // HTMLRewriter escapa por nosotros al usar setAttribute / setInnerContent.
  return new HTMLRewriter()
    .on('title', new TextSetter(fullTitle))
    .on('meta[name="description"]', new AttrSetter('content', desc))
    .on('meta[property="og:title"]', new AttrSetter('content', title))
    .on('meta[property="og:description"]', new AttrSetter('content', desc))
    .on('meta[property="og:url"]', new AttrSetter('content', url.href))
    .on('meta[name="twitter:title"]', new AttrSetter('content', title))
    .on('meta[name="twitter:description"]', new AttrSetter('content', desc))
    .on('#content', new HtmlSetter(seoContent))
    .transform(response);
}
