import express from "express";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import {
  all,
  one,
  run,
  tx,
  settings,
  availability,
  hashPassword,
  checkPassword,
  isPostgres,
} from "./db.js";
import {
  booking,
  bookingColumns,
  bookingJoin,
  catalog,
  customerHasOverlap,
  date,
  time,
  today,
  minutes,
  slots,
  fail,
} from "./domain.js";
import { notify } from "./payments.js";
import { changes } from "./events.js";
export const admin = express.Router();
const demo = process.env.DEMO_MODE === "1";
const secure = process.env.COOKIE_SECURE !== "0" && !demo;
const cookieOpts = { httpOnly: true, secure, sameSite: "lax", path: "/" };
const cookieName = secure ? "__Host-noir_session" : "noir_session";
const ttl = 8 * 3600_000;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const tokenOf = (req) =>
  req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
const dummyHash = hashPassword(randomBytes(32).toString("hex"));
const loginLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
  skipSuccessfulRequests: true,
});
admin.post("/login", loginLimit, async (req, res) => {
  const { email, password } = z
    .object({
      email: z.string().trim().toLowerCase().max(160),
      password: z.string().max(128),
    })
    .parse(req.body);
  const a = await one("SELECT * FROM admins WHERE email=?", email);
  if (!checkPassword(password, a?.password ?? dummyHash) || !a)
    fail(401, "Incorrect email or password.");
  const token = randomBytes(32).toString("hex");
  await run("DELETE FROM sessions WHERE expires<?", Date.now());
  const old = tokenOf(req);
  if (old) await run("DELETE FROM sessions WHERE token=?", hash(old));
  await run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash(token),
    a.id,
    Date.now() + ttl,
  );
  res
    .cookie(cookieName, token, { ...cookieOpts, maxAge: ttl })
    .json({ email: a.email, role: a.role });
});
admin.use(async (req, res, next) => {
  const token = tokenOf(req);
  const a =
    token &&
    (await one(
      "SELECT a.id,a.email,a.role,s.expires FROM admins a JOIN sessions s ON s.admin_id=a.id WHERE s.token=? AND s.expires>?",
      hash(token),
      Date.now(),
    ));
  if (!a) fail(401, "Please sign in to access the dashboard.");
  req.admin = a;
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.path !== "/logout" &&
    a.role !== "admin"
  )
    fail(403, "This account is read-only.");
  next();
});
admin.get("/session", (req, res) =>
  res.json({ email: req.admin.email, role: req.admin.role }),
);
admin.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(": connected\n\n");
  const token = hash(tokenOf(req));
  const writeIfSignedIn = (message) => {
    void one(
      "SELECT token FROM sessions WHERE token=? AND expires>?",
      token,
      Date.now(),
    )
      .then((session) => {
        if (!session) res.end();
        else if (!res.destroyed && !res.writableEnded) res.write(message);
      })
      .catch(() => res.end());
  };
  const send = () => writeIfSignedIn("event: booking\ndata: updated\n\n");
  const pulse = setInterval(() => writeIfSignedIn(": heartbeat\n\n"), 20_000);
  changes.on("booking", send);
  res.on("close", () => {
    clearInterval(pulse);
    changes.off("booking", send);
  });
});
admin.post("/logout", async (req, res) => {
  await run("DELETE FROM sessions WHERE token=?", hash(tokenOf(req)));
  res.clearCookie(cookieName, cookieOpts).json({ ok: true });
});
const statuses = [
  "pending",
  "confirmed",
  "completed",
  "rejected",
  "cancelled",
  "awaiting_payment",
  "payment_expired",
  "payment_review",
];
const effective =
  "CASE WHEN b.status='awaiting_payment' AND b.hold_until<=? THEN 'payment_expired' ELSE b.status END";
const listSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(statuses).optional(),
  date: date.optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
});
async function bookingList(query, limit) {
  const f = listSchema.parse(query);
  const where = [],
    params = [];
  if (f.search) {
    const search = `%${f.search.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(
      "(b.id LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR c.mobile LIKE ? ESCAPE '\\')",
    );
    params.push(search, search, search);
  }
  if (f.date) {
    where.push("b.date=?");
    params.push(f.date);
  }
  if (f.status) {
    where.push(`(${effective})=?`);
    params.push(Date.now(), f.status);
  }
  return (
    await all(
      `SELECT ${bookingColumns}, (${effective}) effective_status, (SELECT ${isPostgres ? "STRING_AGG(name || ' × ' || quantity, ', ' ORDER BY id)" : "GROUP_CONCAT(name || ' × ' || quantity, ', ')"} FROM booking_items WHERE booking_id=b.id) services ${bookingJoin} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY b.created DESC, b.id DESC ${limit ? "LIMIT 51 OFFSET ?" : ""}`,
      Date.now(),
      ...params,
      ...(limit ? [(f.page - 1) * 50] : []),
    )
  ).map((b) => {
    const {
      effective_status,
      request_key,
      hold_until,
      customer_id,
      coupon_id,
      ...r
    } = b;
    return {
      ...r,
      status: effective_status,
      payment_status:
        effective_status === "payment_expired" && r.payment_status === "pending"
          ? "expired"
          : r.payment_status,
    };
  });
}
admin.get("/bookings", async (req, res) =>
  res.json(await bookingList(req.query, true)),
);
admin.get("/bookings.csv", async (req, res) => {
  const fields = [
    "id",
    "name",
    "mobile",
    "email",
    "services",
    "date",
    "time",
    "status",
    "method",
    "payment_status",
    "total",
    "notes",
  ];
  const csv = (v) =>
    `"${String(v ?? "")
      .replace(/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/, "'$&")
      .replaceAll('"', '""')}"`;
  res
    .attachment("maison-noir-bookings.csv")
    .type("text/csv")
    .send(
      "\uFEFF" +
        [
          fields.join(","),
          ...(await bookingList(req.query, false)).map((b) =>
            fields
              .map((k) => csv(k === "total" ? (b[k] / 100).toFixed(2) : b[k]))
              .join(","),
          ),
        ].join("\r\n"),
    );
});
admin.get("/bookings/:id", async (req, res) => {
  const b = await booking(req.params.id, true);
  if (!b) fail(404, "Booking not found.");
  res.json(b);
});
const transitions = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
  awaiting_payment: ["cancelled"],
  payment_expired: ["cancelled"],
  payment_review: [],
};
admin.patch("/bookings/:id", async (req, res) => {
  const update = z
    .object({
      date,
      time,
      status: z.enum(statuses),
      notes: z.string().max(2000),
    })
    .parse(req.body);
  await tx(async () => {
    const b = await booking(req.params.id, true);
    if (!b) fail(404, "Booking not found.");
    if (
      b.status !== update.status &&
      !transitions[b.status].includes(update.status)
    )
      fail(409, "This status change is not allowed.");
    const moving = b.date !== update.date || b.time !== update.time;
    if (
      moving &&
      (!["pending", "confirmed"].includes(b.status) ||
        !["pending", "confirmed"].includes(update.status) ||
        !(await slots(update.date, b.duration, b.id)).includes(update.time))
    )
      fail(409, "This appointment cannot be moved to the chosen slot.");
    if (
      moving &&
      (await customerHasOverlap(
        b.mobile,
        update.date,
        update.time,
        b.duration,
        b.id,
      ))
    )
      fail(409, "This customer already has an overlapping appointment.");
    if (
      b.status === "pending" &&
      update.status === "confirmed" &&
      !(await slots(update.date, b.duration, b.id)).includes(update.time)
    )
      fail(
        409,
        "This slot is no longer available. Reschedule the appointment before confirming.",
      );
    await run(
      "UPDATE bookings SET date=?,time=?,notes=?,status=? WHERE id=?",
      update.date,
      update.time,
      update.notes,
      update.status === "payment_expired" ? "awaiting_payment" : update.status,
      b.id,
    );
    if (update.status === "cancelled" && b.method === "online")
      await run(
        "UPDATE payments SET state='cancelled',updated=? WHERE booking_id=? AND state NOT IN ('paid','paid_review')",
        Date.now(),
        b.id,
      );
    if (
      update.status === "completed" &&
      b.method === "cash" &&
      b.payment_status === "unpaid"
    )
      await run(
        "UPDATE payments SET state='paid',updated=? WHERE booking_id=?",
        Date.now(),
        b.id,
      );
  });
  changes.emit("booking");
  const b = await booking(req.params.id);
  if (b.status === "confirmed") notify(b.id);
  res.json(b);
});
admin.get("/stats", async (req, res) => {
  const day = today();
  const stats = await one(
    `SELECT COUNT(*) total, COUNT(CASE WHEN b.date=? AND b.status IN ('pending','confirmed','completed') THEN 1 END) today, COUNT(CASE WHEN b.status='pending' THEN 1 END) pending, COUNT(CASE WHEN b.status='confirmed' THEN 1 END) confirmed, COUNT(CASE WHEN b.status='completed' THEN 1 END) completed, COUNT(CASE WHEN b.status IN ('cancelled','rejected') THEN 1 END) cancelled, CAST(COALESCE(SUM(CASE WHEN p.state='paid' THEN p.amount END),0) AS BIGINT) revenue, CAST(COALESCE(SUM(CASE WHEN p.state='paid' AND b.method='online' THEN p.amount END),0) AS BIGINT) online, CAST(COALESCE(SUM(CASE WHEN p.state='paid' AND b.method='cash' THEN p.amount END),0) AS BIGINT) cash ${bookingJoin}`,
    day,
  );
  const dayMs = 86_400_000;
  const start = Date.parse(`${day}T00:00:00+05:30`) - 6 * dayMs;
  const end = start + 7 * dayMs;
  const [counts, totals] = await Promise.all([
    all(
      "SELECT CAST((created-?)/86400000 AS INTEGER) AS bucket, COUNT(*) n FROM bookings WHERE created>=? AND created<? GROUP BY 1",
      start,
      start,
      end,
    ),
    all(
      "SELECT CAST((updated-?)/86400000 AS INTEGER) AS bucket, CAST(SUM(amount) AS BIGINT) n FROM payments WHERE state='paid' AND updated>=? AND updated<? GROUP BY 1",
      start,
      start,
      end,
    ),
  ]);
  const daily = Array.from({ length: 7 }, (_, bucket) => ({
    date: new Date(Date.parse(`${day}T00:00:00Z`) + (bucket - 6) * dayMs)
      .toISOString()
      .slice(0, 10),
    count: counts.find((row) => row.bucket === bucket)?.n ?? 0,
    revenue: totals.find((row) => row.bucket === bucket)?.n ?? 0,
  }));
  res.json({ ...stats, daily });
});
const ext = { jpeg: "jpg", png: "png", webp: "webp" };
admin.post("/upload", async (req, res) => {
  const { data } = z
    .object({ data: z.string().max(4_200_000) })
    .parse(req.body);
  const match = /^data:image\/(jpeg|png|webp);base64,([\w+/=]+)$/.exec(data);
  if (!match) fail(400, "Choose a JPEG, PNG, or WebP image under 3 MB.");
  const [, type, b64] = match,
    buf = Buffer.from(b64, "base64");
  const valid =
    type === "jpeg"
      ? buf.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : type === "png"
        ? buf.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
        : buf.toString("ascii", 0, 4) === "RIFF" &&
          buf.toString("ascii", 8, 12) === "WEBP";
  if (!valid || buf.length > 3_000_000)
    fail(400, "Invalid image or file too large.");
  const name = `${randomBytes(18).toString("hex")}.${ext[type]}`;
  await run("INSERT INTO uploaded_images(name,content) VALUES(?,?)", name, buf);
  res.status(201).json({ url: `/uploads/${name}` });
});
const image = z
  .string()
  .max(150)
  .regex(/^\/(images|uploads)\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i);
