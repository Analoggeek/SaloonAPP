import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

const dir = mkdtempSync(join(tmpdir(), "maison-noir-test-"));
const email = "admin@example.test",
  viewer = "viewer@example.test",
  password = randomBytes(22).toString("hex");
const secret = randomBytes(16).toString("hex"),
  webhookSecret = randomBytes(16).toString("hex");
const env = {
  ...process.env,
  PORT: "0",
  DATA_DIR: dir,
  DB_PATH: join(dir, "test.sqlite"),
  COOKIE_SECURE: "0",
  DEMO_MODE: "0",
  TRUST_PROXY: "",
  RAZORPAY_KEY_ID: "rzp_test_fixture",
  RAZORPAY_KEY_SECRET: secret,
  RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  TWILIO_ACCOUNT_SID: "",
};
let server, base;
before(async () => {
  for (const [account, role] of [
    [email, "admin"],
    [viewer, "viewer"],
  ]) {
    const r = spawnSync(process.execPath, ["server/create-admin.js"], {
      env: {
        ...env,
        ADMIN_EMAIL: account,
        ADMIN_PASSWORD: password,
        ADMIN_ROLE: role,
      },
    });
    assert.equal(r.status, 0, r.stderr.toString());
  }
  const build = spawnSync("npm", ["run", "build"], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  server = spawn(
    process.execPath,
    ["--import", "./tests/mock-razorpay.js", "server/index.js"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let details = "";
  server.stderr.on("data", (b) => {
    details += b.toString();
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Server startup timed out: ${details}`)),
      10000,
    );
    server.on("exit", (status) => {
      clearTimeout(timer);
      reject(new Error(`Server exited ${status}: ${details}`));
    });
    server.stdout.on("data", (b) => {
      const match = b.toString().match(/listening on (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  base = `http://127.0.0.1:${port}`;
});
after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
  rmSync(dir, { recursive: true, force: true });
});
async function call(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const r = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method === "GET" ? {} : { "X-Salon-Request": "1" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
  const data = r.headers.get("content-type")?.includes("json")
    ? await r.json()
    : await r.text();
  return { status: r.status, data, headers: r.headers };
}
async function login(account) {
  const r = await call("/admin/login", {
    method: "POST",
    body: { email: account, password },
  });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  return cookie.split(";")[0];
}
const sign = (key, value) =>
  createHmac("sha256", key).update(value).digest("hex");
const future = (today, offset) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

test("shared production database: permissions, live prices, coupons, booking overlap and exports", async () => {
  const initial = await call("/catalog");
  assert.deepEqual(initial.data.services, []);
  assert.deepEqual(initial.data.packages, []);
  assert.equal((await call("/admin/stats")).status, 401);
  assert.equal(
    (
      await call("/admin/login", {
        method: "POST",
        body: { email, password: "incorrect" },
      })
    ).status,
    401,
  );
  const cookie = await login(email),
    viewerCookie = await login(viewer);
  const service = {
    name: "Shear Cut",
    description: "A salon cut with a finish.",
    price: 80000,
    discount: 70000,
    image: "/images/hair.jpg",
    enabled: true,
    sort: 3,
    duration: 45,
    category_id: 1,
  };
  assert.equal(
    (
      await call("/admin/services", {
        method: "POST",
        body: service,
        cookie: viewerCookie,
      })
    ).status,
    403,
  );
  const create = await call("/admin/services", {
    method: "POST",
    body: service,
    cookie,
  });
  assert.equal(create.status, 200);
  const id = create.data.id;
  const edits = await call(`/admin/services/${id}`, {
    method: "PUT",
    cookie,
    body: { ...service, discount: 65000 },
  });
  assert.equal(edits.status, 200);
  const pkg = await call("/admin/packages", {
    method: "POST",
    cookie,
    body: { ...service, name: "Cut Package", serviceIds: [id] },
  });
  assert.equal(pkg.status, 200);
  const catalog = await call("/catalog");
  assert.equal(catalog.data.services[0].discount, 65000);
  assert.equal(catalog.data.packages[0].duration, 45);
  assert.equal(
    (
      await call("/admin/coupons", {
        method: "POST",
        cookie,
        body: {
          code: "CUT10",
          type: "percent",
          amount: 10,
          expires: "",
          minimum: 50000,
          max_discount: 5000,
          usage_limit: 1,
          enabled: true,
        },
      })
    ).status,
    200,
  );
  const items = [{ kind: "service", id, quantity: 1 }];
  const quote = await call("/quote", {
    method: "POST",
    body: { items, coupon: "cut10" },
  });
  assert.equal(quote.data.total, 60000);
  const date = future(initial.data.today, 2),
    blocked = future(initial.data.today, 3);
  assert.equal(
    (
      await call("/admin/availability", {
        method: "PUT",
        cookie,
        body: {
          open: "10:00",
          close: "20:00",
          slot: 30,
          capacity: 1,
          holidays: [],
          blockedDates: [blocked],
          blockedSlots: [{ date, time: "12:00" }],
        },
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await call(`/slots?date=${blocked}&duration=45`)).data.slots,
    [],
  );
  assert.ok(
    !(await call(`/slots?date=${date}&duration=45`)).data.slots.includes(
      "11:30",
    ),
  );
  const b = {
    items,
    coupon: "CUT10",
    date,
    time: "10:00",
    method: "cash",
    name: "Cash Customer",
    mobile: "9876543210",
    email: "",
    instructions: "",
    requestKey: randomUUID(),
  };
  const race = await Promise.all([
    call("/bookings", { method: "POST", body: b }),
    call("/bookings", {
      method: "POST",
      body: { ...b, coupon: "", time: "10:30", requestKey: randomUUID() },
    }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  // Either request may win the transaction. Remove the secondary hold if it did.
  let result = race[0];
  if (result.status !== 201) {
    const other = race[1].data.booking;
    assert.equal(
      (
        await call(`/admin/bookings/${other.id}`, {
          method: "PATCH",
          cookie,
          body: {
            date,
            time: other.time,
            status: "cancelled",
            notes: "Release test slot",
          },
        })
      ).status,
      200,
    );
    result = await call("/bookings", { method: "POST", body: b });
  }
  assert.equal(result.status, 201);
  const receipt = result.data.booking;
  assert.equal(receipt.status, "pending");
  assert.equal(receipt.payment_status, "unpaid");
  assert.equal(receipt.total, 60000);
  assert.equal(
    (await call("/bookings", { method: "POST", body: b })).data.booking.id,
    receipt.id,
  );
  assert.equal(
    (await call("/quote", { method: "POST", body: { items, coupon: "CUT10" } }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/lookup", {
        method: "POST",
        body: { id: receipt.id, mobile: "9876543211" },
      })
    ).status,
    404,
  );
  const found = await call("/lookup", {
    method: "POST",
    body: { id: receipt.id, mobile: "+91 9876543210" },
  });
  assert.equal(found.data.id, receipt.id);
  assert.ok(!("notes" in found.data));
  const rows = await call(
    `/admin/bookings?date=${date}&search=Cash&status=pending`,
    { cookie },
  );
  assert.equal(rows.data.length, 1);
  assert.equal(rows.data[0].id, receipt.id);
  for (const status of ["confirmed", "completed"])
    assert.equal(
      (
        await call(`/admin/bookings/${receipt.id}`, {
          method: "PATCH",
          cookie,
          body: { date, time: b.time, status, notes: "Internal only" },
        })
      ).status,
      200,
    );
  const summary = await call("/admin/stats", { cookie });
  assert.equal(summary.data.cash, 60000);
  assert.equal(summary.data.completed, 1);
  const csv = await call("/admin/bookings.csv", { cookie });
  assert.match(csv.data, /Cash Customer/);
  assert.match(csv.data, /Internal only/);
  const disabled = await call(`/admin/services/${id}`, {
    method: "PUT",
    cookie,
    body: { ...service, enabled: false },
  });
  assert.equal(disabled.status, 200);
  assert.equal((await call("/catalog")).data.packages.length, 0);
  assert.equal(
    (
      await call(`/admin/services/${id}`, {
        method: "PUT",
        cookie,
        body: service,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/admin/logout", { method: "POST", body: {}, cookie })).status,
    200,
  );
  assert.equal((await call("/admin/session", { cookie })).status, 401);
});

test("Razorpay captures only after matching server verification and handles duplicate webhooks", async () => {
  const { data: cat } = await call("/catalog");
  const date = future(cat.today, 5);
  const items = [{ kind: "service", id: cat.services[0].id, quantity: 1 }];
  const { data: result, status } = await call("/bookings", {
    method: "POST",
    body: {
      items,
      date,
      time: "11:00",
      method: "online",
      name: "Online Customer",
      mobile: "9876543209",
      requestKey: randomUUID(),
    },
  });
  assert.equal(status, 201);
  assert.equal(result.booking.status, "awaiting_payment");
  assert.equal(result.booking.payment_status, "pending");
  const { id, mobile, total } = result.booking,
    { orderId } = result.payment;
  const verify = (paymentId, signature) =>
    call("/payments/verify", {
      method: "POST",
      body: { id, mobile, orderId, paymentId, signature },
    });
  assert.equal((await verify("pay_Captured1", "0".repeat(64))).status, 400);
  const authorized = await verify(
    "pay_Authorized1",
    sign(secret, `${orderId}|pay_Authorized1`),
  );
  assert.equal(authorized.data.payment_status, "pending");
  const payload = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_Captured1",
          order_id: orderId,
          amount: total,
          currency: "INR",
          status: "captured",
        },
      },
    },
  });
  const web = (sig) =>
    call("/razorpay/webhook", {
      method: "POST",
      body: payload,
      headers: { "X-Razorpay-Signature": sig },
    });
  assert.equal((await web("0".repeat(64))).status, 401);
  assert.equal((await web(sign(webhookSecret, payload))).status, 200);
  assert.equal((await web(sign(webhookSecret, payload))).status, 200);
  const confirmed = await verify(
    "pay_Captured1",
    sign(secret, `${orderId}|pay_Captured1`),
  );
  assert.equal(confirmed.data.status, "confirmed");
  assert.equal(confirmed.data.payment_status, "paid");
  assert.equal(confirmed.data.payment_id, "pay_Captured1");
  const stats = await call("/admin/stats", { cookie: await login(email) });
  assert.equal(stats.data.online, total);
});

test("dismissed and failed online attempts remain unpaid and reuse their stored order", async () => {
  const { data: cat } = await call("/catalog");
  const date = future(cat.today, 6);
  const input = {
    items: [{ kind: "service", id: cat.services[0].id, quantity: 1 }],
    date,
    time: "11:00",
    method: "online",
    name: "Retry Customer",
    mobile: "9876543207",
    requestKey: randomUUID(),
  };
  const { data, status } = await call("/bookings", {
    method: "POST",
    body: input,
  });
  assert.equal(status, 201);
  const { id, mobile, total } = data.booking;
  const { orderId } = data.payment;
  const dismiss = await call("/payments/dismiss", {
    method: "POST",
    body: { id, mobile },
  });
  assert.equal(dismiss.data.payment_status, "cancelled");
  const retry = await call("/payments/retry", {
    method: "POST",
    body: { id, mobile },
  });
  assert.equal(retry.data.orderId, orderId);
  const payload = JSON.stringify({
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_Failed2",
          order_id: orderId,
          amount: total,
          currency: "INR",
          status: "failed",
        },
      },
    },
  });
  assert.equal(
    (
      await call("/razorpay/webhook", {
        method: "POST",
        body: payload,
        headers: { "X-Razorpay-Signature": sign(webhookSecret, payload) },
      })
    ).status,
    200,
  );
  const lookup = await call("/lookup", {
    method: "POST",
    body: { id, mobile },
  });
  assert.equal(lookup.data.payment_status, "failed");
  assert.equal(lookup.data.status, "awaiting_payment");
  assert.equal(lookup.data.payment_id, null);
});
