// Tareas programadas. Ejecuta: npm run cron
// Conecta esto a un cron gratis: Render Cron Jobs, o GitHub Actions (.github/workflows con schedule),
// o pg_cron de Supabase. Asi corre solo sin que entres a la app.
import "dotenv/config";
import { db } from "./store.js";
import { auditSite } from "./ai.js";

const DAYS_15 = 15 * 86400000;

async function run() {
  const brands = await db.brands();
  const now = Date.now();
  for (const b of brands) {
    // 1) Auditoria del sitio cada ~15 dias
    if (b.website) {
      const last = b.lastAudit?.date ? new Date(b.lastAudit.date).getTime() : 0;
      if (now - last >= DAYS_15) {
        try {
          const data = await auditSite(b);
          if (data) { await db.upsertBrand({ id: b.id, lastAudit: { date: new Date().toISOString(), data } }); console.log(`[audit] ${b.name} OK`); }
        } catch (e) { console.log(`[audit] ${b.name} ERROR: ${e.message}`); }
      }
    }
    // 2) Aqui se engancha el reporte diario de Analytics (cuando GA4 este conectado):
    //    importar el cliente de analytics, traer metricas y guardar un resumen en la marca.
  }
  console.log("cron terminado");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
