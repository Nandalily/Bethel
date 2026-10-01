# Bethel SDA Church Database

A focused membership and Sabbath attendance dashboard for Bethel Seventh-day Adventist Church.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL. Demo credentials are:

- Username: `BETHEL`
- Password: `bethelsda12345`

The app runs in local preview mode with browser storage by default. To connect Supabase, create a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then run the SQL in `supabase-schema.sql` in the Supabase SQL editor. The UI keeps the local fallback for development, while member and attendance writes are also sent to Supabase when configured.
