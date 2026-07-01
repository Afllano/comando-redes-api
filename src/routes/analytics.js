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
    return new BetaAnalyticsDataClient({
      projectId: creds.project_id,
      credentials: { client_email: creds.client_email, private_key: creds.private_key },
    });
  }
  // Si no hay JSON inline, usa GOOGLE_APPLICATION_CREDENTIALS (ruta al archivo).
  return new BetaAnalyticsDataClient();
}

const num = (v) => Number(v || 0);
// Traduce el rango pedido a fecha de inicio de GA4.
function startDateFor(range) {
  switch (range) {
    case "7d": return "7daysAgo";
    case "90d": return "90daysAgo";
    case "12m": return "365daysAgo";
    case "28d":
    case "30d": return "30daysAgo";
    default: return "28daysAgo";
  }
}

// Reporte enriquecido de GA4. Uso: /api/analytics?gaId=123456789&range=7d|28d|90d|12m
// No depende de la base del backend: el frontend guarda las marcas en el navegador y manda el gaId directo.
r.get("/analytics", async (req, res) => {
  try {
    const gaId = req.query.gaId;
    if (!gaId) return res.status(400).json({ error: "Falta gaId" });
    const property = gaId.startsWith("properties/") ? gaId : `properties/${gaId.replace(/^G-/, "")}`;
    const dateRanges = [{ startDate: startDateFor(req.query.range), endDate: "today" }];
    const client = await gaClient();

    // Corre un reporte y devuelve filas simplificadas; si falla (p.ej. demografia sin Google Signals), no rompe el resto.
    const run = async (cfg) => {
      try {
        const [rep] = await client.runReport({ property, dateRanges, ...cfg });
        return (rep.rows || []).map(row => ({
          keys: (row.dimensionValues || []).map(d => d.value),
          vals: (row.metricValues || []).map(m => num(m.value)),
        }));
      } catch { return []; }
    };
    const desc = (metric) => ({ orderBys: [{ metric: { metricName: metric }, desc: true }] });

    const [
      totals, series, gender, age, cities, countries, channels, sources, pages, devices, events,
    ] = await Promise.all([
      run({ metrics: [{ name: "totalUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "engagementRate" }, { name: "averageSessionDuration" }, { name: "conversions" }, { name: "bounceRate" }] }),
      run({ dimensions: [{ name: "date" }], metrics: [{ name: "totalUsers" }, { name: "sessions" }, { name: "conversions" }], orderBys: [{ dimension: { dimensionName: "date" } }] }),
      run({ dimensions: [{ name: "userGender" }], metrics: [{ name: "totalUsers" }] }),
      run({ dimensions: [{ name: "userAgeBracket" }], metrics: [{ name: "totalUsers" }], ...desc("totalUsers") }),
      run({ dimensions: [{ name: "city" }], metrics: [{ name: "totalUsers" }], limit: 8, ...desc("totalUsers") }),
      run({ dimensions: [{ name: "country" }], metrics: [{ name: "totalUsers" }], limit: 8, ...desc("totalUsers") }),
      run({ dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], limit: 10, ...desc("sessions") }),
      run({ dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "sessions" }], limit: 10, ...desc("sessions") }),
      run({ dimensions: [{ name: "pagePath" }, { name: "pageTitle" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "userEngagementDuration" }], limit: 12, ...desc("screenPageViews") }),
      run({ dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "totalUsers" }], ...desc("totalUsers") }),
      run({ dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 20, ...desc("eventCount") }),
    ]);

    const t = totals[0]?.vals || [];
    const catLabel = { male: "Hombres", female: "Mujeres", unknown: "Sin dato" };
    const payload = {
      property,
      range: req.query.range || "28d",
      totals: {
        users: t[0] || 0, newUsers: t[1] || 0, sessions: t[2] || 0, pageViews: t[3] || 0,
        engagementRate: t[4] || 0, avgSessionDuration: t[5] || 0, conversions: t[6] || 0, bounceRate: t[7] || 0,
      },
      series: series.map(x => ({ date: x.keys[0], users: x.vals[0], sessions: x.vals[1], conversions: x.vals[2] })),
      gender: gender.map(x => ({ label: catLabel[x.keys[0]] || x.keys[0], users: x.vals[0] })),
      age: age.filter(x => x.keys[0] !== "unknown").map(x => ({ label: x.keys[0], users: x.vals[0] })),
      cities: cities.filter(x => x.keys[0] && x.keys[0] !== "(not set)").map(x => ({ label: x.keys[0], users: x.vals[0] })),
      countries: countries.filter(x => x.keys[0] && x.keys[0] !== "(not set)").map(x => ({ label: x.keys[0], users: x.vals[0] })),
      channels: channels.map(x => ({ label: x.keys[0], sessions: x.vals[0] })),
      sources: sources.filter(x => x.keys[0] && x.keys[0] !== "(not set)").map(x => ({ label: x.keys[0], sessions: x.vals[0] })),
      pages: pages.map(x => ({ path: x.keys[0], title: x.keys[1], views: x.vals[0], users: x.vals[1], avgTime: x.vals[1] ? x.vals[2] / x.vals[1] : 0 })),
      devices: devices.map(x => ({ label: x.keys[0], users: x.vals[0] })),
      events: events.map(x => ({ name: x.keys[0], count: x.vals[0] })),
    };
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), hint: "Revisa el GA4 ID, el service account y que tenga acceso de lectura a la propiedad." });
  }
});

export default r;
