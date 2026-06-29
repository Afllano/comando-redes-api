// Cliente de la API de Anthropic (lado servidor).
// Usa ANTHROPIC_API_KEY del .env. Aqui SI se necesita tu llave, porque corre en tu servidor.
const API = "https://api.anthropic.com/v1/messages";

export async function callClaude(prompt, { tools, maxTokens = 1200 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY en el .env");
  const body = { model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
  if (tools) body.tools = tools;
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter(i => i.type === "text").map(i => i.text).join("\n");
}

export function parseJSON(text) {
  const clean = (text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const m = clean.match(/\{[\s\S]*\}/) || clean.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

const WEB_SEARCH = [{ type: "web_search_20250305", name: "web_search" }];

export async function auditSite(brand) {
  if (!brand.website) throw new Error("La marca no tiene sitio web");
  const prompt = `Eres auditor web y consultor de SEO, UX y conversion. Revisa "${brand.website}" de la marca ${brand.name} (${brand.type}). Objetivo: ${brand.objective}. Audiencia: ${brand.audience}. Usa busqueda web para ver el sitio real.
Devuelve SOLO JSON valido sin markdown:
{"overall":"estado en 1-2 frases","working":["2-4 cosas bien"],"issues":[{"title":"problema","severity":"alta|media|baja","fix":"como solucionarlo"}],"suggestions":["3-5 mejoras priorizadas para mas leads/ventas"]}`;
  return parseJSON(await callClaude(prompt, { tools: WEB_SEARCH }));
}

// Normaliza un color (#rgb, #rrggbb o rgb()) a #RRGGBB en minuscula, o null.
function normHex(c) {
  c = c.trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3})$/);
  if (m) return "#" + m[1].split("").map(x => x + x).join("");
  m = c.match(/^#([0-9a-f]{6})$/);
  if (m) return "#" + m[1];
  m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return "#" + [m[1], m[2], m[3]].map(n => Math.min(255, +n).toString(16).padStart(2, "0")).join("");
  return null;
}
// Cuenta colores en un texto (CSS/HTML) y acumula frecuencias.
function tallyColors(src, counts) {
  const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]+\)/g;
  for (const raw of src.match(re) || []) {
    const h = normHex(raw);
    if (h) counts[h] = (counts[h] || 0) + 1;
  }
}

