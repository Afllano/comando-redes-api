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

export async function extractIdentity(brand) {
  if (!brand.website) throw new Error("La marca no tiene sitio web");
  const prompt = `Mira "${brand.website}" de la marca ${brand.name}. Usa busqueda web. Devuelve SOLO JSON:
{"logo":"URL directa del logo o null","palette":["3-6 colores #RRGGBB"],"primary":"#RRGGBB principal"}`;
  return parseJSON(await callClaude(prompt, { tools: WEB_SEARCH }));
}
