# Google sign-in for the admin panel

The dashboard is restricted to Google sign-in. Only the Gmail addresses you allow can open
`/admin`; every other account is refused even if it is a real Google account.

There are two pieces:

1. **A Google OAuth client** — proves a sign-in really came from Google (`GOOGLE_CLIENT_ID`).
2. **An allow-list of Gmail addresses** — decides *who* may enter. Stored with your data and
   editable in **Admin → Access**, and/or set statically with `ADMIN_EMAILS`.

---

## Step 1 — Create the OAuth client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project
   (for example `alraffay-website`).
2. **APIs & Services → OAuth consent screen**
   * User type: **External**
   * App name: `Alraffay Corporation & Traders`, your support email, developer email.
   * Scopes: keep the default (`userinfo.email`, `userinfo.profile`, `openid`).
   * Publish the app (or add the owner's Gmail as a **Test user** while testing).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   * Application type: **Web application**
   * Name: `Alraffay website`
   * **Authorised JavaScript origins** — add every address people will sign in from:
     * `http://localhost:4173` (local testing)
     * `https://your-domain.com` (production)
   * You do **not** need an authorised redirect URI: the browser posts the Google ID token to the
     server, which verifies it with Google.
4. Copy the **Client ID** and the **Client secret**.

## Step 2 — Give them to the server

```bash
# .env
GOOGLE_CLIENT_ID=1234567890-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
ADMIN_EMAILS=owner@gmail.com
```

Restart the server. `/admin` now shows a **Sign in with Google** button, and the start-up log
confirms Google sign-in is ready.

`ADMIN_EMAILS` is optional but handy: it seeds the allow-list so the first sign-in needs no setup
token. You can add or remove addresses later in **Admin → Access** — the dashboard list and the
environment variable are merged (the environment can only add, never remove, so you always keep at
least one way in).

## Step 3 — First sign-in

* If `ADMIN_EMAILS` was set, just click the Google button.
* If the allow-list is still empty, the server prints a **one-time setup token** on start-up. Paste
  it into the setup form together with the owner's Gmail address; that address is saved and the
  token is thrown away.

## Step 4 — Turn off the password fallback

The dashboard ships with an emergency password so you can get in before Google is configured.

* Set one with `npm run password` (prints a random one) or in **Admin → Access → Emergency password**.
* Once Google sign-in works, press **Disable** in **Admin → Access**. After that, Google is the only
  way in.

## How a sign-in is verified

1. The browser gets an ID token from Google Identity Services.
2. It posts that token to `POST /api/auth/google`.
3. The server verifies the token with Google (`oauth2.googleapis.com/tokeninfo`), and checks:
   * the token's `aud` equals your `GOOGLE_CLIENT_ID` (so it was issued for your site),
   * the email is verified,
   * the email is on the allow-list.
4. Only then is a session created: an `HttpOnly`, `SameSite=Lax`, `Secure` cookie that expires after
   12 hours, with a CSRF token required for every write from the dashboard.

Login attempts are rate-limited per IP address (12 per 10 minutes), sessions are pruned hourly, and
Google sign-in never exposes the client secret to the browser.

## Common problems

| Message | Cause and fix |
| --- | --- |
| `Google sign-in is not configured on this server yet` | `GOOGLE_CLIENT_ID` is missing — set it and restart |
| `This Google account belongs to a different app` | The client ID in `.env` does not match the one used by the page — check both |
| `… is not an allowed administrator for this website` | Add that exact address in **Admin → Access** |
| The Google button does not appear | The GIS script could not load (offline/blocked), or the browser blocked third-party scripts; check the console |
| `origin_mismatch` in the browser | Add the exact origin (`https://your-domain.com`, no trailing slash) to **Authorised JavaScript origins** |