// Busca en Google el Perfil de Empresa cuando el sitio no lo enlaza. Verifica que sea la misma marca.
async function findGoogleBusiness(name, website) {
  if (!name) return null;
  let domain = "";
  try { domain = new URL(/^https?:\/\//.test(website) ? website : "https://" + website).hostname.replace(/^www\./, ""); } catch {}
  const prompt = `Busca en internet el Perfil de Empresa de Google (Google Business / ficha de Google Maps) del negocio llamado "${name}"${domain ? ` cuyo sitio web oficial es ${domain}` : ""}.
Verifica con cuidado que sea EXACTAMENTE esa empresa: el nombre debe coincidir y, si es posible, el sitio web de la ficha debe ser el mismo dominio (${domain || "el oficial"}). Si hay varias empresas con nombre parecido y no puedes confirmar cuál es, responde null.
Devuelve SOLO JSON válido sin markdown:
{"url":"enlace directo a su ficha de Google Maps (https://www.google.com/maps/place/... , https://maps.app.goo.gl/... o https://g.page/...) o null si no estás seguro","confianza":"alta|media|baja"}`;
  try {
    const r = parseJSON(await callClaude(prompt, { tools: WEB_SEARCH, maxTokens: 900 }));
    if (r && r.url && typeof r.url === "string" && /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page)/i.test(r.url) && r.confianza !== "baja") {
      return r.url.replace(/["'>].*$/, "");
    }
  } catch {}
  return null;
}

// Descarga el sitio directamente (sirve para webs no indexadas) y extrae la info de marca.
export async function scanSiteContent(url) {
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  // Cabeceras de navegador real para evitar bloqueos (403) de sitios con proteccion anti-bot.
  const BROWSER_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "es-ES,es;q=0.9,en;q=0.8",
    "upgrade-insecure-requests": "1",
  };
  let html;
  let directError = "";
  try {
    const res = await fetch(target, { headers: BROWSER_HEADERS, redirect: "follow" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    html = await res.text();
  } catch (e) { directError = e.message; }
  // Respaldo: si el sitio bloquea al servidor (403 de Cloudflare en IPs de nube), traer el HTML via lector intermedio.
  if (!html) {
    try {
      const res = await fetch("https://r.jina.ai/" + target, { headers: { ...BROWSER_HEADERS, "x-return-format": "html" } });
      if (res.ok) html = await res.text();
    } catch {}
  }
  if (!html) throw new Error(`No se pudo abrir el sitio: ${directError || "bloqueado"}`);

  // Deteccion de logo por prioridad. NUNCA usar imagenes hero/banner: solo logos reales o el icono de marca.
  const abs = (u) => { if (!u) return ""; try { return new URL(u, target).href; } catch { return ""; } };
  // Busca un <link> de icono respetando cualquier orden de atributos.
  const iconLink = (relre) => {
    for (const l of html.match(/<link[^>]+>/gi) || []) {
      if (relre.test(l)) { const h = l.match(/href=["']([^"']+)["']/i); if (h) return h[1]; }
    }
    return "";
  };
  // 1. <img> que sea explicitamente un logo (src/alt/class/id contiene "logo"), en cualquier parte.
  let logo = "";
  const imgLogo = html.match(/<img[^>]+(?:src|alt|class|id)=["'][^"']*logo[^"']*["'][^>]*>/i);
  if (imgLogo) { const s = imgLogo[0].match(/src=["']([^"']+)["']/i); if (s) logo = abs(s[1]); }
  // 2. Icono de marca (apple-touch-icon o favicon).
  if (!logo) logo = abs(iconLink(/apple-touch-icon/i));
  if (!logo) logo = abs(iconLink(/rel=["'][^"']*\bicon\b/i));
  // 3. og:image SOLO si la URL parece un logo/icono (evita heroes y banners).
  if (!logo) {
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og && /logo|icon/i.test(og[1])) logo = abs(og[1]);
  }

  // Paleta REAL: junta colores del HTML, sus <style> y hasta 4 hojas CSS enlazadas.
  const counts = {};
  tallyColors(html, counts);
  const cssLinks = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 4);
  await Promise.all(cssLinks.map(async href => {
    try {
      const u = new URL(href, target).href;
      const r = await fetch(u, { headers: BROWSER_HEADERS });
      if (r.ok) tallyColors((await r.text()).slice(0, 200000), counts);
    } catch {}
  }));
  // Ordena por frecuencia, descarta blancos/negros/grises casi puros para no ensuciar la paleta.
  const isDull = (h) => {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return (max - min) < 14 && (max > 235 || max < 22); // casi blanco o casi negro sin tono
  };
  const detected = Object.entries(counts).sort((a, c) => c[1] - a[1]).filter(e => !isDull(e[0]));
  const colorful = detected.slice(0, 16).map(e => e[0]);
  // Lista con frecuencia para que la IA distinga colores de marca (frecuentes) de accidentales (raros).
  const colorsWithFreq = detected.slice(0, 16).map(e => `${e[0]} (aparece ${e[1]}x)`).join(", ");

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);

  const prompt = `Eres analista de marca y de negocio. A partir del contenido real de este sitio web, deduce su identidad.
Contenido del sitio "${target}":
"""${text}"""

Colores detectados en el código del sitio, con su frecuencia de uso: ${colorsWithFreq || "(no detectados)"}.

IMPORTANTE sobre el propósito: identifica el OBJETIVO FINAL DE NEGOCIO (cómo gana dinero la marca), no una métrica intermedia o de vanidad. Si el sitio vende suscripciones o planes pagos, el objetivo y la meta deben apuntar a aumentar suscripciones/ventas pagas e ingresos, NO a registros gratuitos, seguidores ni visitas (esos son solo pasos intermedios). La "goalMetric" debe ser una meta medible ligada a ese fin monetario.

IMPORTANTE sobre la paleta: identifica SOLO los colores que realmente definen la identidad de la marca (normalmente 3 a 5). Razona así:
- Los colores de marca suelen ser los más frecuentes y forman una gama coherente entre sí (ej: un color dominante con sus variantes claras/oscuras + 1 o 2 acentos).
- DESCARTA colores accidentales aunque aparezcan: amarillos/dorados de estrellas de reseñas, azules de íconos de redes sociales, rojos/verdes de alertas, y cualquier color suelto que no encaje con la gama dominante o que aparezca pocas veces.
- Ante la duda, prefiere una paleta pequeña y coherente antes que incluir un color que desentone.
El "primary" debe ser el color de acento principal de la marca (el más representativo, no un gris ni un tono de fondo).

CALIDAD DE REDACCIÓN: escribe los campos "objective", "audience", "tone" y "offers" como un estratega de marketing profesional. Que sean completos, claros y bien redactados (2 a 4 frases cada uno), específicos a este negocio (no genéricos), en español impecable y listos para guiar la creación de contenido. Evita listas sueltas de palabras; redacta en prosa fluida.

Devuelve SOLO JSON válido sin markdown, todo en español:
{"name":"nombre de la marca o empresa","type":"sector o tipo de negocio en pocas palabras","objective":"el objetivo final de negocio de la marca, enfocado en lo que realmente la hace crecer económicamente","goalMetric":"una meta medible ligada al objetivo final, ej: 30 suscripciones pagas nuevas/mes","audience":"a quién le habla: edad, perfil, qué le preocupa","tone":"tono de voz que usa la marca","offers":"productos o servicios clave que ofrece","palette":["solo los colores de marca coherentes en formato #RRGGBB tomados de los detectados, de 3 a 5"],"primary":"#RRGGBB color de acento principal"}`;

  // Redes sociales enlazadas en el sitio (suelen estar en el footer).
  const socialPatterns = {
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)/i,
    facebook:  /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.\-]+)/i,
    tiktok:    /https?:\/\/(?:www\.)?tiktok\.com\/@?([A-Za-z0-9_.]+)/i,
    linkedin:  /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([A-Za-z0-9_.\-]+)/i,
  };
  const ignore = new Set(["sharer", "share", "sharer.php", "intent", "home", "profile.php"]);
  const networks = {};
  for (const [k, re] of Object.entries(socialPatterns)) {
    const m = html.match(re);
    if (m && m[1] && !ignore.has(m[1].toLowerCase())) {
      networks[k] = (k === "tiktok" || k === "instagram") ? "@" + m[1] : m[1];
    }
  }
  // Google Business / perfil del negocio en Maps: enlaces directos, mapas embebidos (iframe) o cid.
  const gbiz =
    html.match(/https?:\/\/(?:g\.page\/[^"'\s]+|(?:www\.)?google\.[a-z.]+\/maps\/place\/[^"'\s]+|maps\.app\.goo\.gl\/[^"'\s]+|(?:maps\.)?goo\.gl\/maps\/[^"'\s]+|search\.google\.com\/local\/[^"'\s]+)/i)
    || html.match(/https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/embed\?[^"'\s]+/i)
    || html.match(/https?:\/\/maps\.google\.[a-z.]+\/[^"'\s]*(?:cid=|q=)[^"'\s]+/i);
  if (gbiz) networks.google = gbiz[0].replace(/["'>].*$/, "").replace(/&amp;/g, "&");

  const data = parseJSON(await callClaude(prompt, { maxTokens: 1500 }));
  if (!data) return null;
  if (logo) data.logo = logo;
  // (La busqueda de Google Business por nombre llegara con Google Places API; aqui solo se usan enlaces del sitio.)
  if (Object.keys(networks).length) data.networks = networks;
  // Si la IA no devolvió paleta usable, cae a los colores detectados.
  const valid = (data.palette || []).filter(c => /^#[0-9a-fA-F]{6}$/.test(c || ""));
  if (valid.length < 2 && colorful.length) data.palette = colorful.slice(0, 8);
  return data;
}

export async function extractIdentity(brand) {
  if (!brand.website) throw new Error("La marca no tiene sitio web");
  const prompt = `Mira "${brand.website}" de la marca ${brand.name}. Usa busqueda web. Devuelve SOLO JSON:
{"logo":"URL directa del logo o null","palette":["3-6 colores #RRGGBB"],"primary":"#RRGGBB principal"}`;
  return parseJSON(await callClaude(prompt, { tools: WEB_SEARCH }));
}
