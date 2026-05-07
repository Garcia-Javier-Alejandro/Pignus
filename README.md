# Pignus

Pignus connects a Mercado Libre seller account to a Google Sheet.

It fetches paid Mercado Libre orders, transforms them into a financial table, and appends only new rows to Google Sheets. A Cloudflare Cron Trigger runs the sync automatically once per day.

## What It Does

1. Fetch all paid Mercado Libre orders from the seller account.
2. Build the output table expected by the Google Sheet.
3. Skip orders already present in column A.
4. Append only new rows to the configured sheet tab.

All API calls happen inside Cloudflare Pages Functions so OAuth tokens and service account credentials stay server-side.

## Output Table

The exported Google Sheets table uses these columns:

- Orden ID
- Fecha
- Nombre
- Pago
- Recargo MP
- Retencion IIBB
- Imp SIRTAC
- Costo Envio
- Neto
- Localidad

`Orden ID` is used for duplicate prevention.

`Neto` is calculated as:

```text
Pago - (Recargo MP + Retencion IIBB + Imp SIRTAC + Costo Envio)
```

## Mapping Notes

- `Orden ID` maps to `# de venta` in the sales report and `Numero de venta` in the billing report.
- `Pago` is intended to match `Ingresos por productos (ARS)`.
- `Costo Envio` is intended to match `Costos de envio (ARS)`.
- Product Ads charges are ignored.
- Tax parsing checks `type`, `name`, and `description` from `fee_details` because Mercado Libre tax labels can vary by account.

## Requirements

- Node.js 24 LTS or newer
- npm
- Mercado Libre seller account
- Mercado Libre app credentials with OAuth access
- Google Cloud service account with Google Sheets API enabled
- A Google Sheet shared with the service account
- Cloudflare Pages, KV, and Pages Functions

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env` from the example:

```bash
cp .env.example .env
```

Configure:

```env
MELI_ACCESS_TOKEN=your_mercado_libre_access_token
MELI_REFRESH_TOKEN=your_mercado_libre_refresh_token
MELI_TOKEN_EXPIRES_AT=2026-05-06T18:00:00.000Z
MELI_SELLER_ID=your_seller_id
MELI_APP_ID=your_app_id
MELI_CLIENT_SECRET=your_client_secret
MELI_REDIRECT_URI=https://pignus.pages.dev/api/auth/mercadolibre/callback/
```

## Mercado Libre Auth

Generate an authorization URL from `.env`:

```bash
npm run meli:auth-url
```

Open the URL, authorize the seller account, then copy the returned `code` query parameter into `.env`:

```env
MELI_AUTH_CODE=TG-...
```

Exchange it for tokens:

```bash
npm run meli:exchange-code
```

Mercado Libre refresh tokens are single-use. Pignus refreshes tokens server-side on every sync and stores the latest token bundle in Cloudflare KV.

## Google Sheets Setup

1. Create or open the target Google Sheet.
2. Copy the spreadsheet ID from the URL and set `GOOGLE_SHEET_ID` in Cloudflare Pages secrets.
3. Enable the Google Sheets API in Google Cloud.
4. Create a service account and a JSON key for it.
5. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` from `client_email`.
6. Set `GOOGLE_PRIVATE_KEY` from `private_key`.
7. Share the spreadsheet with the service account email as an editor.
8. Make sure the tab is named `Ventas`, or change `SHEET_NAME`.

## Manual Export

A protected endpoint is available for triggering a sync on demand:

```text
POST /api/orders/export
Authorization: Bearer <ADMIN_API_KEY>
```

This is also what the Export button in the frontend calls.

## Scheduled Sync

Cloudflare Pages Functions do not support a `scheduled` event export directly in file-based routing mode. A daily cron is the intended approach (`0 6 * * *`, 06:00 UTC / 03:00 Argentina time) but requires Cloudflare Pages advanced mode (`_worker.js` entry point), which conflicts with the current file-based routing setup. The manual export endpoint above is the current way to trigger a sync.

## Cloudflare Deployment

Cloudflare Pages build settings:

```text
Framework preset: None
Build command: exit 0
Build output directory: public
Root directory: /
Production branch: main
```

Production token storage uses Cloudflare KV:

```text
Binding: PIGNUS_TOKENS
Key: meli_tokens
```

Seed the current local Mercado Libre tokens into KV:

```bash
npm run cloudflare:seed-tokens
```

Set these Cloudflare Pages Function secrets:

```text
MELI_APP_ID
MELI_CLIENT_SECRET
MELI_REDIRECT_URI
MELI_SELLER_ID
ADMIN_API_KEY
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SHEET_NAME
```

The deployed OAuth callback route is:

```text
https://pignus.pages.dev/api/auth/mercadolibre/callback
```

## Scripts

```text
npm run meli:auth-url           Build the Mercado Libre OAuth URL
npm run meli:exchange-code      Exchange an OAuth code for tokens and save to .env
npm run cloudflare:seed-tokens  Seed Cloudflare KV with the local .env tokens
```
