# Appetizer Fast Foods

A premium, responsive restaurant website for Nilore, Islamabad — built with Node.js and vanilla HTML, CSS and JavaScript. No framework or build step required.

## Run locally

- Install Node.js 20 or newer.
- Run `npm start`.
- Open `http://localhost:4173`.
- On first start, a **random one-time owner password** is printed to the terminal. Sign in at `/admin`. Only a salted scrypt hash is stored. Change it in **Admin → Security**.
- Or set `ADMIN_PASSWORD` (12+ characters) in a private `.env` file before first start. See `.env.example`.

The admin dashboard supports menu & gallery management, business details, opening hours, site contact info, image uploads and a private contact inbox. Data lives under the ignored `storage/` directory; uploads live under ignored `public/uploads/`.

## Before going live

- Menu prices are shown as **“Price to be confirmed”** when no price is set. Set or confirm each item’s price and availability in the admin panel before sharing the site.
- Confirm business name, contact person (Naveed Ahmad), phone & WhatsApp **+92 301 5136842**, address **Lehtrar Road, Nilore, Islamabad** and Google Maps search link. Verify timings and gallery photos.
- Contact-form messages are stored privately in the dashboard inbox; they are **not emailed automatically**. Add an email/SMS provider if needed.
- Run behind HTTPS, use a strong unique owner password, keep `storage/` durable/private, back it up securely and monitor. For multi-instance deployments, use shared storage and a shared session store (in-memory sessions are for single instance).

## Features

- Premium restaurant branding with warm orange/red, deep charcoal and cream; subtle animations, rounded cards, hover effects and reduced-motion support.
- Full menu for 9 items across Burgers, Shawarma, Chaat and Refreshments, Snacks, BBQ and Chicken, Beverages; category filters, featured “Popular Favourites”, and availability toggles.
- WhatsApp ordering: every menu card has **Order Now** with quantity picker. Message is dynamically encoded:  
  `Assalam-o-Alaikum! I would like to order from Appetizer Fast Foods. Item: Zinger Burger. Quantity: 1. Please confirm the price and availability.`  
  Also floating WhatsApp button and correctly encoded `https://wa.me/923015136842?text=...` links.
- Sections: hero, popular favourites, full menu, about, gallery with lightbox, “Why choose us”, location & contact with Call Now / WhatsApp Us / Get Directions, map embed via search query `https://www.google.com/maps/search/?api=1&query=Appetizer+Fast+Foods+Nilore+Islamabad+Lehtrar+Road`.
- Secure admin login with scrypt hashing, HttpOnly SameSite cookies, CSRF tokens, rate limiting, owner-only APIs, upload validation (JPEG/PNG/WebP ≤5 MB) and server-side validation.
- Responsive, semantic HTML, accessible controls, lazy loading, optimized assets, no broken links.
- Footer credit: **Developed by Abdul Hadi** with dynamic copyright year.

## Owner setup

1. First run prints the owner password or uses `ADMIN_PASSWORD`.
2. Visit `/admin` → update menu items (photos, names, descriptions, prices, categories, available/featured/published).
3. Update business details & opening hours, manage gallery photos, check inbox.
4. Test every WhatsApp button, call link, directions link, filters, mobile nav and forms on phone & desktop.
