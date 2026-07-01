import { Router } from "express";

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

// Diagnostico temporal: confirma si la variable de entorno llego al servidor, sin exponer su contenido.
r.get("/analytics-debug", (_req, res) => {
  const json = process.env.GA_SERVICE_ACCOUNT_JSON;
  let parseOk = false, parseError = "", hasPrivateKey = false, clientEmail = "";
  if (json) {
    try { const c = JSON.parse(json); parseOk = true; hasPrivateKey = !!c.private_key; clientEmail = c.client_email || ""; }
    catch (e) { parseError = e.message; }
  }
  res.json({ present: !!json, length: json ? json.length : 0, parseOk, parseError, hasPrivateKey, clientEmail });
});

// Reporte real de GA4 a partir de un ID de propiedad (?gaId=123456789 o properties/123456789).
// No depende de la base del backend: el frontend guarda las marcas en el navegador y manda el gaId directo.
r.get("/analytics", async (req, res) => {
  try {
    const gaId = req.query.gaId;
    if (!gaId) return res.status(400).json({ error: "Falta gaId" });

    const property = gaId.startsWith("properties/") ? gaId : `properties/${gaId.replace(/^G-/, "")}`;
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
