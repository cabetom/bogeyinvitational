# Bogey Invitational ⛳

PWA del torneo de golf **Bogey Invitational**: scores, ranking stableford, matches por equipo (Pato vs Tano), premios, viaje, camionetas y presupuesto/splitwise.

**Stack:** Vite + React + TypeScript · PWA (vite-plugin-pwa) · Supabase (Postgres + Auth link mágico) · deploy en Vercel.

## Correr en local

1. Instalá dependencias:
   ```bash
   npm install
   ```
2. Copiá `.env.example` a `.env.local` y completá con los datos de tu proyecto Supabase
   (Project Settings → API — ambas son seguras para el cliente, las protege el RLS):
   ```
   VITE_SUPABASE_URL=https://hurqofpnnerqfgtvtwof.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. Levantá el server:
   ```bash
   npm run dev
   ```

## Base de datos

El esquema y los datos del 2025 están en [`db/`](db/):
- `01_schema.sql` — todas las tablas (multi-edición, hoyo por hoyo, neto, anti-duplicado).
- `02_seed_2025.sql` — datos reales del CBI 2025.
- `bogey_full_setup.sql` — los dos juntos (pegar en el SQL Editor de Supabase).

## Deploy (Vercel)

1. Subí el repo a tu GitHub personal.
2. En Vercel → New Project → importá el repo.
3. Cargá las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Environment Variables.
4. Framework: Vite. Build: `npm run build`. Output: `dist`.

## Pendiente

- Par + stroke index por hoyo de las 4 canchas y handicaps → habilita carga hoyo por hoyo + stableford neto.
- Panel de admin (crear fechas, armar parejas, cerrar resultados).
- Camionetas y presupuesto/splitwise (UI lista en el prototipo; falta cablear).
