# WaterWays server

Express API behind the WaterWays website and iOS app: river and station data, weather, history, favourites, settings and memberships. It listens on port 42069.

## Running

```
npm install
node server.js      # needs Server/.env (see below)
npm test            # 130+ tests; no database, network or keys needed
```

`ENABLE_SCHEDULER=false` stops the background jobs: the water sync, the nightly roll-ups and the 6-hourly Stripe membership sync. Use it for any local server that points at the production database, so two servers never run them at once.

## Settings (`Server/.env`)

In production these come from the Forgejo secrets `SERVER_ENV_FILE` and `MONGO_URI`. A deploy stops before replacing the running containers if a required one is missing.

| Variable | Required | What it's for |
|---|---|---|
| `MONGO_URI` (or `MONGODB_URI`) | yes | The database. Without it the server starts but logs that it has no database. |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | yes | Sign-in (`@clerk/express`). |
| `STRIPE_SECRET_KEY` | yes | Website memberships. The server won't start without it. |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_ANUAL_PRICE_ID` | for Stripe | Checkout and Stripe webhooks. Only subscriptions on these two prices grant premium; if either price is unset, any subscription does. |
| `FRONTEND_URL` | for Stripe and invites | Links back to the website. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | for account deletion | Verifies Clerk's `user.deleted` webhook (`POST /clerk/webhook`). |
| `APPLE_APP_ID` | for App Store purchases | Numeric app ID; without it only sandbox purchases verify. |
| `APPLE_BUNDLE_ID`, `APPLE_SUBSCRIPTION_PRODUCT_IDS`, `APPLE_ROOT_CA_PATH` | no | Override the defaults in `controllers/appleSubscriptionController.js`. |
| `APPLE_ALLOW_UNSIGNED_TESTING` | never in production | Accepts unsigned Xcode StoreKit purchases on a local server (ignored when `NODE_ENV=production`). |
| `OPEN_METEO_API_KEY` | before charging | Switches weather to Open-Meteo's paid (commercial) API. The free API is non-commercial only. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | no | Error reporting (`utilities/monitoring.js`). Nothing is sent without a DSN. |
| `OPEN_METEO_CALLS_PER_HOUR` | no | Budget for Open-Meteo calls across the server (default 300). Past it, or for a minute after a failed call, the last forecast (up to 6 hours old) is served instead. |
| `NODE_ENV` | `production` in production (set by the Dockerfile) | `production` stops accepting the localhost web origins (CORS and Clerk's `azp` check) and ignores `APPLE_ALLOW_UNSIGNED_TESTING`. |
| `EXTRA_CORS_ORIGINS` | no | More web origins, comma separated (for example a preview build). |
| `ENABLE_SCHEDULER` | no | `false` turns off the background jobs (water sync, roll-ups, Stripe sync). |

## Water data

Readings come from Environment Canada's real-time API every 10 minutes (`utilities/scheduler.js`). Each run fetches the last 6 hours for the whole network in one paged query, about 13 requests and 22 MB, and stores the listed stations. Environment Canada often publishes late, so a 6-hour window catches stragglers and covers a failed run. They're kept in tiers, and each night's roll-up moves older data down a tier:

| Age | Stored as | Where |
|---|---|---|
| last 7 days | every 5-minute reading | `stationdatas` |
| 8 to 30 days | hourly mean, min, max and reading counts | `stationarchives`, `period: 'hourly'` |
| 30 days to 12 months | daily figures | `stationarchives`, `period: 'daily'` |
| older | monthly means | `stationarchives`, `period: 'monthly'` |

The roll-up works one station at a time. It only deletes readings after their figures are stored, and it never overwrites existing figures. Charts get hourly rows with their min and max, so highs and lows stay exact. After a large deletion, run `npm run compact:storage` to give the space back to the drive.

## Scripts

Run these from `Server`. They use the database in `Server/.env`.

| Command | What it does |
|---|---|
| `npm run backfill:hydrometric-history -- <id\|--all>` | Imports historical monthly means (HYDAT). |
| `npm run backfill:provisional-daily -- <id\|--all> [--dry-run]` | Fills the recent months HYDAT doesn't cover yet, from Water Office's 18-month provisional data. |
| `npm run stations:catalogue [-- --apply [--remove-discontinued] [--add-reporting] [--remove-dead]]` | Compares stations with Environment Canada's catalogue. `--apply` corrects names and coordinates and records real-time flags; with it, the other options remove discontinued stations, add unlisted stations that are reporting, and remove uncatalogued stations that have never had any data. Without `--apply` they only say what they would do. |
| `npm run clean:implausible-readings [-- --apply]` | Clears stored sentinel readings (such as -99999). |
| `npm run migrate:river-favorites [-- --apply]` | Renames saved rivers to the current river names (run after catalogue renames). |
| `npm run audit:lifetime-premium` | Read-only: lifetime grants and invite links not made by an admin. |
| `npm run report:storage` | Read-only: collection sizes and where storage settles. |
| `npm run compact:storage` | Releases disk space after big deletions. |

The catalogue sync, the cleanup and the river migration only report without `--apply`; the backfills and `compact:storage` write when run. Every script that writes prints the database host and name (never the credentials) before it connects.

## Endpoints

**Public:**
- **Data:** `/details/rivers/:province`, `/details/coordinates/:id`, `/details/latest-water-data/:id`, `/details/latest-water-data?ids=A,B,C[&includeLastReported=true][&includeTrend=true]` (the trend is the last day as hourly means, plus the 24-hour change, for the river and favourites cards), `/details/water-data/:id/:days`.
- **Weather:** `/details/weather/:id`, `/details/weather/hourly/:id`, `/details/weather/weekly/:id`, `/details/pressure/:id` (past 2 days and the forecast).
- **Alerts:** `/details/alerts/:id`, Environment Canada weather alerts.
- **Search:** `/search/search-all-rivers?query=`.
- **Health:** `/health` reports the database state.

Successful public responses are cacheable for a short time (`middleware/cacheControl.js`).

**Signed in:**
- `/u/favorites`
- `/s/:userId` (own settings only)
- `/sub/*` (memberships, including Apple purchases)
- `/inv/redeem`

**Premium:** `/details/water-history/:id`, `/details/water-records/:id` (official record highs and lows), `/details/water-archive/:id/:period`.

**Admin:** `/inv/generate`, `/inv/list`.

**Webhooks:** `POST /subscription/webhook` (Stripe), `POST /clerk/webhook` (Clerk), `POST /sub/apple/notifications` (App Store). Stripe only sends the events selected for the endpoint in its dashboard. Select `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` and `charge.dispute.created`. Anything missed is picked up by the 6-hourly sync, except disputes: a chargeback cancels the subscription straight away only if `charge.dispute.created` is selected (inquiries and refunds don't cancel). A Stripe event that fails to process answers 500, so Stripe retries it; event types the server doesn't track answer 200.

**Stripe API version:** every request uses `2025-04-30.basil`, pinned in `utilities/stripe.js` so that upgrading the `stripe` package doesn't change what Stripe returns. Change it only together with the code that reads Stripe objects. Webhook payloads use the version set on the endpoint in the Stripe dashboard instead; the handler reads only the event's `customer` (and, for checkouts, `client_reference_id` and `metadata.userId`; for disputes, `charge` and `status`), then fetches the subscription through the pinned client, so the endpoint's version doesn't change what's stored.

## Environment Canada API notes

These are behaviours of `api.weather.gc.ca` the code relies on (checked October 2026):

- **Paging:** `limit` up to 10,000 with `offset` works, including past 100,000 results. A short page means the end.
- **Filters:** `STATION_NUMBER`, `datetime=start/end` (UTC, ISO 8601), `sortby=DATETIME` or `-DATETIME`, `properties=…` and `skipGeometry=true`. The last two cut the size of real-time responses by about two-thirds.
- **Real-time readings** (`hydrometric-realtime`): UTC timestamps, about 30 days kept, and readings often published an hour or more late. `LEVEL` or `DISCHARGE` can be null, and missing values sometimes arrive as sentinels like 99999, which `utilities/waterQuality.js` drops.
- **History:**
  - `hydrometric-daily-mean` and `hydrometric-monthly-mean` come from HYDAT, which lags about a year. Water Office (`wateroffice.ec.gc.ca/services/real_time_data/csv/inline`) fills the gap with 18 months of provisional data.
  - `hydrometric-annual-peaks` gives yearly instantaneous highs and lows.
- **Stations** (`hydrometric-stations`): about 8,000 stations with `STATUS_EN` and `REAL_TIME`. Some active real-time stations are missing from it.
- **Alerts** (`weather-alerts`): active alerts, one feature per alert area (a polygon), with type, colour, text and expiry.
- **Limits and licence:** no rate limits are documented. The sync stays around 13 requests every 10 minutes. The data is under the Open Government Licence – Canada, which requires the credit below.

## Data sources and credits

- **Environment and Climate Change Canada:** water levels and flows, the station catalogue, yearly records and weather alerts. Shown with "Contains information licensed under the Open Government Licence – Canada".
- **Open-Meteo:** weather forecasts and pressure, licensed CC BY 4.0. The free API is for non-commercial use.

Both apps show these credits: a footer on the website, and the About screen on iOS.

## Deploying

Pushing to `subscription` runs `.forgejo/workflows/ci-cd.yml`:
1. Write the env files from secrets.
2. Check the required settings.
3. Run `npm test`.
4. Build, then replace the containers.

A failure at step 2 or 3 leaves the running version untouched.

The server image is `node:22-alpine` with `NODE_ENV=production`, installs from the lockfile (`npm ci --omit=dev`) and runs as the unprivileged `node` user, which owns `/app/logs`. Settings reach the container as environment variables from `Server/.env` (docker-compose `env_file`); `.env`, `logs/`, `test/`, the `*-report.txt` files and the Markdown docs are kept out of the image (`.dockerignore`). The workflow installs a pinned docker-compose release and checks its SHA-256.