const bool = z.boolean().transform((v) => Number(v));
const money = z.number().int().min(1).max(100_000_000);
const product = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(1000),
  image,
  price: money,
  discount: money.nullable(),
  enabled: bool,
  sort: z.number().int().min(0).max(9999),
});
const lower = (v, ctx) => {
  if (v.discount !== null && v.discount >= v.price)
    ctx.addIssue({
      code: "custom",
      message: "Discounted price must be lower than regular price.",
    });
};
const svcSchema = product
  .extend({
    category_id: z.number().int().positive(),
    duration: z.number().int().min(5).max(720),
  })
  .superRefine(lower);
const pkgSchema = product
  .extend({
    serviceIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(20)
      .refine((v) => new Set(v).size === v.length),
  })
  .superRefine(lower);
const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,32}$/),
    type: z.enum(["fixed", "percent"]),
    amount: money,
    expires: z.union([date, z.literal("")]),
    minimum: money.min(0),
    max_discount: money.nullable(),
    usage_limit: z.number().int().positive().max(1000000).nullable(),
    enabled: bool,
  })
  .refine(
    (v) => v.type !== "percent" || v.amount <= 100,
    "Percentage cannot exceed 100.",
  );
admin.get("/catalog", async (req, res) =>
  res.json({
    ...(await catalog(true)),
    coupons: await all("SELECT * FROM coupons ORDER BY id DESC"),
  }),
);
for (const [table, schema] of Object.entries({
  services: svcSchema,
  packages: pkgSchema,
  coupons: couponSchema,
})) {
  const save = async (req, res) => {
    const { serviceIds, ...data } = schema.parse(req.body);
    const id = await tx(async () => {
      let key = req.params.id
        ? z.coerce.number().int().positive().parse(req.params.id)
        : null;
      if (serviceIds) {
        const found = await all(
          `SELECT id FROM services WHERE id IN (${serviceIds.map(() => "?").join(",")})`,
          ...serviceIds,
        );
        if (found.length !== serviceIds.length)
          fail(400, "One or more included services no longer exist.");
      }
      if (
        data.category_id &&
        !(await one("SELECT id FROM categories WHERE id=?", data.category_id))
      )
        fail(400, "Invalid category.");
      if (
        table === "coupons" &&
        (await one(
          "SELECT id FROM coupons WHERE code=? AND id<>?",
          data.code,
          key ?? 0,
        ))
      )
        fail(409, "This coupon code already exists.");
      const keys = Object.keys(data),
        values = Object.values(data);
      if (key) {
        if (
          !(
            await run(
              `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`,
              ...values,
              key,
            )
          ).changes
        )
          fail(404, "Record not found.");
      } else
        key = Number(
          (
            await run(
              `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")}) RETURNING id`,
              ...values,
            )
          ).lastInsertRowid,
        );
      if (serviceIds) {
        await run("DELETE FROM package_services WHERE package_id=?", key);
        for (const i of serviceIds)
          await run("INSERT INTO package_services VALUES(?,?)", key, i);
      }
      return key;
    });
    res.json({ id });
  };
  admin.post(`/${table}`, save);
  admin.put(`/${table}/:id`, save);
  admin.delete(`/${table}/:id`, async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await tx(async () => {
      if (
        table === "services" &&
        (await one(
          "SELECT package_id FROM package_services WHERE service_id=?",
          id,
        ))
      )
        fail(409, "Remove this service from its packages before deleting it.");
      if (!(await run(`DELETE FROM ${table} WHERE id=?`, id)).changes)
        fail(404, "Record not found.");
    });
    res.json({ ok: true });
  });
}
const url = z
  .string()
  .max(500)
  .url()
  .refine((v) => v.startsWith("https://"), "Use an HTTPS URL.");
