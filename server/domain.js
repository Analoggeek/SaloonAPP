import { z } from "zod";
import { all, one, run, tx, availability } from "./db.js";
import { randomBytes } from "node:crypto";
export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const localTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
export const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const clock = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date");
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const mobile = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,22}$/)
  .transform((v) => v.replace(/[^\d]/g, ""))
  .transform((v) => (v.length === 12 && v.startsWith("91") ? v.slice(2) : v))
  .refine(
    (v) => v.length >= 10 && v.length <= 15,
    "Enter a valid mobile number",
  );
export const items = z
  .array(
    z.object({
      kind: z.enum(["service", "package"]),
      id: z.number().int().positive(),
      quantity: z.number().int().min(1).max(10),
    }),
  )
  .min(1)
  .max(20)
  .refine(
    (v) => new Set(v.map((i) => `${i.kind}:${i.id}`)).size === v.length,
    "Duplicate items",
  );
export const quoteInput = z.object({
  items,
  coupon: z.string().trim().toUpperCase().max(32).default(""),
});
export const bookingInput = quoteInput.extend({
  requestKey: z.uuid(),
  name: z.string().trim().min(2).max(100),
  mobile,
  email: z.union([z.email().max(160), z.literal("")]).default(""),
  date,
  time,
  instructions: z.string().trim().max(1000).default(""),
  method: z.enum(["cash", "online"]),
  expectedTotal: z.number().int().min(0).optional(),
});
const occupancy =
  "(b.status IN ('pending','confirmed','completed') OR (b.status='awaiting_payment' AND b.hold_until>?))";
