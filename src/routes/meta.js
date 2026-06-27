import { Router } from "express";
import { db } from "../store.js";

const r = Router();
const GRAPH = "https://graph.facebook.com/v21.0";

// 1) Iniciar conexion: redirige al login de Meta para autorizar la cuenta.
r.get("/auth/meta", (req, res) => {
  const { brandId } = req.query;
  if (!process.env.META_APP_ID) return res.status(500).send("Falta META_APP_ID en el .env");
  const scope = [
    "instagram_basic", "instagram_content_publish",
    "pages_show_list", "pages_read_engagement", "pages_manage_posts",
  ].join(",");
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.META_APP_ID}`
    + `&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}`
    + `&state=${encodeURIComponent(brandId || "")}&scope=${scope}`;
  res.redirect(url);
});

// 2) Callback: intercambia el code por un token de larga duracion y lo guarda en la marca.
r.get("/auth/meta/callback", async (req, res) => {
  try {
    const { code, state: brandId } = req.query;
    const tokenRes = await fetch(`${GRAPH}/oauth/access_token?client_id=${process.env.META_APP_ID}`
      + `&client_secret=${process.env.META_APP_SECRET}`
      + `&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI)}&code=${code}`);
    const token = await tokenRes.json();
    if (token.error) throw new Error(token.error.message);
    if (brandId) await db.upsertBrand({ id: brandId, meta: { token: token.access_token, connectedAt: new Date().toISOString() } });
    res.send("Cuenta de Meta conectada. Puedes cerrar esta ventana.");
  } catch (e) { res.status(500).send("Error conectando Meta: " + (e.message || e)); }
});

// 3) Publicar una foto en Instagram (flujo de 2 pasos del Graph API).
//    Necesita: token de la marca, instagramUserId, imagen accesible por URL publica.
export async function publishToInstagram({ igUserId, token, imageUrl, caption }) {
  const create = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  }).then(x => x.json());
  if (create.error) throw new Error(create.error.message);
  const publish = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ creation_id: create.id, access_token: token }),
  }).then(x => x.json());
  if (publish.error) throw new Error(publish.error.message);
  return publish; // { id }
}

r.post("/publish/instagram/:brandId", async (req, res) => {
  try {
    const brand = await db.brand(req.params.brandId);
    if (!brand?.meta?.token) return res.status(400).json({ error: "Conecta Meta primero (/auth/meta)" });
    const { igUserId, imageUrl, caption } = req.body;
    const out = await publishToInstagram({ igUserId, token: brand.meta.token, imageUrl, caption });
    res.json(out);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

export default r;
