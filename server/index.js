import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { changes } from "./events.js";
import { settings, dataDir, seed, run, one } from "./db.js";
import {
  booking,
  bookingInput,
  catalog,
  createBooking,
  date,
  fail,
  mobile,
  quote,
  quoteInput,
  slots,
  today,
} from "./domain.js";
import { admin } from "./admin.js";
import {
  notify,
  onlineEnabled,
  order,
  recordPayment,
  signed,
  verify,
} from "./payments.js";
const dev = process.argv.includes("--dev");
const preview = process.argv.includes("--preview");
if (process.env.DEMO_MODE === "1") {
  if (
    !preview ||
    !process.env.DATA_DIR ||
    resolve(process.env.DATA_DIR) === resolve("data") ||
    process.env.DB_PATH ||
    onlineEnabled ||
    process.env.TWILIO_ACCOUNT_SID
  )
    throw new Error(
      "Demo mode requires --preview, a separate DATA_DIR, and no live payment/SMS service.",
    );
  seed();
}
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY)
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
app.use(
  helmet({
    contentSecurityPolicy: dev
      ? false
      : {
          directives: {
            scriptSrc: ["'self'", "https://checkout.razorpay.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https://*.razorpay.com"],
            connectSrc: ["'self'", "https://*.razorpay.com"],
            frameSrc: ["https://*.razorpay.com", "https://www.google.com"],
            upgradeInsecureRequests: null,
            frameAncestors: preview ? null : ["'self'"],
          },
        },
    crossOriginEmbedderPolicy: false,
    originAgentCluster: false,
    strictTransportSecurity: dev || preview ? false : undefined,
    frameguard: dev || preview ? false : undefined,
    crossOriginOpenerPolicy:
      dev || preview ? false : { policy: "same-origin-allow-popups" },
  }),
);
app.get("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    one("SELECT id FROM salon_settings WHERE id=1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.post(
  "/api/razorpay/webhook",
  express.raw({ type: "application/json", limit: "100kb" }),
  (req, res) => {
    if (
      !Buffer.isBuffer(req.body) ||
      !signed(
        req.body,
        req.get("X-Razorpay-Signature"),
        process.env.RAZORPAY_WEBHOOK_SECRET,
      )
    )
      fail(401, "Invalid webhook signature.");
    let data;
    try {
      data = JSON.parse(req.body);
    } catch {
      fail(400, "Invalid webhook body.");
    }
    const entity = data.payload?.payment?.entity;
    if (entity && ["payment.captured", "payment.failed"].includes(data.event)) {
      const id = recordPayment(entity);
      if (id && entity.status === "captured") void notify(id);
    }
    res.json({ ok: true });
  },
);
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD"].includes(req.method) &&
    (req.get("X-Salon-Request") !== "1" ||
      req.get("Sec-Fetch-Site") === "cross-site")
  )
    fail(403, "Invalid request origin.");
  next();
});
app.use("/api/admin/upload", express.json({ limit: "4.3mb" }));
app.use("/api", express.json({ limit: "32kb" }));
const limit = (max) =>
  rateLimit({
    windowMs: 60_000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again shortly." },
  });
