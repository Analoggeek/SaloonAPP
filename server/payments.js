import { createHmac, timingSafeEqual } from "node:crypto";
import { one, run, tx } from "./db.js";
import { booking, fail } from "./domain.js";
import { changes } from "./events.js";
export const onlineEnabled = Boolean(
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET &&
  process.env.RAZORPAY_WEBHOOK_SECRET,
);
export function signed(text, sig, secret) {
  if (!secret || typeof sig !== "string" || !/^[a-f0-9]{64}$/i.test(sig))
    return false;
  return timingSafeEqual(
    createHmac("sha256", secret).update(text).digest(),
    Buffer.from(sig, "hex"),
  );
}
async function razor(path, options = {}) {
  if (!onlineEnabled) fail(503, "Online payments are not configured.");
  try {
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
    ).toString("base64");
    const r = await fetch(`https://api.razorpay.com/v1/${path}`, {
      ...options,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Gateway HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error("Razorpay:", e.message);
    fail(502, "The payment gateway is unavailable. Please retry.");
  }
}
const orderJobs = new Map();
export async function order(id) {
  const b = await booking(id);
  if (b.status !== "awaiting_payment") return null;
  if (b.order_id) return checkout(id, b.order_id, b.total);
  if (!orderJobs.has(id)) {
    const pending = (async () => {
      const { id: orderId } = await razor("orders", {
        method: "POST",
        body: JSON.stringify({
          amount: b.total,
          currency: "INR",
          receipt: id,
          notes: { booking_id: id },
        }),
      });
      await run(
        "UPDATE payments SET order_id=? WHERE booking_id=? AND order_id IS NULL",
        orderId,
        id,
      );
      return checkout(
        id,
        (await one("SELECT order_id FROM payments WHERE booking_id=?", id))
          .order_id,
        b.total,
      );
    })().finally(() => orderJobs.delete(id));
    orderJobs.set(id, pending);
  }
  return orderJobs.get(id);
}
function checkout(bookingId, orderId, amount) {
  return {
    bookingId,
    orderId,
    amount,
    currency: "INR",
    key: process.env.RAZORPAY_KEY_ID,
  };
}
export async function recordPayment(entity) {
  const id = await tx(async () => {
    const b = await one(
      "SELECT b.*,p.state,p.order_id,p.payment_id,p.amount FROM bookings b JOIN payments p ON p.booking_id=b.id WHERE p.order_id=?",
      entity.order_id,
    );
    if (!b) return null;
    if (
      entity.currency !== "INR" ||
      entity.amount !== b.amount ||
      typeof entity.id !== "string"
    )
      fail(400, "Payment does not match the booking.");
    if (["paid", "paid_review"].includes(b.state)) return b.id;
    if (entity.status === "captured") {
      const active =
        b.status === "awaiting_payment" && b.hold_until > Date.now();
      await run(
        "UPDATE payments SET state=?, payment_id=?,updated=? WHERE booking_id=?",
        active ? "paid" : "paid_review",
        entity.id,
        Date.now(),
        b.id,
      );
      await run(
        "UPDATE bookings SET status=?,hold_until=NULL WHERE id=?",
        active ? "confirmed" : "payment_review",
        b.id,
      );
    } else if (entity.status === "failed" && b.status === "awaiting_payment") {
      await run(
        "UPDATE payments SET state='failed',updated=? WHERE booking_id=?",
        Date.now(),
        b.id,
      );
    }
    return b.id;
  });
  if (id) changes.emit("booking");
  return id;
}
export async function verify(b, { orderId, paymentId, signature }) {
  if (
    !b.order_id ||
    b.order_id !== orderId ||
    !signed(
      `${orderId}|${paymentId}`,
      signature,
      process.env.RAZORPAY_KEY_SECRET,
    )
  )
    fail(400, "Invalid payment signature.");
  const entity = await razor(`payments/${encodeURIComponent(paymentId)}`);
  if (
    entity.id !== paymentId ||
    entity.order_id !== b.order_id ||
    entity.amount !== b.total ||
    entity.currency !== "INR"
  )
    fail(400, "Payment details do not match.");
  await recordPayment(entity);
  return await booking(b.id);
}
export function notify(id) {
  void sendNotification(id).catch((error) => {
    console.error("Booking SMS could not be sent:", error.code || error.name);
  });
}
async function sendNotification(id) {
  const sid = process.env.TWILIO_ACCOUNT_SID,
    token = process.env.TWILIO_AUTH_TOKEN,
    from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return;
  const b = await booking(id);
  if (!b || !["confirmed", "pending"].includes(b.status)) return;
  if (
    !(
      await run(
        "INSERT INTO notification_deliveries(booking_id,kind) VALUES(?,?) ON CONFLICT DO NOTHING",
        id,
        b.status,
      )
    ).changes
  )
    return;
  try {
    const to = b.mobile.length === 10 ? `+91${b.mobile}` : `+${b.mobile}`;
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          From: from,
          To: to,
          Body: `${b.status === "confirmed" ? "Appointment confirmed" : "Appointment request received"}: ${id}, ${b.date} at ${b.time} IST.`,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await run(
      "UPDATE notification_deliveries SET sent=? WHERE booking_id=? AND kind=?",
      Date.now(),
      id,
      b.status,
    );
  } catch (e) {
    await run(
      "DELETE FROM notification_deliveries WHERE booking_id=? AND kind=? AND sent=0",
      id,
      b.status,
    );
    console.error("Booking SMS failed:", e.message);
  }
}
