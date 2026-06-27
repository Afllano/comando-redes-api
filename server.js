import "dotenv/config";
import express from "express";
import cors from "cors";

import brands from "./src/routes/brands.js";
import audit from "./src/routes/audit.js";
import analytics from "./src/routes/analytics.js";
import meta from "./src/routes/meta.js";
import content from "./src/routes/content.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || "*" }));

app.get("/", (_req, res) => res.json({ name: "Comando Redes API", status: "ok", version: "0.1.0" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api", brands);
app.use("/api", audit);
app.use("/api", analytics);
app.use("/api", content);
app.use("/", meta); // rutas /auth/meta y /api/publish

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Comando Redes API en http://localhost:${port}`));