app.use("/api/admin", admin);
app.get("/api/catalog", (req, res) =>
  res.json({
    ...catalog(),
    settings: settings(),
    onlineEnabled,
    today: today(),
  }),
);
app.post("/api/quote", limit(90), (req, res) =>
  res.json(quote(quoteInput.parse(req.body))),
);
app.get("/api/slots", limit(120), (req, res) => {
  const q = z
    .object({ date, duration: z.coerce.number().int().min(1).max(1440) })
    .parse(req.query);
  res.json({ slots: slots(q.date, q.duration) });
});
app.post("/api/bookings", limit(15), async (req, res) => {
  const input = bookingInput.parse(req.body);
  const { id, existing } = createBooking(input, onlineEnabled);
  const b = booking(id);
  let payment = null,
    paymentError = "";
  if (!existing) changes.emit("booking");
  if (b.method === "cash" && !existing) void notify(id);
  if (b.method === "online" && b.status === "awaiting_payment")
    try {
      payment = await order(id);
    } catch (e) {
      paymentError = e.message;
    }
  res
    .status(existing ? 200 : 201)
    .json({ booking: booking(id), payment, paymentError });
});
const lookup = z.object({
  id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^MN-[A-F0-9]{12}$/),
  mobile,
});
function lookupBooking(input) {
  const b = booking(input.id);
  if (!b || b.mobile !== input.mobile)
    fail(404, "No booking found for that ID and mobile number.");
  return b;
}
app.post("/api/lookup", limit(15), (req, res) =>
  res.json(lookupBooking(lookup.parse(req.body))),
);
app.post("/api/payments/retry", limit(12), async (req, res) => {
  const b = lookupBooking(lookup.parse(req.body));
  const p = await order(b.id);
  if (!p)
    fail(
      409,
      "This payment can no longer be retried. Check your booking status.",
    );
  res.json(p);
});
app.post("/api/payments/verify", limit(20), async (req, res) => {
  const input = lookup
    .extend({
      orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
      paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
      signature: z.string().length(64),
    })
    .parse(req.body);
  const b = await verify(lookupBooking(input), input);
  if (b.status === "confirmed") void notify(b.id);
  res.json(b);
});
app.post("/api/payments/dismiss", limit(20), (req, res) => {
  const b = lookupBooking(lookup.parse(req.body));
  run(
    "UPDATE payments SET state='cancelled',updated=? WHERE booking_id=? AND state='pending' AND EXISTS (SELECT 1 FROM bookings WHERE id=? AND status='awaiting_payment')",
    Date.now(),
    b.id,
    b.id,
  );
  res.json(booking(b.id));
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use(
  "/uploads",
  express.static(resolve(dataDir, "uploads"), {
    index: false,
    immutable: true,
    maxAge: "1y",
    dotfiles: "deny",
  }),
);
app.use("/uploads", (req, res) => res.sendStatus(404));
if (dev) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      allowedHosts: true,
      ws: false,
      fs: {
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem,key,sqlite,sqlite3,db}",
          "**/*.sqlite*",
          "**/data/**",
          "**/backups/**",
          "**/server/**",
          "**/.git/**",
          `${dataDir}/**`,
        ],
      },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const html = readFileSync(resolve("dist/index.html"), "utf8");
  const escape = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  app.use(
    "/assets",
    express.static("dist/assets", {
      index: false,
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use(
    express.static("dist", { index: false, maxAge: "1d", redirect: false }),
  );
  app.get(
    ["/", "/booking", "/booking/:id", "/admin", "/admin/*rest"],
    (req, res) => {
      const staff = req.path.startsWith("/admin"),
        s = settings();
      if (staff || preview || req.path.startsWith("/booking"))
        res.set("X-Robots-Tag", "noindex, nofollow");
      res
        .type("html")
        .send(
          html
            .replace(
              /<title>.*?<\/title>/,
              () =>
                `<title>${escape(s.name)} · ${staff ? "Salon Management" : "Salon &amp; Grooming"}</title>`,
            )
            .replace(
              /<meta name="description" content="[^"]*"\s*\/?\s*>/,
              () =>
                `<meta name="description" content="${escape(s.description)}">`,
            ),
        );
    },
  );
}
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({
        error: error.issues
          .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
          .join("; "),
      });
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res
    .status(status)
    .json({
      error:
        status === 500
          ? "Something went wrong. Please try again."
          : error.type === "entity.parse.failed"
            ? "Invalid JSON."
            : error.message,
    });
});
const server = app.listen(Number(process.env.PORT || 5173), "0.0.0.0", () =>
  console.log(`Maison Noir is listening on ${server.address().port}.`),
);
