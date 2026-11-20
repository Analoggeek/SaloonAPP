# Maison Noir · Salon & Grooming

A guest-booking storefront at `/` and a separate, authenticated staff dashboard at `/admin`. Both use the same Express API and database: SQLite locally, or PostgreSQL on hosted instances. The React interfaces share an HTTPS origin; there is no separate browser-facing API host.

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

## Deploy using Render Free and Neon Free

The root `render.yaml` asks for a single **Free** Render web service and does not create a paid plan, disk, or Render database. Bookings, sessions, and new uploads are stored in Neon Postgres, so Render restarts do not discard them. The process refuses to start on Render without its database connection rather than falling back to SQLite. Both free tiers have quotas and the first visit after inactivity may be slow; they are suitable for testing or light usage, not guaranteed 24/7 availability. Review [Render's usage and suspension limits](https://render.com/docs/free) and [Neon's Free plan limits](https://neon.com/pricing). Do not enable paid add-ons if using this zero-monthly-plan setup.

1. In [Neon](https://console.neon.tech/), create a **Free** project and copy the **pooled** connection string from **Connect**. Use a new database for this deployment. The connection string includes the database password; keep it out of Git, messages, and screenshots.
2. Open [Deploy to Render](https://render.com/deploy?repo=https://github.com/Analoggeek/SaloonAPP) for the `main` branch (or import the repository as a Blueprint). Select **Free** and confirm there is no paid disk or database. In the prompted environment variables, paste the connection string into `DATABASE_URL`. Set `ADMIN_BOOTSTRAP_EMAIL` and a unique `ADMIN_BOOTSTRAP_PASSWORD` (12–128 characters). Apply the Blueprint. Render Free does not provide Shell access, so these variables create the first admin on startup without needing a remote shell.
3. After the service is live, visit `https://YOUR-SERVICE.onrender.com/admin`, sign in with that admin, and remove both `ADMIN_BOOTSTRAP_*` variables from the Render service. This does not delete or reset the account. Publish services and contact details, then verify `/healthz` and complete a cash test booking before advertising the site. Keep `DEMO_MODE` unset. Razorpay and SMS are optional and may incur separate provider fees.
4. Set `bookingUrl` in `public/booking-links.json` to the live HTTPS origin (public URL only), and publish that change to `main` to enable the GitHub Pages booking and Android installation links. See the previous section for the signed APK workflow.

## Deployment and operations

1. Build with `npm ci` and `npm run build`; start with `npm start` behind an HTTPS reverse proxy. Use the default secure cookies and set `TRUST_PROXY` only to match your trusted proxy topology. Do not expose the Node port directly to the internet if trusting a proxy.
2. For PostgreSQL, set `DATABASE_URL` and `REQUIRE_DATABASE_URL=1` in production (TLS with certificate verification is required in this mode). Use one web instance; administration events and rate limiting are local to the web process, with polling as a fallback. Alternatively, keep `DATABASE_URL` unset and mount `DATA_DIR` on durable local storage for SQLite. Changing engines does not import old SQLite data. Do not use SQLite with an ephemeral filesystem.
3. Keep encrypted off-host backups of production data. For PostgreSQL, use `pg_dump` or the provider's backup tools (which also cover database-stored uploads). For SQLite, `npm run backup` takes a consistent snapshot; back up any legacy `DATA_DIR/uploads` separately. Restrict access to backups and test restoration before relying on them.

## Verification

```sh
npm test
npm run build
```

The integration tests start a separate instance with a temporary database and a simulated Razorpay API. They verify role separation, publishing and pricing, coupon limits, schedule blocks, conflicting reservations, booking idempotency, status tracking, CSV export, and signature/capture handling. Live Razorpay and SMS still require provider configuration and an external integration test.

To run the same integration tests against PostgreSQL, set `TEST_DATABASE_URL` to a **disposable, empty** database before running `npm test`. Never point the test suite at production.
