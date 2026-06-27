import { Router } from "express";
import { db } from "../store.js";

const r = Router();

r.get("/brands", async (_req, res) => res.json(await db.brands()));
r.post("/brands", async (req, res) => {
  const b = req.body;
  if (!b?.id || !b?.name) return res.status(400).json({ error: "id y name son obligatorios" });
  res.json(await db.upsertBrand(b));
});
r.delete("/brands/:id", async (req, res) => { await db.deleteBrand(req.params.id); res.json({ ok: true }); });

r.get("/posts", async (_req, res) => res.json(await db.posts()));
r.put("/posts", async (req, res) => { await db.setPosts(req.body || []); res.json({ ok: true }); });

export default r;
