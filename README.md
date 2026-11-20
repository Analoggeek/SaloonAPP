# Maison Noir · Salon & Grooming

A guest-booking storefront at `/` and a separate, authenticated staff dashboard at `/admin`. Both use the same Express API and SQLite database. The React interfaces share an HTTPS origin; there is no separate browser-facing API host.

## Run locally

Requires Node.js 22.13+ (use a supported LTS release) and npm. SQLite is provided by Node, so no database server is required.

```sh
npm ci
cp .env.example .env
npm run build
COOKIE_SECURE=0 npm start
```

Open `http://localhost:5173`. To create the first admin, run the following in a Bash terminal from the repository. The interactive prompt avoids putting the password in shell history. Use a unique password of at least 12 characters.

```sh
read -rp 'Admin email: ' ADMIN_EMAIL
read -rsp 'Admin password: ' ADMIN_PASSWORD; printf '\n'
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run admin:create
unset ADMIN_EMAIL ADMIN_PASSWORD
```

`ADMIN_ROLE=viewer` creates a read-only account. Running the command again for an existing email resets its password and revokes existing sessions. There are no default accounts. To use Vite in local development, run `COOKIE_SECURE=0 npm run dev`; use the built server in production.

## Catalog and preview

The production database starts with the requested category names and editable brand defaults, but **no services, bookings, packages, coupons, or testimonials**. Sign in to publish the salon's actual hours, location, contact and social links, services, photos, and approved testimonials. WhatsApp and the map are displayed only when their corresponding settings are supplied. Amounts are stored in integer paise; times shown to guests and staff are in IST.

To try the prepared catalog in a separate, disposable database:

```sh
DEMO_MODE=1 DATA_DIR=data/preview npm run preview
```

This preview uses sample services and a sample coupon (`FIRST10`), but still runs the actual cash booking, scheduling, and database flows. Preview mode has no live payment or notification credentials and does not create a staff account. To test staff management there, repeat the admin setup with `DATA_DIR=data/preview`. Keep that data directory separate from production.

## Payments and notifications

- **Cash on Service:** the request is saved as pending confirmation. Completing a cash booking in the dashboard records the cash as collected. A fully discounted booking requires no payment.
- **Razorpay:** set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` on the server. In Razorpay, enable automatic capture and configure `POST https://your-domain/api/razorpay/webhook` for `payment.captured` and `payment.failed`. Verify a complete transaction with sandbox/test keys before enabling live payments. The browser callback alone does not mark anything paid: the server checks the signature, stored order, currency and amount, and only fulfils a captured transaction. The signed webhook also handles customers who close the browser. A missed or expired payment hold frees its slot; money captured after expiry is flagged for staff review rather than confirming an unavailable appointment. Refunds and late-payment reconciliation are handled in the Razorpay dashboard using the payment ID in staff booking details; this app does not issue refunds.
- **SMS:** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` to send an SMS when a cash request is received and when a booking is confirmed. Set up a sender allowed to message the salon's destination country. SMS errors are logged and do not roll back a valid appointment. The WhatsApp button is a contact link, not a messaging API.

## GitHub Pages and Android installation

**GitHub Pages is a static entry page, not the booking server.** It uses the raw `index.html`; Vite injects the React entry only when building or running the actual app. Leave Pages set to `main` → `/(root)`. When the Node service is publicly reachable, set `bookingUrl` in `public/booking-links.json` to its HTTPS origin and publish that change to `main`. The Pages booking link opens that origin, where availability, checkout, tracking, and administration all use the live database. A blank `bookingUrl` shows an honest unavailable message rather than a broken checkout.

- **Home-screen app (no APK needed):** Open `/install.html` on the booking domain using Android Chrome and choose **Install app** or **Add to Home screen**. The customer website also links to these instructions in its footer. Booking and payment require an internet connection; the service worker caches only the offline notice, not customer records.
- **Signed Android installer (`.apk`):** The GitHub Actions **Android installer** workflow builds a native launcher that opens the same HTTPS booking server in a browser tab, so booking, cookies and provider-hosted checkout are not reimplemented in the APK. Publish at least one real service, use the live server URL when dispatching the workflow, and set GitHub Actions secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Use the same backed-up release keystore for future versions. Test the signed artifact on an Android device, then attach `maison-noir-booking.apk` to a public GitHub Release or other HTTPS download host. Put that public URL in `androidApkUrl` if customers should download the APK from Pages instead of getting Chrome installation instructions. Until the signing secrets and booking endpoint are configured, no APK is published.

## Deploy to Render

The root `render.yaml` provisions one paid Starter web service in Singapore and a 2 GB persistent disk. Review the service and disk price in Render before applying it. The SQLite database and uploads are stored in `/var/data`.

1. From the [Render dashboard](https://dashboard.render.com/), choose **New → Blueprint**, give its GitHub integration access to `Analoggeek/SaloonAPP`, and select the branch containing `render.yaml`. Apply the Blueprint.
2. After the service is healthy, open its Render **Shell** and run the interactive admin setup commands above. Use `/admin` on the assigned Render HTTPS URL to publish the actual catalog and salon details. Do not put the staff password in GitHub or in the Blueprint.
3. Verify `/healthz`, `/admin`, and a cash test booking over HTTPS before sharing the URL. Add a custom domain and any Razorpay or Twilio environment variables in the Render dashboard when ready. Leave `DEMO_MODE` unset.

## Deployment and operations

1. Build with `npm ci` and `npm run build`; start with `npm start` behind an HTTPS reverse proxy. Use the default secure cookies and set `TRUST_PROXY` only to match your trusted proxy topology. Do not expose the Node port directly to the internet if trusting a proxy.
2. Run one application instance on a **durable local volume**. Mount `DATA_DIR` on that volume; it contains the SQLite database and uploaded images. Use a restricted service account and keep the volume out of the web root. Do not use an ephemeral filesystem or deploy this version as stateless Vercel functions. A horizontally scaled deployment would require shared storage, a managed relational database, distributed rate limits, and a shared event channel.
3. The dashboard subscribes to authenticated booking events and polls as a fallback. For immediate updates through a reverse proxy, allow SSE streaming without buffering. HTTPS, the staff account, the catalog and booking hours should be configured before accepting public bookings.
4. Schedule `npm run backup` daily (configure `BACKUP_DIR`) to take a consistent database snapshot. Back up `DATA_DIR/uploads` separately and store both encrypted off-host with appropriate retention and access controls. Test restoration: stop the instance, restore the snapshot and uploads to a fresh private volume, and restart. Treat records and backups as customer PII, and apply your business's access and retention policies.

## Verification

```sh
npm test
npm run build
```

The integration tests start a separate instance with a temporary database and a simulated Razorpay API. They verify role separation, publishing and pricing, coupon limits, schedule blocks, conflicting reservations, booking idempotency, status tracking, CSV export, and signature/capture handling. Live Razorpay and SMS still require provider configuration and an external integration test.
