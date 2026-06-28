import { Router } from "express";
import { callClaude, scanSiteContent } from "../ai.js";

const r = Router();
const WEB_SEARCH = [{ type: "web_search_20250305", name: "web_search" }];

// Escanea un sitio descargandolo directamente (funciona aunque no este indexado).
r.post("/scan-site", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Falta url" });
    const data = await scanSiteContent(url);
    if (!data) return res.status(502).json({ error: "La IA no devolvio un resultado valido" });
    res.json(data);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// Endpoint generico de IA. El frontend manda el prompt; la llave vive aqui en el servidor.
// (Para un SaaS multi-cliente conviene endpoints especificos; para tu uso interno esto va bien.)
r.post("/ai", async (req, res) => {
  try {
    const { prompt, web } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Falta prompt" });
    const text = await callClaude(prompt, { tools: web ? WEB_SEARCH : undefined });
    res.json({ text });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

export default r;
