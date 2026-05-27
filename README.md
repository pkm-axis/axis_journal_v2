# Axis Journal

A trading journal for futures traders. Logs more than just P&L — the context, psychology, and rules around every trade — so the patterns that actually affect your edge become visible.

## Why

Most journals stop at "wins and losses". Axis tracks the *why* — the strategy you used, the mistake you made, what you were feeling, whether you followed your plan — and ties it back to per-instrument P&L math (tick value, commissions, R-multiple) so your numbers stay honest.

Built for prop-firm traders too: drawdown, daily loss limits, consistency rules, and challenge ROI are first-class concepts, not afterthoughts.

## Tech stack

- [SvelteKit](https://kit.svelte.dev/) + Svelte 5 runes
- [Supabase](https://supabase.com/) — Postgres, Auth, RLS, Storage
- [shadcn-svelte](https://www.shadcn-svelte.com/) + Tailwind CSS
- TypeScript end-to-end

## Development

```sh
npm install
npm run dev
```

Requires a Supabase project. Copy `.env.example` to `.env` and fill in:

```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Run the migrations under `supabase/migrations/` against your Supabase project, then `npm run dev`.

### Build

```sh
npm run build
npm run preview
```

## Releases

See the [releases page](../../releases) for the full changelog and feature list.
