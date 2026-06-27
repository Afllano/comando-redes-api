import { Router } from "express";
import { db } from "../store.js";

const r = Router();

// Carga perezosa del cliente de GA4 para que el server arranque aunque no tengas la libreria/credenciales.
async function gaClient() {
  let BetaAnalyticsDataClient;
  try { ({ BetaAnalyticsDataClient } = await import("@google-analytics/data")); }
  catch { throw new Error("Instala la libreria: npm i @google-analytics/data"); }
  const json = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (json) {
    const creds = JSON.parse(json);
    return new BetaAnalyticsDataClient({ credentials: creds });
  }
  // Si no hay JSON inline, usa GOOGLE_APPLICATION_CREDENTIALS (ruta al archivo).
  return new BetaAnalyticsDataClient();
}

// Reporte real de GA4 para una marca (necesita brand.gaId = "properties/123456789" o "123456789").
r.get("/analytics/:brandId", async (req, res) => {
  try {
    const brand = await db.brand(req.params.brandId);
    if (!brand) return res.status(404).json({ error: "Marca no encontrada" });
    if (!brand.gaId) return res.status(400).json({ error: "La marca no tiene ID de GA4 configurado" });

    const property = brand.gaId.startsWith("properties/") ? brand.gaId : `properties/${brand.gaId.replace(/^G-/, "")}`;
    const client = await gaClient();

    const [report] = await client.runReport({
      property,
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "totalUsers" }, { name: "sessions" },
        { name: "engagementRate" }, { name: "conversions" },
      ],
    });

    const days = (report.rows || []).map(row => ({
      date: row.dimensionValues[0].value,
      users: Number(row.metricValues[0].value),
      sessions: Number(row.metricValues[1].value),
      engagementRate: Number(row.metricValues[2].value),
      conversions: Number(row.metricValues[3].value),
    }));

    res.json({ property, days });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), hint: "Revisa el GA4 ID, el service account y que tenga acceso de lectura a la propiedad." });
  }
});

export default r;
