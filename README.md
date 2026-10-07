# Alraffay Corporation &amp; Traders — showroom website + admin panel

Website and dashboard for **Alraffay Corporation & Traders** (logo: *97 Group*), a used car
dealership at **Harno (Harnoi) Thanda Pani, Latrar Road, Islamabad**, run by
**Chaudhry Naeem Akhtar** (0315 552 1697) and **Chaudhry Faheem Akhtar** (0300 011 9297).

The site is a Node.js web app with no install dependencies: the public pages are plain
HTML/CSS/JavaScript, and the backend is one small Node process that serves the site, a JSON API
and the admin panel. Listings, photos, contact details and the map can all be changed from the
dashboard and appear on the live site immediately.

```
┌──────────────┐      ┌───────────────────┐      ┌────────────────────────┐
│  public site │◄────►│  Node server      │◄────►│  storage               │
│  /, /cars,   │ JSON │  server.mjs + api │      │  local JSON files  or  │
│  /car?id=…   │      │  + admin panel    │      │  Supabase (Postgres +  │
└──────────────┘      └───────────────────┘      │  Storage)              │
                                                 └────────────────────────┘
```

---

## 1. Quick start

```bash
npm start          # http://localhost:4173  (site)
                   # http://localhost:4173/admin  (dashboard)
npm run dev        # same, but restarts when you edit a file
npm run check      # syntax-check every server and browser script
```

Node 20 or newer is required. On the very first run the server prints a **one-time setup token**:

```
╭─ FIRST-RUN SETUP ────────────────────────────────────────
│ Open /admin and use this one-time setup token:
│   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
╰──────────────────────────────────────────────────────────
```

Open `/admin`, paste the token, and add the owner's Gmail address. From then on, only that
Google account (and any others you add in **Admin → Access**) can open the dashboard.

> **No Google account configured yet?** The dashboard also accepts an emergency password. You can
> generate one with `npm run password` or keep using the setup token. See
> [docs/GOOGLE-SIGNIN.md](docs/GOOGLE-SIGNIN.md).

## 2. What the website includes

**Home page**

* Full-height hero: the business name in a big display face, “View Cars” and “Contact Us” buttons,
  a WhatsApp button, live “cars in stock” count and a quick search (make → model → year → budget).
* **The drive-past lane:** Suzuki Mehran, Alto, Cultus, Wagon R, Toyota Corolla, Yaris, Prado,
  Hilux and Honda City, Civic slide across a lit showroom floor one after another in an endless
  loop. Each car has its own speed and spacing so the traffic looks natural. The lane pauses for
  `prefers-reduced-motion`, uses fewer cars on phones and with data-saver, and every image is a
  light WebP (~20 KB each).
* Featured cars, Browse by brand (live counts and “from” prices, plus model shortcuts), Why choose
  us, animated counters, Meet the owners (click-to-call + WhatsApp for both owners), contact form,
  Google Map and footer with the *“Website designed by Abdul Hadi”* credit.
* Floating WhatsApp button on every page, sticky call/WhatsApp bar on phone car pages.

**Inventory**

* `/cars` — search by keyword, filters for make, model, price range, year range and availability,
  seven sort orders, active-filter chips, “load more” paging, and every filter state stored in the
  URL so a filtered list can be shared or bookmarked.
* `/car?id=…` — gallery with thumbnails, swipe, keyboard arrows and full-screen zoom, a full spec
  table, description, related cars, and prominent **Call / WhatsApp the owner** buttons with the
  car reference pre-filled in the WhatsApp message.

**Everything below is edited from the dashboard**

