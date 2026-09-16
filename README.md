# cloudflare-serverless-api

Starter template: pnpm monorepo + [Hono](https://hono.dev) + [Better Auth](https://www.better-auth.com) on Cloudflare Workers (D1, KV, R2).

**What this is**: the base wiring you need before writing a single feature — auth, DB, bindings, CORS, health check.

**What this deliberately excludes**: any prescribed feature/module architecture (domain/application/infrastructure or otherwise — not fixed on purpose), a mobile client, testing, CI. Add those as your project needs them.

## Prerequisites

- Node.js + [pnpm](https://pnpm.io)
- A Cloudflare account
- `npx wrangler login` (or be already logged in)

## Setup

```bash
pnpm install
```

Create the Cloudflare resources this template binds to:

```bash
npx wrangler d1 create <your-db-name>
npx wrangler kv namespace create <your-kv-name>
npx wrangler r2 bucket create <your-bucket-name>
```

Paste the resulting `database_name`/`database_id`/KV `id`/bucket name into `apps/api/wrangler.toml` (replacing the `REPLACE_ME_*` placeholders). If `wrangler` can't pick an account automatically (you're logged into more than one), uncomment `account_id` in `wrangler.toml` or export `CLOUDFLARE_ACCOUNT_ID`.

Once real IDs are in place, stop git from tracking further local edits to that file:

```bash
git update-index --assume-unchanged apps/api/wrangler.toml
```

(Reverse with `git update-index --no-assume-unchanged apps/api/wrangler.toml` if you want to track changes again — e.g. after forking this template for a new project.)

Copy the local secrets file and fill it in:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

- `BETTER_AUTH_SECRET`: generate with `openssl rand -base64 32`
- `BETTER_AUTH_URL`: `http://localhost:8787` for local dev
- `RESEND_API_KEY`: from [resend.com](https://resend.com) — only needed for the email OTP flow

Generate Better Auth's Drizzle schema, then the migration, then apply it locally:

```bash
pnpm auth:generate   # reads apps/api/src/auth/index.ts, writes src/db/auth.schema.ts
pnpm db:generate      # drizzle-kit generate -> apps/api/drizzle/*.sql
pnpm db:migrate:dev   # applies migrations to local D1 (miniflare)
```

Run it:

```bash
pnpm dev
```

`GET http://localhost:8787/health` should return `{"status":"ok",...}`.

## Deploying

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
npx wrangler secret put RESEND_API_KEY
pnpm db:migrate:prod
pnpm deploy
```

## Adding features

There's no `src/modules/` folder and no imposed layering — add routes/schemas/logic however fits the project. A couple of starting points:

- `apps/api/src/index.ts` — mount new Hono sub-routers here (`app.route("/api", yourRoutes)`).
- `apps/api/src/db/schema.ts` — add your own Drizzle schema files and merge them into the exported `schema`.
- `apps/api/src/shared/http/resolve-context.ts` — `requireSession` is the only middleware shipped; add your own following the same pattern (e.g. requiring an active organization once you need one).
- `packages/shared` — shared zod types/DTOs between this API and any client you add later.

## Auth notes

- `apps/api/src/auth/index.ts` is the one file worth reading closely before changing anything. The `secondaryStorage` block is a real bugfix (better-auth-cloudflare's built-in KV storage is missing `increment`/`getAndDelete`, which better-auth's rate limiter needs) — don't remove it.
- The R2 file-storage config in the same file is unconditional on purpose (see the comment above it): it defines the `userFiles` table shape, which must match between CLI schema generation (no env) and runtime (real env). Making it conditional on `env?.R2_BUCKET` causes a "Drizzle schema mismatch" error on every auth request in production. If you don't need file uploads, delete the whole `r2: {...}` block (and rerun `auth:generate`/`db:generate`/migrate), not just the condition.
- The `organization()` plugin is included with no config (multi-tenant orgs, no teams). Remove the plugin entirely if you don't need it.

## Using this as a template

Once pushed to GitHub, mark the repo as a template ("Settings" → "Template repository") to get the "Use this template" button for future projects.