export async function catalog(admin = false) {
  const services = await all(
    `SELECT s.*, c.name category FROM services s JOIN categories c ON c.id=s.category_id ${admin ? "" : "WHERE s.enabled=1"} ORDER BY s.sort,s.id`,
  );
  const pkg = await all(
    `SELECT p.*, COALESCE(SUM(s.duration),0) duration FROM packages p LEFT JOIN package_services ps ON ps.package_id=p.id LEFT JOIN services s ON s.id=ps.service_id ${admin ? "" : "WHERE p.enabled=1"} GROUP BY p.id ORDER BY p.sort,p.id`,
  );
  const links = await all(
    "SELECT ps.*, s.name, s.enabled FROM package_services ps JOIN services s ON s.id=ps.service_id",
  );
  return {
    categories: await all("SELECT * FROM categories ORDER BY id"),
    services,
    packages: pkg
      .map((p) => ({
        ...p,
        services: links.filter((l) => l.package_id === p.id),
      }))
      .filter(
        (p) =>
          admin || (p.services.length && p.services.every((s) => s.enabled)),
      ),
  };
}
export async function quote(input) {
  const cat = await catalog();
  const lines = input.items.map((i) => {
    const record = cat[i.kind === "service" ? "services" : "packages"].find(
      (v) => v.id === i.id,
    );
    if (!record) fail(409, "An item in your cart is no longer available.");
    return {
      ...i,
      name: record.name,
      price: record.discount ?? record.price,
      duration: record.duration,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const duration = lines.reduce((s, l) => s + l.duration * l.quantity, 0);
  let discount = 0,
    coupon = null;
  if (input.coupon) {
    coupon = await one(
      "SELECT * FROM coupons WHERE code=? AND enabled=1",
      input.coupon,
    );
    if (!coupon || (coupon.expires && coupon.expires < today()))
      fail(400, "This coupon is invalid or expired.");
    if (subtotal < coupon.minimum)
      fail(400, "The booking does not meet the coupon minimum.");
    const used = (
      await one(
        `SELECT COUNT(*) n FROM bookings b WHERE coupon_id=? AND ${occupancy}`,
        coupon.id,
        Date.now(),
      )
    ).n;
    if (coupon.usage_limit !== null && used >= coupon.usage_limit)
      fail(400, "This coupon has reached its usage limit.");
    discount = Math.min(
      subtotal,
      coupon.max_discount ?? Infinity,
      coupon.type === "fixed"
        ? coupon.amount
        : Math.floor((subtotal * coupon.amount) / 100),
    );
  }
  return {
    items: lines,
    subtotal,
    duration,
    discount,
    total: subtotal - discount,
    couponId: coupon?.id ?? null,
    couponCode: coupon?.code ?? "",
  };
}
export async function slots(day, duration, ignore = "") {
  const a = await availability(),
    now = Date.now(),
    current = today();
  const latest = new Date(`${current}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + 180);
  if (
    day < current ||
    day > latest.toISOString().slice(0, 10) ||
    a.holidays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ||
    a.blockedDates.includes(day)
  )
    return [];
  const occupied = (
    await all(
      `SELECT b.time,b.duration FROM bookings b WHERE b.date=? AND b.id<>? AND ${occupancy}`,
      day,
      ignore,
      now,
    )
  ).map((b) => [minutes(b.time), minutes(b.time) + b.duration]);
  const blocks = a.blockedSlots
    .filter((b) => b.date === day)
    .map((b) => [minutes(b.time), minutes(b.time) + a.slot]);
  const output = [];
  for (
    let start = minutes(a.open);
    start + duration <= minutes(a.close);
    start += a.slot
  ) {
    if (day === current && start <= minutes(localTime())) continue;
    const end = start + duration;
    if (blocks.some(([s, e]) => s < end && e > start)) continue;
    const points = [
      start,
      ...occupied.map((x) => x[0]).filter((s) => s > start && s < end),
    ];
    if (
      points.some(
        (t) =>
          occupied.filter(([s, e]) => s <= t && e > t).length >= a.capacity,
      )
    )
      continue;
    output.push(clock(start));
  }
  return output;
}
export async function customerHasOverlap(
  phone,
  day,
  start,
  duration,
  ignore = "",
) {
  const begin = minutes(start),
    end = begin + duration;
  return (
    await all(
      `SELECT b.time,b.duration FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE c.mobile=? AND b.date=? AND b.id<>? AND ${occupancy}`,
      phone,
      day,
      ignore,
      Date.now(),
    )
  ).some((b) => minutes(b.time) < end && minutes(b.time) + b.duration > begin);
}
export const bookingColumns = `b.*,c.name,c.mobile,c.email,p.state payment_status,p.order_id,p.payment_id`;
export const bookingJoin = `FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN payments p ON p.booking_id=b.id`;
export async function booking(id, admin = false) {
  const b = await one(
    `SELECT ${bookingColumns} ${bookingJoin} WHERE b.id=?`,
    id,
  );
  if (!b) return null;
  b.items = await all(
    "SELECT name,quantity,price,duration FROM booking_items WHERE booking_id=? ORDER BY id",
    id,
  );
  if (b.status === "awaiting_payment" && b.hold_until <= Date.now()) {
    b.status = "payment_expired";
    if (b.payment_status === "pending") b.payment_status = "expired";
  }
  if (!admin) {
    delete b.notes;
    delete b.request_key;
    delete b.customer_id;
    delete b.coupon_id;
    delete b.hold_until;
  }
  return b;
}
export async function createBooking(input, onlineEnabled) {
  return await tx(async () => {
    const existing = await one(
      "SELECT b.id,c.mobile,p.order_id FROM bookings b JOIN customers c ON b.customer_id=c.id JOIN payments p ON p.booking_id=b.id WHERE b.request_key=?",
      input.requestKey,
    );
    if (existing) {
      if (existing.mobile !== input.mobile)
        fail(409, "Booking request already used.");
      return { id: existing.id, existing: true };
    }
    const q = await quote(input);
    const method = q.total === 0 ? "cash" : input.method;
    if (input.expectedTotal !== undefined && q.total !== input.expectedTotal)
      fail(
        409,
        "Your cart price has changed. Review the new total before booking.",
      );
    if (method === "online" && !onlineEnabled)
      fail(503, "Online payments are not configured. Choose Cash on Service.");
    if (!(await slots(input.date, q.duration)).includes(input.time))
      fail(409, "This slot is no longer available. Please choose another.");
    if (
      await customerHasOverlap(input.mobile, input.date, input.time, q.duration)
    )
      fail(409, "You already have an appointment that overlaps this slot.");
    const customer = Number(
      (
        await run(
          "INSERT INTO customers(name,mobile,email) VALUES(?,?,?) RETURNING id",
          input.name,
          input.mobile,
          input.email,
        )
      ).lastInsertRowid,
    );
    const id = "MN-" + randomBytes(6).toString("hex").toUpperCase();
    const now = Date.now();
    await run(
      "INSERT INTO bookings(id,customer_id,date,time,duration,status,method,subtotal,discount,total,coupon_id,coupon_code,instructions,created,hold_until,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      customer,
      input.date,
      input.time,
      q.duration,
      method === "cash" ? "pending" : "awaiting_payment",
      method,
      q.subtotal,
      q.discount,
      q.total,
      q.couponId,
      q.couponCode,
      input.instructions,
      now,
      method === "online"
        ? Math.min(
            now + 15 * 60_000,
            Date.parse(`${input.date}T${input.time}:00+05:30`),
          )
        : null,
      input.requestKey,
    );
    for (const line of q.items)
      await run(
        "INSERT INTO booking_items(booking_id,service_id,package_id,name,quantity,price,duration) VALUES(?,?,?,?,?,?,?)",
        id,
        line.kind === "service" ? line.id : null,
        line.kind === "package" ? line.id : null,
        line.name,
        line.quantity,
        line.price,
        line.duration,
      );
    await run(
      "INSERT INTO payments(booking_id,amount,state,updated) VALUES(?,?,?,?)",
      id,
      q.total,
      q.total === 0 ? "waived" : method === "cash" ? "unpaid" : "pending",
      now,
    );
    return { id, existing: false };
  });
}
