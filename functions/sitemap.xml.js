// Sitemap dinámico (Cloudflare Pages Function → /sitemap.xml).
//
// Lista la home y cada efeméride publicada como ?id=N, para que los buscadores
// descubran e indexen cada una. Los datos salen de Supabase (solo activas; la
// RLS oculta las futuras). Si Supabase falla, devolvemos al menos la home.
//
// La anon key es pública por diseño (la barrera real es la RLS); puede venir de
// una variable de entorno de Pages o usar el valor por defecto.

const SITE = 'https://draconum.app';

// Normaliza updated_at (date o timestamptz) a YYYY-MM-DD para <lastmod> (W3C).
function lastmod(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function onRequest(context) {
  const { env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || 'https://cbmzxibsbftrdrbedloj.supabase.co';
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'sb_publishable_fvf0-ABfk_SMiSwFbzU7Iw_zVA1_aLM';

  let rows = [];
  try {
    // updated_at = fecha en que se editó la ficha (para <lastmod>); NO event_date,
    // que es la fecha del suceso histórico.
    const api = `${SUPABASE_URL}/rest/v1/chronicles?select=id,updated_at&active=eq.true&order=event_date.asc`;
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) rows = await r.json();
  } catch (_) { /* devolvemos al menos la home */ }

  // La home refleja la edición más reciente de cualquier crónica.
  const homeMod = rows.reduce((max, c) => {
    const m = lastmod(c.updated_at);
    return m && m > max ? m : max;
  }, '');

  const home = `  <url><loc>${SITE}/</loc>` +
    (homeMod ? `<lastmod>${homeMod}</lastmod>` : '') +
    `<changefreq>daily</changefreq></url>`;
  const urls = [home];
  for (const c of rows) {
    if (c.id == null) continue;
    const m = lastmod(c.updated_at);
    urls.push(`  <url><loc>${SITE}/?id=${c.id}</loc>` +
      (m ? `<lastmod>${m}</lastmod>` : '') + `</url>`);
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
