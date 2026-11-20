import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const dataDir = resolve(process.env.DATA_DIR || "data");
const dbPath = process.env.DB_PATH || resolve(dataDir, "salon.sqlite");
if (dbPath !== ":memory:")
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','viewer')));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id), name TEXT NOT NULL, description TEXT NOT NULL, image TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0), discount INTEGER CHECK(discount > 0 AND discount < price), duration INTEGER NOT NULL CHECK(duration > 0), enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS packages(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, image TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0), discount INTEGER CHECK(discount > 0 AND discount < price), enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS package_services(package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE, service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT, PRIMARY KEY(package_id,service_id));
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS coupons(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL CHECK(type IN ('fixed','percent')), amount INTEGER NOT NULL, expires TEXT NOT NULL DEFAULT '', minimum INTEGER NOT NULL DEFAULT 0, max_discount INTEGER, usage_limit INTEGER, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER NOT NULL, status TEXT NOT NULL, method TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, total INTEGER NOT NULL, coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL, coupon_code TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, hold_until INTEGER, request_key TEXT NOT NULL UNIQUE);
CREATE INDEX IF NOT EXISTS customer_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS booking_date ON bookings(date,status);
CREATE INDEX IF NOT EXISTS booking_coupon ON bookings(coupon_id,status);
CREATE TABLE IF NOT EXISTS booking_items(id INTEGER PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, service_id INTEGER REFERENCES services(id) ON DELETE SET NULL, package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL, name TEXT NOT NULL, quantity INTEGER NOT NULL, price INTEGER NOT NULL, duration INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payments(booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE, order_id TEXT UNIQUE, payment_id TEXT UNIQUE, amount INTEGER NOT NULL, state TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS availability(id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS salon_settings(id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notification_deliveries(booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, kind TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(booking_id,kind));
`);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
export function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const val = fn();
    db.exec("COMMIT");
    return val;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const categories = [
  "Haircut & Hairstyling",
  "Hair Spa",
  "Hair Coloring",
  "Beard Styling",
  "Facial",
  "Cleanup",
  "Hair Treatment",
  "Manicure & Pedicure",
  "Skin Care",
  "Grooming Packages",
  "Bridal Services",
];
for (const cat of categories)
  run("INSERT OR IGNORE INTO categories(name) VALUES (?)", cat);
export const settingsDefaults = {
  name: "Maison Noir",
  logo: "",
  phone: "",
  whatsapp: "",
  address: "",
  maps: "",
  hours: "",
  instagram: "",
  facebook: "",
  banner: "/images/hero.jpg",
  description:
    "Expert grooming, timeless style, and a moment to make your own.",
};
const availabilityDefaults = {
  open: "10:00",
  close: "20:00",
  slot: 30,
  capacity: 1,
  holidays: [],
  blockedDates: [],
  blockedSlots: [],
};
run(
  "INSERT OR IGNORE INTO salon_settings VALUES(1,?)",
  JSON.stringify(settingsDefaults),
);
run(
  "INSERT OR IGNORE INTO availability VALUES(1,?)",
  JSON.stringify(availabilityDefaults),
);
export const settings = () =>
  JSON.parse(one("SELECT config FROM salon_settings WHERE id=1").config);
export const availability = () =>
  JSON.parse(one("SELECT config FROM availability WHERE id=1").config);
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password, hash) {
  return timingSafeEqual(
    Buffer.from(hashPassword(password, hash.split(":")[0])),
    Buffer.from(hash),
  );
}
export function upsertAdmin(email, password, role = "admin") {
  run(
    "INSERT INTO admins(email,password,role) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET password=excluded.password, role=excluded.role",
    email,
    hashPassword(password),
    role,
  );
  run(
    "DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE email=?)",
    email,
  );
}
export function seed() {
  if (one("SELECT COUNT(*) AS n FROM services").n) return;
  tx(() => {
    const add = (
      category,
      name,
      description,
      image,
      price,
      discount,
      duration,
      sort,
    ) =>
      Number(
        run(
          "INSERT INTO services(category_id,name,description,image,price,discount,duration,sort) VALUES(?,?,?,?,?,?,?,?)",
          category,
          name,
          description,
          image,
          price,
          discount,
          duration,
          sort,
        ).lastInsertRowid,
      );
    const hair = add(
      1,
      "Signature Haircut",
      "A precision cut, expertly styled to suit you. Includes a wash and finish.",
      "/images/hair.jpg",
      69900,
      null,
      45,
      1,
    );
    const beard = add(
      4,
      "Beard Sculpt & Shave",
      "Defined lines, a tailored trim, and a relaxing hot-towel finish.",
      "/images/beard.jpg",
      49900,
      null,
      30,
      2,
    );
    const face = add(
      5,
      "Deep Cleanse Facial",
      "A refreshing facial that cleanses, exfoliates, and restores your natural glow.",
      "/images/facial.jpg",
      149900,
      119900,
      60,
      3,
    );
    add(
      2,
      "Restorative Hair Spa",
      "A nourishing scalp massage and conditioning ritual for healthier-looking hair.",
      "/images/salon.jpg",
      129900,
      null,
      45,
      4,
    );
    const combo = (name, description, image, price, discount, ids, sort) => {
      const id = Number(
        run(
          "INSERT INTO packages(name,description,image,price,discount,sort) VALUES(?,?,?,?,?,?)",
          name,
          description,
          image,
          price,
          discount,
          sort,
        ).lastInsertRowid,
      );
      for (const item of ids)
        run("INSERT INTO package_services VALUES(?,?)", id, item);
    };
    combo(
      "The Signature Duo",
      "A precision haircut and beard sculpt, all in one visit.",
      "/images/beard.jpg",
      119800,
      99900,
      [hair, beard],
      1,
    );
    combo(
      "The Noir Ritual",
      "Our signature cut, beard sculpt, and deep cleanse facial.",
      "/images/salon.jpg",
      269700,
      219900,
      [hair, beard, face],
      2,
    );
    run(
      "INSERT INTO coupons(code,type,amount,minimum,usage_limit) VALUES('FIRST10','percent',10,50000,500)",
    );
    run(
      "UPDATE salon_settings SET config=? WHERE id=1",
      JSON.stringify({
        ...settingsDefaults,
        address: "Connaught Place, New Delhi",
        maps: "https://www.google.com/maps?q=Connaught+Place,+New+Delhi",
        hours: "Daily · 10:00 AM – 8:00 PM",
        description:
          "An elevated grooming experience in the heart of New Delhi. Expert hands, timeless style, and a space designed around you.",
      }),
    );
  });
}
