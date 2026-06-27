import { Router } from "express";
import { db } from "../store.js";
import { auditSite, extractIdentity } from "../ai.js";

const r = Router();

// Auditoria del sitio con IA. Guarda el resultado en la marca con fecha.
r.post("/audit/:brandId", async (req, res) => {
  try {
    const brand = await db.brand(req.params.brandId);
    if (!brand) return res.status(404).json({ error: "Marca no encontrada" });
    const data = await auditSite(brand);
    if (!data) return res.status(502).json({ error: "La IA no devolvio un resultado valido" });
    await db.upsertBrand({ id: brand.id, lastAudit: { date: new Date().toISOString(), data } });
    res.json({ date: new Date().toISOString(), data });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// Extraer logo + paleta del sitio.
r.post("/identity/:brandId", async (req, res) => {
  try {
    const brand = await db.brand(req.params.brandId);
    if (!brand) return res.status(404).json({ error: "Marca no encontrada" });
    const out = await extractIdentity(brand);
    if (!out) return res.status(502).json({ error: "No se pudo extraer la identidad" });
    const isHex = (c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c.trim());
    const palette = (out.palette || []).filter(isHex);
    const patch = { id: brand.id, palette, logo: /^https?:\/\//.test(out.logo || "") ? out.logo : "", color: isHex(out.primary) ? out.primary : (palette[0] || brand.color) };
    await db.upsertBrand(patch);
    res.json(patch);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

export default r;
