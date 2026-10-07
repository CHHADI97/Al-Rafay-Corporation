# الرافع کارپوریشن اینڈ ٹریڈرز — Al Rafay Corporation & Traders

Bilingual (اردو + English) website and admin panel for a new & used car dealership
on Lethrar Road, Thanda Pani (Harno), Islamabad.

- Public site: car inventory with search, filters and sorting, per-car pages with photo
  galleries, owners' click-to-call / WhatsApp buttons, Google Map, floating WhatsApp button.
- Admin panel at `/admin`: **Google sign-in only**, one allowed Gmail address, full control of
  cars, photos, prices, featured/sold flags, owners, business text, location and logo.
- Stack: Node.js + Express, server-rendered HTML shells, vanilla ES modules, and
  **Supabase** (Postgres + Auth + Storage) as the database, login and image store.
- Runs with **zero configuration** in demo mode, so the site can be reviewed before
  Supabase is connected.

## Quick start

```bash
npm install
npm start             # http://localhost:4173  (admin at /admin)
npm run check:all     # 138 automated checks — API, pages, rendering, dashboard
```

Demo mode (no `.env`) keeps its data in `storage/demo-data.json`, seeded from `seed/*.json`,
and signs the admin in with the password `alrafay123` (change with `DEMO_ADMIN_PASSWORD`).

## Going live with Supabase (Google login + cloud database)

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → paste and run `supabase/schema.sql` (creates every table, the
   `car-images` Storage bucket, Row Level Security policies and the site settings).
3. Authentication → Providers → enable **Google** (add the Google client ID/secret from
   the Google Cloud console) and set the Site URL + Redirect URL to
   `https://your-domain/admin`.
4. Project Settings → API → copy the URL and anon key into `.env`
   (see `.env.example`). Restart the server — the log then prints `mode: supabase`.
5. Sign in at `/admin` with the Gmail address in `ADMIN_EMAIL`
   (`abdulhadicreates@gmail.com`). Change it any time under **Settings → Admin email**.
6. `npm run seed` uploads the demo inventory to Supabase so the dashboard is not empty.
   Delete or edit those sample cars before publishing.

`.env` is ignored by Git — never commit real keys.

## Everyday admin tasks (all mobile friendly)

| Task | Where |
| --- | --- |
| Add / edit / delete a car, price, mileage, specs, description | Cars → car → Save |
| Mark sold / available, choose featured cars | Cars list (✓ / ★ switches) or the editor |
| Upload, reorder, delete photos (first photo = cover) | Car editor → Photos (drag & drop, up to 12 at a time) |
| Change business name, tagline, address, hours, hero text | Settings → Business |
| Paste a new Google Maps link **or** embed code | Settings → Location |
| Change owners, phone numbers, WhatsApp numbers | Content → Owners |
| Edit stats / "why us" cards / FAQs | Content |
| Replace the logo | Settings → Logo |
| Change the single admin Gmail address | Settings → Admin |
| Read contact-form enquiries | Messages |

Changes appear on the public site immediately (the JSON API is cached for at most
20 seconds and the pages re-render from it).

## Project layout

```
src/                Express app, routes, validation, Supabase/demo data layer
  server.js         app + security headers + startup
  config.js         .env loading and mode detection
  data.js           all reads/writes (Supabase, or the offline demo store)
  routes/pages.js   HTML shells, SEO injection, sitemap, robots, manifest
  routes/public.js  public JSON API      routes/admin.js  admin API
public/             everything served to the browser
  index|cars|car|contact|404.html   generated shells — edit tools/pages/** instead
  admin/index.html  dashboard shell
  js/               core.js (runtime) · templates.js · per-page modules · admin.js
  css/              site.css · fonts.css · admin.css
  assets/           photos, fonts, icons, logo placeholder
tools/              build-pages.mjs, build-seed.mjs, prepare-images.mjs, seed.mjs, check.mjs
seed/               demo inventory + site content (JSON)
supabase/schema.sql database, storage bucket and RLS policies
storage/            demo store (git-ignored, created on first start)
```

`npm run build:pages` regenerates `public/*.html` from `tools/pages/**` — never hand-edit
the generated shells.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` / `npm run dev` | run the server (dev watches for changes) |
| `npm run check` | static audit (translations, hooks, photo files) + end-to-end API & page test |
| `npm run check:browser` | renders every page in a simulated browser and checks the markup, filters, gallery and Urdu switch |
| `npm run check:admin` | drives the real dashboard: sign-in, car edit/create, photo upload, settings, inbox |
| `npm run check:all` | all three suites — run this before deploying |
| `npm run seed` | push `seed/*.json` to Supabase (needs credentials) |
| `npm run build:pages` | rebuild the HTML shells |
| `npm run prepare-images` | optimise source photos into `public/assets/cars/**` |
| `npm run icons` | regenerate the PNG app icons from `public/favicon.svg` |

## Before you publish

- Replace the **placeholder images and demo prices** with the real cars; the current
  inventory is sample data for review.
- Upload the real logo (the header/footer currently show a temporary "97 Group" badge).
- Confirm the Google Map pin, phone numbers and opening hours in Settings.
- Serve over HTTPS behind your host's proxy; keep `.env` secret.
- Keep `storage/` persistent (demo mode) or your Supabase project backed up.

---

Website designed by **Abdul Hadi** · ویب سائٹ ڈیزائن: عبدالہادی