| Setting | What it changes |
| --- | --- |
| Business name, short name, logo text, logo image | Header, footer, admin panel, SEO |
| Tagline, headline, hero paragraph, about text | Home page copy |
| Address, city, hours, phone numbers, WhatsApp number, email | Contact blocks, footer, click-to-call, WhatsApp deep links |
| Google Maps link **or** the full `<iframe>` embed code | The map on the home page (pasted embeds are validated) |
| Owners (name, role, phone, WhatsApp) | Owner cards, contact list, call bar, structured data |
| Counters, “Why choose us” cards, social links | Home page bands |
| SEO title, description, keywords | Page `<title>`, meta description, Open Graph |
| Cars: make, model, variant, year, price, mileage, fuel, transmission, engine, body type, colour, registration city, description, photos, **Sold / Available / Booked**, **Featured** | Listings, cards, detail pages, filters |

**SEO & performance**

* Server-rendered `<title>`, meta description, canonical URL and Open Graph/Twitter cards for the
  home page, every listing and the inventory page (so WhatsApp/Facebook links show a proper card).
* `AutoDealer` + `Car` JSON-LD structured data with prices in PKR, availability and owner details.
* `/sitemap.xml` (with listing images), `/robots.txt`, web manifest, SVG favicon.
* WebP images with `width`/`height` set to avoid layout shift, `loading="lazy"` below the fold, the
  first hero image preloaded, and strict security headers (CSP with per-request nonce).

## 3. Admin dashboard

Open `/admin`, sign in with Google, then:

* **Dashboard** — counts (listed / available / sold / featured / unread messages), total stock value,
  quick actions, recently added cars and a JSON backup download.
* **Cars** — searchable table with status/make filters and sorting; edit, duplicate or delete any
  listing; sold cars stay on the site marked “Sold”.
* **Add car** — the full listing form. Drag photos to set the cover, choose files or paste image
  links, and large photos are downscaled to 1600 px WebP in the browser before upload.
* **Messages** — every enquiry from the contact forms, with one-tap call, WhatsApp and email
  replies, read/unread and delete.
* **Business settings** — everything in the table above, including pasting a Google Maps embed code
  or link to move the map, and uploading the 97 Group logo (replaces the wordmark everywhere).
* **Access** — the list of Gmail addresses allowed to sign in, plus the emergency password controls.

Photos are written to `public/uploads/` in local mode, or to a Supabase Storage bucket when
Supabase is configured — deleting a car or a photo in the dashboard deletes the stored file too.

## 4. Configuration

Every setting is optional; create a `.env` file (copy `.env.example`) or use real environment
variables.

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST`, `DATA_DIR` | Server port (default 4173), bind address (default `0.0.0.0`), data folder |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enables **Sign in with Google** on `/admin` |
| `ADMIN_EMAILS` | Comma-separated Gmail addresses allowed into the dashboard (in addition to the stored list) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`, `SUPABASE_TABLE` | Use Supabase for data and photo storage |
| `COOKIE_SECURE` | `auto` (default) adds `Secure` to the session cookie; set `false` only for plain-HTTP local networks |

Step-by-step guides:

* [docs/GOOGLE-SIGNIN.md](docs/GOOGLE-SIGNIN.md) — create the OAuth client and restrict the
  dashboard to the owner's Gmail address.
* [docs/SUPABASE.md](docs/SUPABASE.md) — move listings and photos to Supabase (SQL included).

## 5. Project layout

```
server.mjs                 HTTP server, routing, page rendering hooks
src/config.mjs             environment + paths
src/store.mjs              data layer: local JSON files  or  Supabase Postgres + Storage
src/auth.mjs               Google token verification, admin allow-list, sessions, rate limits
src/api.mjs                JSON API (public + admin)
src/validate.mjs           input validation and sanitising
src/http.mjs               headers, cookies, JSON/multipart bodies, image sniffing
src/pages.mjs              SEO tokens, Open Graph, JSON-LD, sitemap, robots
src/static.mjs             static file serving for public/
public/index.html          home page
public/cars.html           inventory page
public/car.html            car detail page (rendered per listing)
public/404.html            not-found page
public/admin.html          dashboard shell
public/css/site.css        public design system (red / dark-grey / white theme)
public/css/admin.css       dashboard styles
public/js/core.js          shared helpers (API, formatting, cards, reveals, counters)
public/js/home.js          hero lane, featured cars, brands, stats
public/js/inventory.js     filters, sorting, paging
public/js/detail.js        gallery, specs, contact actions
public/js/admin.js         whole dashboard
seed/                      starting inventory + site settings (copied to storage on first run)
tools/build_images.py      normalise studio photos (Python + Pillow)
tools/derive_placeholders.py  placeholder listing photos
tools/smoke-test.mjs       end-to-end check of every page and the dashboard
docs/                      setup guides
```

