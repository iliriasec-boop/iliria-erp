# Iliria ERP (Next.js + Supabase)

## 1) Install
```
npm install
# or pnpm i
```

## 2) Env
Create `.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=YOUR_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

## 3) Database
- In Supabase, open **SQL Editor** and paste the contents of `sql/schema.sql` and run.
- Then (optional) run this as the first logged-in admin to create your org:
  - Open app locally, register a user at `/auth/register`, then call RPC via a temporary script or use SQL:
```
select create_org('Iliria');
```

## 4) Dev
```
npm run dev
```

## 5) Deploy (Vercel)
- New Project -> Import
- Set env vars above
- Deploy