// Sitemap dinámico (Cloudflare Pages Function → /sitemap.xml).
//
// Lista la home, cada efeméride (?id=N) y cada serie (/serie/<id>-<slug>), para
// que los buscadores descubran e indexen todo. Los datos salen de Supabase (solo
// activas; la RLS oculta las futuras). Si Supabase falla, devolvemos la home.
//
// La anon key es pública por diseño (la barrera real es la RLS); puede venir de
// una variable de entorno de Pages o usar el valor por defecto.

const SITE = 'https://draconum.app';

// Normaliza updated_at (date o timestamptz) a YYYY-MM-DD para <lastmod> (W3C).
function lastmod(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// categories.name → slug (mismo criterio que functions/serie/[param].js).
function slugify(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function onRequest(context) {
  const { env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || 'https://cbmzxibsbftrdrbedloj.supabase.co';
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'sb_publishable_fvf0-ABfk_SMiSwFbzU7Iw_zVA1_aLM';

  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const get = async (q) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers });
    return r.ok ? r.json() : [];
  };

  let rows = [];
  let cats = [];
  try {
    // updated_at = fecha en que se editó la ficha (para <lastmod>); NO event_date,
    // que es la fecha del suceso histórico. category_id agrupa por serie.
    [rows, cats] = await Promise.all([
      get('chronicles?select=id,updated_at,category_id&active=eq.true&order=event_date.asc'),
      get('categories?select=id,name'),
    ]);
  } catch (_) { /* devolvemos al menos la home */ }

  // Por categoría: última edición de sus crónicas (para el <lastmod> de la serie).
  const catMod = {};
  for (const c of rows) {
    const m = lastmod(c.updated_at);
    if (c.category_id == null || !m) continue;
    if (!catMod[c.category_id] || m > catMod[c.category_id]) catMod[c.category_id] = m;
  }

  // La home refleja la edición más reciente de cualquier crónica.
  const homeMod = rows.reduce((max, c) => {
    const m = lastmod(c.updated_at);
    return m && m > max ? m : max;
  }, '');

  const home = `  <url><loc>${SITE}/</loc>` +
    (homeMod ? `<lastmod>${homeMod}</lastmod>` : '') +
    `<changefreq>daily</changefreq></url>`;
  const urls = [home];

  // Efemérides individuales.
  for (const c of rows) {
    if (c.id == null) continue;
    const m = lastmod(c.updated_at);
    urls.push(`  <url><loc>${SITE}/?id=${c.id}</loc>` +
      (m ? `<lastmod>${m}</lastmod>` : '') + `</url>`);
  }

  // Series: solo las categorías que tienen alguna crónica publicada.
  for (const cat of cats) {
    const m = catMod[cat.id];
    if (!m) continue; // sin crónicas activas → sin página de serie
    const loc = `${SITE}/serie/${cat.id}-${slugify(cat.name)}`;
    urls.push(`  <url><loc>${loc}</loc><lastmod>${m}</lastmod></url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
