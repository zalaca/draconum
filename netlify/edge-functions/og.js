// Open Graph dinámico para enlaces compartidos.
//
// Cuando la URL trae ?d=YYYY-MM-DD, busca esa efeméride en Supabase e inyecta
// su titular y resumen en las meta-etiquetas del HTML, para que WhatsApp/redes
// muestren el contenido concreto en lugar del genérico. Sin ?d=, deja pasar el
// HTML estático tal cual (coste cero para las visitas normales).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://cbmzxibsbftrdrbedloj.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_fvf0-ABfk_SMiSwFbzU7Iw_zVA1_aLM";

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async (request, context) => {
  const res = await context.next();

  const url = new URL(request.url);
  const d = url.searchParams.get("d");
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return res;

  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("text/html")) return res;

  // Buscamos la crónica exacta de esa fecha (RLS garantiza que no sea futura).
  let chron;
  try {
    const api = `${SUPABASE_URL}/rest/v1/chronicles?select=title,body,event_date&active=eq.true&event_date=eq.${d}&limit=1`;
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) chron = (await r.json())[0];
  } catch (_) {
    return res; // si falla, devolvemos el HTML estático sin tocar
  }
  if (!chron) return res;

  const title = escapeAttr(chron.title);
  const desc = escapeAttr(String(chron.body || "").replace(/<[^>]*>/g, "").slice(0, 200));
  const pageUrl = escapeAttr(url.href);

  let html = await res.text();
  html = html
    .replace(/(<title>)[^<]*(<\/title>)/, `$1${title} — Hic Sunt Dracones$2`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${desc}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${desc}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${pageUrl}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${desc}$2`);

  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { status: res.status, headers });
};