## 6. Before you go live — owner checklist

1. **Replace the demo data.** `seed/cars.json` ships 30 sample listings with realistic but
   **indicative prices**. Delete or edit them in the dashboard and enter your real stock, prices,
   mileage and photos (the dashboard warns about nothing — it trusts you, so be accurate).
2. **Photos.** The car photos shipped in this repository are placeholders (see *Image credits*
   below). Replace each one with real photographs of your vehicles from **Admin → Cars → photos**.
3. **Check the numbers.** Confirm the address, both phone numbers, the WhatsApp number, business
   hours and the Google Maps pin in **Admin → Business settings**.
4. **Google sign-in.** Create the OAuth client, set `GOOGLE_CLIENT_ID`, sign in with the owner's
   Gmail, then disable the emergency password in **Admin → Access**.
5. **HTTPS.** Run behind HTTPS (nginx/Caddy/Cloudflare). The session cookie is `Secure` by default.
6. **Backups.** Keep `storage/` (or your Supabase project) backed up — the dashboard has a JSON
   export button, but that is not a substitute for backups.
7. **Upload the logo.** Until the 97 Group artwork is uploaded, the header and footer show a
   styled “97 GROUP” wordmark placeholder.
8. **Add analytics** (Google Analytics / Meta pixel) if you want them — nothing is tracked today.

## 7. Image credits and placeholders

`public/assets/img/` contains:

* `cars/*.webp` — studio-style listing covers. These are **AI-generated placeholders**; several
  models share a base photo with a different crop/zoom so each listing still looks distinct.
* `hero/*.webp` — smaller versions of the same images, used by the animated hero lane.
* `photos/*.jpg` — a few scene photographs used as secondary gallery images (sourced from Wikimedia
  Commons under CC BY-SA 4.0; sources are listed in `public/assets/img/photos/_credit.json`).
* `showroom.jpg` — showroom interior used as a fallback image and social preview.

All of it is meant to be replaced with real photographs of the real cars. Regenerating the
placeholder sets (optional, needs Python + Pillow):

```bash
python3 tools/build_images.py          # rawcars/*.png → cars/ and hero/ (normalise to white)
python3 tools/derive_placeholders.py   # crop/mirror variants for models without their own photo
```

## 8. Testing

```bash
npm run check                       # syntax check server + browser scripts
npm install --no-save jsdom         # only needed for the smoke test
node tools/smoke-test.mjs           # drive every page and the dashboard in a DOM
```

The smoke test loads `/`, `/cars` and `/car?id=…`, exercises the filters, signs into the dashboard,
opens the car editor and prints what each page produced. It exits non-zero if any script error is
raised.

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Google sign-in is not configured” | Set `GOOGLE_CLIENT_ID` (and the matching JavaScript origin) and restart, or use the emergency password |
| Everything is refused with “not an allowed administrator” | Add that exact Gmail address in **Admin → Access** (or `ADMIN_EMAILS`) |
| Uploaded photos vanish after a redeploy | The host wiped the filesystem — attach a persistent volume to `public/uploads` + `storage/`, or switch to Supabase |
| Map is blank | Paste the full `<iframe …>` block from Google Maps → Share → Embed a map into **Admin → Business settings** |
| Prices look wrong in the hero counters | The “Cars in stock today” counter is always live; other counters come from **Business settings → Counters** |

## 10. Support

Built for Alraffay Corporation & Traders by **Abdul Hadi** — the credit line appears in the footer
and can be edited in **Admin → Business settings**.
