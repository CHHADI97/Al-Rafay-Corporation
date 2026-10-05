# AL RAFAY CORPORATION

A bespoke, responsive English-language showroom website for Islamabad, built with Node.js and browser-native HTML, CSS and JavaScript. No framework or package installation is required.

## Run locally

- Install Node.js 20 or newer.
- Run `npm start`.
- Open `http://localhost:4173`.
- On the first start, the password-only owner login is provisioned with a **random one-time password** printed to the server terminal. Sign in at `/admin`. Only a salted scrypt password hash is stored. Change the initial password in **Admin → Security**.
- Or set `ADMIN_PASSWORD` (12+ characters) in a private `.env` file / hosting environment *before the first start*. The optional `.env.example` documents configuration. Do not publish real secrets in Git.

The admin dashboard also supports car inventory and image management, site/owner/location edits, password changes, and a private contact-form inbox. Uploaded photos, dashboard data and the initial generated password hash live under the ignored `storage/` directory; keep that directory persistent in production and back it up securely. Files uploaded through the dashboard are kept in ignored `public/uploads/`.

## Owner checklist before going live

- This initial build contains **demo inventory and indicative demo prices**. Replace or remove every sample listing, photo, mileage, condition and price in the admin dashboard before publishing. Confirm availability and pricing directly with the dealership.
- Confirm names, phone/WhatsApp numbers, location pin, Google Maps directions, and all vehicle information. Seed contact details reflect the latest owner-supplied message.
- Contact-form messages are stored privately in the dashboard inbox. They are **not emailed or texted automatically**; add and test an email/SMS provider if notifications are required.
- Run behind an HTTPS reverse proxy, use a unique strong owner password, keep `storage/` durable/private, restrict who can access backups, and set up monitoring and backups before production use. For multi-instance deployments, use shared durable storage and a shared session store (the included in-memory sessions are intended for one instance).

## Features

- English landing page for a premium Pakistan-focused pre-owned car dealership; local PKR pricing display, sample Suzuki Alto/Mehran, Toyota Corolla XLi/GLi, Yaris and SUV categories.
- Live brand/model/price/year/condition search and responsive car details.
- Secure owner login with random first-run password, scrypt hashing, HttpOnly/SameSite cookies, CSRF tokens, login rate limiting, and owner-only inventory/site/upload/inbox/password APIs.
- Admin CRUD, local photo upload, publishing controls, editable owner/business details, and a private contact inquiry inbox.
- Responsive layouts, light scroll/hover/hero motion with reduced-motion support, phone/WhatsApp actions, embedded Google Map and driving directions.
