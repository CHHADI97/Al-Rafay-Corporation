# Appetizer Fast Foods

Website for **Appetizer Fast Foods — Fast Food and Refreshments**, Nilore, Islamabad (Lehtrar Road, Pakistan). Contact: Naveed Ahmad, +92 301 5136842.

Built with a dependency-free Node.js HTTP server and plain HTML, CSS and JavaScript. No build step.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Home / brand: hero, "Explore Our Menu" and "Order Now", delivery badge, categories, welcome section |
| `/menu` | Menu by category with search, filters, photos, prices or "Price to be confirmed", availability, quantity and "Order This Item" |
| `/contact` | Contact details, Call Now, Order on WhatsApp, Get Directions, order form that opens WhatsApp |
| `/admin` | Owner dashboard (separate, not linked from the public site, `noindex`) |

Every public page carries the footer credit **Developed by Abdul Hadi**.

## Run locally

Requires Node.js 20 or newer.

```bash
cp .env.example .env        # optional; edit values as needed
npm start                   # http://localhost:4173
```

Without `ADMIN_PASSWORD`, the first start generates a random owner password and prints it once in the server log. Sign in at `/admin` and change it under Security. Nothing is hardcoded in the source.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4173` | HTTP port. Bind address is `0.0.0.0`. |
| `DATA_DIR` | `./storage` | Persistent data: menu, restaurant, delivery settings, admin password hash, sessions. Keep it persistent and backed up. |
| `ADMIN_PASSWORD` | unset | Initial owner password, used only when no admin credentials exist yet. Must be 12+ characters. |
| `TRUST_PROXY` | unset | Set to `true` only behind a trusted reverse proxy that sets `X-Forwarded-For`. Otherwise rate limits can be spoofed. |

## Admin dashboard

- Server-side session login (scrypt password hashing, HttpOnly `SameSite=Strict` cookie, CSRF tokens on every write).
- Login rate limiting per IP.
- Manage menu items: add, edit, delete, category, price, description, availability, published state.
- Upload, replace or remove item photos. Uploads are validated server-side (type by magic bytes, size limit) and stored in `public/uploads/`.
- Delivery settings: availability, charge, minimum order, areas, estimated time, note.
- Contact and location details.
- Password change.

Prices are empty by default, so the site shows "Price to be confirmed" until real prices are entered. Delivery charges, minimum order, areas and time are also empty until configured; the site then directs customers to WhatsApp to confirm.

## Ordering

The site never claims an order is placed, confirmed, paid or dispatched. The order form validates input, then opens WhatsApp with a pre-filled message (`encodeURIComponent`) to +92 301 5136842. The estimated total appears only when every line has a configured price.

## Project layout

```
server.mjs              HTTP server, API, admin auth, uploads
seed/menu.json          Initial menu (9 items, prices unset)
seed/restaurant.json    Initial contact, location and delivery settings
public/index.html       Home
public/menu.html        Menu
public/contact.html     Contact & Order
public/admin.html       Admin dashboard
public/404.html         Not-found page
public/styles.css       Shared stylesheet (responsive, reduced-motion aware)
public/js/              Page scripts (common, menu, contact, admin)
public/assets/img/food/ Photos (lazy-loaded below the fold)
public/uploads/         Admin-uploaded photos (git-ignored, contents not tracked)
```

## Deployment notes

- Run `npm start` behind HTTPS. Set `TRUST_PROXY=true` only when a trusted proxy sits in front.
- Mount a persistent volume for `DATA_DIR` and for `public/uploads/`. Ephemeral disks lose admin changes and photos on redeploy.
- Replace placeholder content before launch: real item prices, a real Milkshakes photo (currently a placeholder image), and delivery settings.

## Credit

Developed by Abdul Hadi.
