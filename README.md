# Comando Redes — Backend

Servidor que le da "vida real" a la app: guarda los datos, audita los sitios con IA, lee Google Analytics y publica en redes. El frontend (`comando-redes.jsx`) le habla a este backend.

Esta es una **base funcional para arrancar**. Lo que ya funciona apenas pongas tu llave de IA: guardar marcas/posts, auditar sitios y extraer logo + paleta. Las integraciones de Meta y Analytics están **cableadas y listas**, solo necesitan que tú registres las apps de desarrollador (eso solo lo puedes hacer tú con tus cuentas) y pegues las credenciales.

---

## Stack 100% gratis

| Pieza | Servicio gratis | Para qué |
|---|---|---|
| Frontend | **Vercel** | Tu app, con su dirección web |
| Backend | **Render** (Web Service free) o **Railway** | Este servidor |
| Base de datos | Empieza con `data.json` (incluido). Luego **Supabase** o **Neon** (Postgres free) | Guardar todo |
| Tareas automáticas | **Render Cron** o **GitHub Actions** (cron gratis) | Auditar cada 15 días, reporte diario |
| IA | **Anthropic** (saldo de prueba gratis) | Auditorías y contenido |

Arrancas con costo $0 y solo pagas si creces mucho.

---

## Correrlo en tu computador

```bash
cd backend
cp .env.example .env        # y pega tu ANTHROPIC_API_KEY
npm install
npm start                   # queda en http://localhost:8787
```

Prueba: abre `http://localhost:8787/api/health` → debe responder `{ ok: true }`.

Para que el frontend hable con el backend, en la app cambia el guardado local por llamadas a `http://localhost:8787/api/...` (te ayudo con ese cambio cuando despleguemos).

---

## Endpoints disponibles

- `GET /api/health` — chequeo
- `GET/POST /api/brands`, `DELETE /api/brands/:id` — marcas
- `GET/PUT /api/posts` — contenido
- `POST /api/audit/:brandId` — **auditoría del sitio con IA** (funciona ya)
- `POST /api/identity/:brandId` — **logo + paleta del sitio** (funciona ya)
- `GET /api/analytics/:brandId` — reporte real de GA4 (necesita credenciales de Google)
- `GET /auth/meta?brandId=...` — conectar Instagram/Facebook
- `POST /api/publish/instagram/:brandId` — publicar en Instagram

---

## Checklist de integraciones (en orden recomendado)

### 1) IA — listo en 2 minutos ✅
1. Entra a `console.anthropic.com`, crea una API key.
2. Pégala en `.env` → `ANTHROPIC_API_KEY=`.
3. Ya puedes auditar sitios y extraer identidad de marca.

### 2) Google Analytics 4 — reportes reales
1. En Google Cloud (gratis) crea un **Service Account** y descarga su JSON.
2. En tu propiedad GA4 → Administrar → Acceso → agrega el email del service account como **Lector**.
3. Pega el JSON en `.env` (`GA_SERVICE_ACCOUNT_JSON`) y pon el ID de la propiedad en cada marca (campo GA4 de la app).
4. `npm i @google-analytics/data` y listo: `GET /api/analytics/:brandId` trae datos reales.

### 3) Meta (Instagram + Facebook) — publicar
1. En `developers.facebook.com` crea una app (gratis) y agrega el producto **Instagram**.
2. Copia App ID y App Secret al `.env`. Pon la `META_REDIRECT_URI` en la config de la app.
3. La cuenta de Instagram debe ser **profesional/creador** y estar ligada a una **página de Facebook**.
4. Para publicar a cuentas que no sean tuyas, Meta exige **App Review** (verificación). Para tus propias cuentas funciona en modo desarrollo.
5. Conecta desde `/auth/meta?brandId=...` y publica con el endpoint de Instagram.

### 4) TikTok y LinkedIn — fase posterior
Ambas tienen API de publicación pero requieren solicitud y aprobación. Las dejamos para después de tener Meta + Analytics andando.

---

## Automatizar (cron)

`npm run cron` recorre las marcas, audita las que llevan +15 días y deja listo el reporte diario.
Conéctalo a Render Cron o a un workflow de GitHub Actions con `schedule` para que corra solo, sin que entres a la app.

---

## Lo que NO puedo hacer por ti

Registrar las apps de desarrollador de Meta/Google/TikTok con tus datos, ni aprobar la verificación de Meta — eso es tuyo. Yo dejo el código que usa esas credenciales. El despliegue (Vercel + Render) lo armamos juntos paso a paso; se hace mucho mejor desde Claude Code que desde el chat.
