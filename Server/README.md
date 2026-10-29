# WaterWays server

Express API behind the WaterWays website and iOS app: river and station data, weather, history, favourites, settings and memberships. It listens on port 42069.

## Running

```
npm install
node server.js      # needs Server/.env (see below)
npm test            # 120+ tests; no database, network or keys needed
```

`ENABLE_SCHEDULER=false` stops the background sync and nightly roll-ups. Use it for any local server that points at the production database, so two servers never run them at once.

## Settings (`Server/.env`)

In production these come from the Forgejo secrets `SERVER_ENV_FILE` and `MONGO_URI`. A deploy stops before replacing the running containers if a required one is missing.

| Variable | Required | What it's for |
|---|---|---|
| `MONGO_URI` (or `MONGODB_URI`) | yes | The database. Without it the server starts but logs that it has no database. |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | yes | Sign-in (`@clerk/express`). |
| `STRIPE_SECRET_KEY` | yes | Website memberships. The server won't start without it. |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_ANUAL_PRICE_ID` | for Stripe | Checkout and Stripe webhooks. |
| `FRONTEND_URL` | for Stripe and invites | Links back to the website. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | for account deletion | Verifies Clerk's `user.deleted` webhook (`POST /clerk/webhook`). |
| `APPLE_APP_ID` | for App Store purchases | Numeric app ID; without it only sandbox purchases verify. |
| `APPLE_BUNDLE_ID`, `APPLE_SUBSCRIPTION_PRODUCT_IDS`, `APPLE_ROOT_CA_PATH` | no | Override the defaults in `controllers/appleSubscriptionController.js`. |
| `APPLE_ALLOW_UNSIGNED_TESTING` | never in production | Accepts unsigned Xcode StoreKit purchases on a local server (ignored when `NODE_ENV=production`). |
| `GOOGLE_MAPS_API_KEY` | for the website map | Station map page (`/api/proxy/map`). Restrict it to the WaterWays sites in Google Cloud. |
| `OPEN_METEO_API_KEY` | before charging | Switches weather to Open-Meteo's paid (commercial) API. The free API is non-commercial only. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | no | Error reporting (`utilities/monitoring.js`). Nothing is sent without a DSN. |
| `LOGGING_API_KEY` | for visitor stats | Protects `GET /l/daily`, `/weekly`, `/all` and `/stats`. |
| `ENABLE_SCHEDULER` | no | `false` turns off the sync and roll-ups. |

## Water data

Readings come from Environment Canada's real-time API every 10 minutes (`utilities/scheduler.js`). They're kept in tiers, and each night's roll-up moves older data down a tier:

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
| `npm run stations:catalogue [-- --apply --remove-discontinued --add-reporting]` | Compares stations with Environment Canada's catalogue. Its options correct names and coordinates, record real-time flags, remove discontinued stations, and add unlisted stations that are reporting. |
| `npm run migrate:river-favorites [-- --apply]` | Renames saved rivers to the current river names (run after catalogue renames). |
| `npm run audit:lifetime-premium` | Read-only: lifetime grants and invite links not made by an admin. |
| `npm run report:storage` | Read-only: collection sizes and where storage settles. |
| `npm run compact:storage` | Releases disk space after big deletions. |

Without their write option, scripts only report.

## Endpoints

**Public:**
- **Data:** `/details/rivers/:province`, `/details/coordinates/:id`, `/details/latest-water-data/:id`, `/details/latest-water-data?ids=A,B,C[&includeLastReported=true]`, `/details/water-data/:id/:days`.
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

**Webhooks:** `POST /subscription/webhook` (Stripe), `POST /clerk/webhook` (Clerk), `POST /sub/apple/notifications` (App Store).

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
