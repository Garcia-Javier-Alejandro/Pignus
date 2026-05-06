# Pignus

Minimal Node.js backend script that fetches paid Mercado Libre orders, transforms them into a financial table, and appends the rows to a Google Sheet.

There is no frontend. Run it from the command line.

## Requirements

- Node.js 24 LTS or newer
- npm
- Mercado Libre seller account and OAuth access token
- Google Cloud service account with Google Sheets API enabled
- A Google Sheet shared with the service account

## Install

```bash
npm install
```

## Configure

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Fill in these values:

```env
MELI_ACCESS_TOKEN=your_mercado_libre_access_token
MELI_REFRESH_TOKEN=your_mercado_libre_refresh_token
MELI_TOKEN_EXPIRES_AT=2026-05-06T18:00:00.000Z
MELI_SELLER_ID=your_seller_id
MELI_APP_ID=your_app_id
MELI_CLIENT_SECRET=your_client_secret
MELI_REDIRECT_URI=https://pignus.pages.dev/api/auth/mercadolibre/callback/

GOOGLE_SHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

SHEET_NAME=Ventas
MELI_PAGE_SIZE=50
MELI_MAX_RETRIES=3
LOG_RAW_PAYMENTS=false
ADMIN_API_KEY=
```

### Mercado Libre

The script calls:

```text
GET https://api.mercadolibre.com/orders/search?seller={SELLER_ID}
```

It sends the token as:

```text
Authorization: Bearer <MELI_ACCESS_TOKEN>
```

To get the token:

1. Create an app in the Mercado Libre developer portal.
2. Complete the OAuth authorization flow for your seller account with `offline_access` scope.
3. Store the resulting access token in `MELI_ACCESS_TOKEN`.
4. Store the resulting refresh token in `MELI_REFRESH_TOKEN`.
5. Store your seller id in `MELI_SELLER_ID`.
6. Store your app id and secret in `MELI_APP_ID` and `MELI_CLIENT_SECRET`.

Use this authorization URL shape:

```text
https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=APP_ID&redirect_uri=https://pignus.pages.dev/api/auth/mercadolibre/callback/&scope=offline_access%20read%20write
```

Or generate it from your `.env`:

```bash
npm run meli:auth-url
```

After Mercado Libre redirects to the callback page, copy the `code` query parameter into `.env`:

```env
MELI_AUTH_CODE=TG-...
```

Then exchange it:

```bash
npm run meli:exchange-code
```

The script fetches all pages, keeps only paid orders, and retries temporary API failures. If `MELI_REFRESH_TOKEN` is configured, it refreshes the access token before expiry or after a 401 response, then writes the new single-use refresh token back to `.env`.

Mercado Libre refresh tokens are single-use. Only the latest refresh token is valid, so do not reuse an older value from logs, shell history, or backups.

### Google Sheets

1. Create or open the target Google Sheet.
2. Copy the spreadsheet ID from the URL and set `GOOGLE_SHEET_ID`.
3. Enable the Google Sheets API in Google Cloud.
4. Create a service account.
5. Create a JSON key for that service account.
6. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` from the JSON key's `client_email`.
7. Set `GOOGLE_PRIVATE_KEY` from the JSON key's `private_key`.
8. Share the spreadsheet with the service account email as an editor.
9. Make sure the sheet tab is named `Ventas`, or change `SHEET_NAME`.

Keep the private key line breaks as escaped `\n` characters inside `.env`.

## Run

```bash
npm start
```

The script will:

1. Fetch paid Mercado Libre orders.
2. Read existing order ids from column A of the sheet.
3. Skip orders already present in the sheet.
4. Append only new rows.

## Output Columns

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
- Validacion Neto

`Orden ID` is used for duplicate prevention.

`Neto` is calculated as:

```text
Pago - (Recargo MP + Retencion IIBB + Imp SIRTAC + Costo Envio)
```

`Validacion Neto` is calculated as:

```text
Neto - net_received_amount
```

## Current Mapping Notes

The mapping is based on the Mercado Libre reports you downloaded:

- `Orden ID` maps to `# de venta` in the sales report and `Numero de venta` in the billing report.
- `Pago` is intended to match `Ingresos por productos (ARS)`.
- `Costo Envio` is intended to match `Costos de envio (ARS)`, but this needs to be reviewed after seeing the live API response.
- Product Ads charges are ignored.
- Tax parsing checks `type`, `name`, and `description` from `fee_details` because Mercado Libre tax labels can vary by account.

For the first real run, set:

```env
LOG_RAW_PAYMENTS=true
```

That logs raw `payments` data so IIBB and SIRTAC classification can be verified against the actual API response.

## Cloudflare Pages Placeholder

This repo also includes a minimal static frontend in `public/` so you can deploy it to Cloudflare Pages and reserve a stable domain for the future website.

The useful OAuth callback path is:

```text
https://YOUR_PAGES_DOMAIN/api/auth/mercadolibre/callback/
```

Use that URL as the Mercado Libre app redirect URI once the Cloudflare Pages site is deployed.

### Deploy From GitHub

1. Push this repository to GitHub.
2. In Cloudflare, go to Workers & Pages.
3. Select Create application.
4. Select Pages.
5. Select Import an existing Git repository.
6. Choose this repository.
7. Use these build settings:

```text
Framework preset: None
Build command: exit 0
Build output directory: public
Root directory: /
Production branch: main
```

Cloudflare will deploy the contents of `public/` and give you a `*.pages.dev` domain. Every push to the production branch will trigger a new deployment.

The callback route is now handled by a Cloudflare Pages Function. It exchanges the temporary Mercado Libre `code` server-side and stores the token bundle in Cloudflare KV.

## Mercado Libre Debug Summary

Do not call Mercado Libre directly from browser JavaScript because that would expose your OAuth tokens. The deployed debug frontend calls a Pages Function instead:

```text
/api/orders/summary
```

That Function reads Mercado Libre tokens from Cloudflare KV, refreshes them server-side when needed, and returns a sanitized order summary.

For local mapping validation, you can still generate a sanitized snapshot:

```bash
npm run meli:debug-export
```

Then open:

```text
http://localhost:8788/debug/
```

Start the local static server with:

```bash
npm run frontend:dev
```

Or deploy the static frontend after generating the file if you intentionally want the snapshot visible in Cloudflare Pages. The generated data file is ignored by Git:

```text
public/debug/orders-summary.json
```

The debug page shows the transformed financial row plus raw payment fee details so we can validate `Recargo MP`, IIBB, SIRTAC, shipping cost, and net calculations before writing to Google Sheets.

## Cloudflare KV Token Storage

Production token storage uses Cloudflare KV:

```text
Binding: PIGNUS_TOKENS
Key: meli_tokens
```

The KV namespace id is configured in `wrangler.toml`.

Seed the current local `.env` tokens into KV:

```bash
npm run cloudflare:seed-tokens
```

The Pages Function secrets required in Cloudflare are:

```text
MELI_APP_ID
MELI_CLIENT_SECRET
MELI_REDIRECT_URI
MELI_SELLER_ID
ADMIN_API_KEY
```

`ADMIN_API_KEY` protects the debug API. Open `/debug/`, paste the value from your local `.env`, and click Save. The key is stored only in your browser local storage and sent as an `Authorization: Bearer ...` header.

The deployed OAuth callback route is:

```text
https://pignus.pages.dev/api/auth/mercadolibre/callback
```
