# Supabase storage (database + photos)

Out of the box the site keeps its data in JSON files under `storage/` and photos in
`public/uploads/`. That works on any host with a persistent disk.

If your host has an **ephemeral filesystem** (Vercel, Netlify, many container platforms) or you want
the same data available to several instances, point the site at Supabase: listings, settings and
enquiries move to Postgres, and uploaded photos move to a Storage bucket.

You only need two values, and the switch is instant — no code changes.

---

## Step 1 — Create the project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run:

```sql
-- One row per document (cars, site settings, enquiries, admin allow-list, password hash).
create table if not exists public.rafay_documents (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- The server talks to Supabase with the service-role key only.
-- Row level security stays on with no public policies, so nothing is readable
-- with the anon key.
alter table public.rafay_documents enable row level security;

-- Optional: keep an eye on when each document last changed.
create or replace function public.touch_rafay_documents()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rafay_documents_touch on public.rafay_documents;
create trigger rafay_documents_touch
  before update on public.rafay_documents
  for each row execute function public.touch_rafay_documents();
```

3. Open **Storage → New bucket** and create a bucket named `alraffay-media`. Leave it **public**
   (the images are shown on the public website), or make it private and serve it through signed
   URLs later.

4. Open **Project settings → API** and copy:
   * **Project URL** → `SUPABASE_URL`
   * **service_role secret** → `SUPABASE_SERVICE_KEY` (server-side only — never put this in the
     browser, and never commit it)

## Step 2 — Configure the server

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
SUPABASE_BUCKET=alraffay-media
```

Restart. The start-up log now reads `Storage  Supabase (Postgres + Storage)`, and the badge in the
dashboard header shows **Supabase**.

## Step 3 — Move your existing data across

On the first run against an empty project, the server seeds `cars.json` and `site.json` from
`seed/`, so you start with the same content structure. To copy an existing local install:

1. In the dashboard, press **Download backup (JSON)** (Admin → Dashboard) to get `cars`, `site` and
   `inquiries`.
2. Insert them into the table:

```sql
insert into public.rafay_documents (key, data) values
  ('cars.json',      '[... paste the cars array ...]'),
  ('site.json',      '{... paste the site object ...}'),
  ('inquiries.json', '[... paste the enquiries array ...]')
on conflict (key) do update set data = excluded.data, updated_at = now();
```

(In the Supabase dashboard you can also paste the file contents straight into the table editor.)

3. Copy the photos from `public/uploads/` into the `alraffay-media` bucket under `cars/`, keeping
   the same file names. The stored image URLs are
   `https://<project>.supabase.co/storage/v1/object/public/alraffay-media/cars/<name>`.

## How it works

`src/store.mjs` implements both backends behind one interface:

```js
store.read('cars.json')            // Supabase: select data from rafay_documents where key = …
store.write('cars.json', cars)     // Supabase: upsert on conflict (key)
store.saveImage(buffer, name, mime) // Supabase: POST to /storage/v1/object/<bucket>/cars/<name>
store.removeImage(url)             // Supabase: DELETE the object
```

Documents are small (the full inventory is a few hundred kilobytes), so one `jsonb` row each keeps
the schema trivial while writes stay atomic per document. Every write also refreshes an in-process
cache, so the public site serves reads from memory until the next change.

## Notes and limits

* Uploads are capped at 8 MB per file; the browser shrinks photos to 1600 px WebP before sending.
* Sessions are still held in the server's memory. With several instances behind a load balancer you
  would add a shared session store — mention it if you need that and it can be added.
* Public form submissions are rate-limited in memory (6 per IP per 15 minutes).
* Keep `SUPABASE_SERVICE_KEY` secret. The website never needs the anon key.

## Switching back

Delete the three `SUPABASE_*` variables and restart. The site returns to `storage/` and
`public/uploads/`; your Supabase data stays where it is.
