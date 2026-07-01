// Sitemap dinámico (Cloudflare Pages Function → /sitemap.xml).
//
// Lista la home y cada efeméride publicada como ?id=N, para que los buscadores
// descubran e indexen cada una. Los datos salen de Supabase (solo activas; la
// RLS oculta las futuras). Si Supabase falla, devolvemos al menos la home.
//
// La anon key es pública por diseño (la barrera real es la RLS); puede venir de
// una variable de entorno de Pages o usar el valor por defecto.

const SITE = 'https://draconum.app';

export async function onRequest(context) {
  const { env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || 'https://cbmzxibsbftrdrbedloj.supabase.co';
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'sb_publishable_fvf0-ABfk_SMiSwFbzU7Iw_zVA1_aLM';

  let rows = [];
  try {
    const api = `${SUPABASE_URL}/rest/v1/chronicles?select=id&active=eq.true&order=event_date.asc`;
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) rows = await r.json();
  } catch (_) { /* devolvemos al menos la home */ }

  const urls = [`  <url><loc>${SITE}/</loc><changefreq>daily</changefreq></url>`];
  for (const c of rows) {
    if (c.id == null) continue;
    urls.push(`  <url><loc>${SITE}/?id=${c.id}</loc></url>`);
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