const mapsUrl = url.refine((v) => {
  const u = new URL(v);
  return (
    ((u.hostname === "www.google.com" || u.hostname === "maps.google.com") &&
      (u.pathname.startsWith("/maps") || u.hostname === "maps.google.com")) ||
    u.hostname === "maps.app.goo.gl"
  );
}, "Use a Google Maps link.");
const blank = z.literal("");
const text = (n) => z.string().trim().max(n);
const settingsSchema = z.object({
  name: text(80).min(2),
  logo: z.union([image, blank]),
  phone: text(25).regex(/^[+\d ()-]*$/),
  whatsapp: text(18).regex(/^(?:\+?\d{10,15})?$/),
  address: text(300),
  maps: z.union([mapsUrl, blank]),
  hours: text(150),
  instagram: z.union([url, blank]),
  facebook: z.union([url, blank]),
  banner: z.union([image, blank]),
  description: text(1000),
  testimonials: z
    .array(
      z.object({
        name: text(80).min(2),
        quote: text(500).min(2),
        rating: z.number().int().min(1).max(5),
      }),
    )
    .max(12)
    .default([]),
});
admin.get("/settings", async (req, res) => res.json(await settings()));
admin.put("/settings", async (req, res) => {
  const v = settingsSchema.parse(req.body);
  await run("UPDATE salon_settings SET config=? WHERE id=1", JSON.stringify(v));
  res.json(v);
});
const availabilitySchema = z
  .object({
    open: time,
    close: time,
    slot: z.number().int().min(5).max(120),
    capacity: z.number().int().min(1).max(30),
    holidays: z.array(z.number().int().min(0).max(6)).max(7),
    blockedDates: z.array(date).max(365),
    blockedSlots: z.array(z.object({ date, time })).max(500),
  })
  .refine(
    (a) => minutes(a.close) - minutes(a.open) >= a.slot,
    "Closing hours must leave room for at least one slot.",
  );
admin.get("/availability", async (req, res) => res.json(await availability()));
admin.put("/availability", async (req, res) => {
  const v = availabilitySchema.parse(req.body);
  await tx(() =>
    run("UPDATE availability SET config=? WHERE id=1", JSON.stringify(v)),
  );
  res.json(v);
});
