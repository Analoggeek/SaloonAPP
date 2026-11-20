import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { sqliteSchema, postgresSchema } from "./schema.js";

export const dataDir = resolve(process.env.DATA_DIR || "data");
export const isPostgres = Boolean(process.env.DATABASE_URL);
const requirePostgres = process.env.REQUIRE_DATABASE_URL === "1";
if (requirePostgres && !isPostgres)
  throw new Error(
    "DATABASE_URL is required; local SQLite would lose changes on this host.",
  );
if (isPostgres && process.env.DEMO_MODE === "1")
  throw new Error("Demo mode cannot seed a remote database.");
let url = null;
if (isPostgres) {
  try {
    url = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid PostgreSQL connection string.",
    );
  }
}
if (url && !["postgres:", "postgresql:"].includes(url.protocol))
  throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
if (requirePostgres) url.searchParams.set("sslmode", "verify-full");
const pool = url
  ? new pg.Pool({
      connectionString: url.href,
      max: 4,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      types: {
        getTypeParser(oid, format) {
          if (oid === 20 && (!format || format === "text")) return Number;
          return pg.types.getTypeParser(oid, format);
        },
      },
    })
  : null;
pool?.on("error", (error) =>
  console.error("Postgres idle connection error:", error.code || error.name),
);

const dbPath = process.env.DB_PATH || resolve(dataDir, "salon.sqlite");
if (!pool && dbPath !== ":memory:")
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
export const db = pool ? null : new DatabaseSync(dbPath);
db?.exec(
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
);
const context = new AsyncLocalStorage();
let sqliteQueue = Promise.resolve();
function sqliteExclusive(work) {
  const result = sqliteQueue.then(work);
  sqliteQueue = result.catch(() => {});
  return result;
}
const pgSql = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};
async function query(kind, sql, args) {
  const connection = context.getStore();
  if (pool) {
    const result = await (connection || pool).query(pgSql(sql), args);
    if (kind === "run")
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
    return kind === "all" ? result.rows : result.rows[0];
  }
  const work = () => db.prepare(sql)[kind](...args);
  if (kind === "run" && /\bRETURNING id$/i.test(sql)) {
    const insert = () => ({
      lastInsertRowid: db.prepare(sql).get(...args)?.id,
    });
    return connection ? insert() : sqliteExclusive(insert);
  }
  return connection ? work() : sqliteExclusive(work);
}
export const all = (sql, ...args) => query("all", sql, args);
export const one = (sql, ...args) => query("get", sql, args);
export const run = (sql, ...args) => query("run", sql, args);
export async function tx(fn) {
  if (context.getStore()) return fn();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize salon mutations (including slot checks) across deployments before reading the schedule.
      await client.query("SELECT pg_advisory_xact_lock(563981, 1)");
      const result = await context.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return sqliteExclusive(async () => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = await context.run(db, fn);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
export const closeDb = () => (pool ? pool.end() : db.close());

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
export const settings = async () =>
  JSON.parse(
    (await one("SELECT config FROM salon_settings WHERE id=1")).config,
  );
export const availability = async () =>
  JSON.parse((await one("SELECT config FROM availability WHERE id=1")).config);

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password, hash) {
  return timingSafeEqual(
    Buffer.from(hashPassword(password, hash.split(":")[0])),
    Buffer.from(hash),
  );
}
export async function upsertAdmin(email, password, role = "admin") {
  await tx(async () => {
    await run(
      "INSERT INTO admins(email,password,role) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET password=excluded.password, role=excluded.role",
      email,
      hashPassword(password),
      role,
    );
    await run(
      "DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE email=?)",
      email,
    );
  });
}

async function initialize() {
  await tx(async () => {
    if (isPostgres) await context.getStore().query(postgresSchema);
    else db.exec(sqliteSchema);
    await run(
      `INSERT INTO categories(name) VALUES ${categories.map(() => "(?)").join(",")} ON CONFLICT DO NOTHING`,
      ...categories,
    );
    await run(
      "INSERT INTO salon_settings VALUES(1,?) ON CONFLICT DO NOTHING",
      JSON.stringify(settingsDefaults),
    );
    await run(
      "INSERT INTO availability VALUES(1,?) ON CONFLICT DO NOTHING",
      JSON.stringify(availabilityDefaults),
    );
    const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (email || password) {
      if (
        !email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 160 ||
        !password ||
        password.length < 12 ||
        password.length > 128
      ) {
        throw new Error(
          "Set a valid ADMIN_BOOTSTRAP_EMAIL and an ADMIN_BOOTSTRAP_PASSWORD of 12–128 characters, or remove both.",
        );
      }
      const changed = await run(
        "INSERT INTO admins(email,password) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM admins) ON CONFLICT DO NOTHING",
        email,
        hashPassword(password),
      );
      if (changed.changes)
        console.log(
          "First admin created. Remove the bootstrap environment variables.",
        );
    }
  });
}

await initialize();

export async function seed() {
  await tx(async () => {
    if ((await one("SELECT COUNT(*) AS n FROM services")).n) return;
    const add = async (
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
        (
          await run(
            "INSERT INTO services(category_id,name,description,image,price,discount,duration,sort) VALUES(?,?,?,?,?,?,?,?) RETURNING id",
            category,
            name,
            description,
            image,
            price,
            discount,
            duration,
            sort,
          )
        ).lastInsertRowid,
      );
    const hair = await add(
      1,
      "Signature Haircut",
      "A precision cut, expertly styled to suit you. Includes a wash and finish.",
      "/images/hair.jpg",
      69900,
      null,
      45,
      1,
    );
    const beard = await add(
      4,
      "Beard Sculpt & Shave",
      "Defined lines, a tailored trim, and a relaxing hot-towel finish.",
      "/images/beard.jpg",
      49900,
      null,
      30,
      2,
    );
    const face = await add(
      5,
      "Deep Cleanse Facial",
      "A refreshing facial that cleanses, exfoliates, and restores your natural glow.",
      "/images/facial.jpg",
      149900,
      119900,
      60,
      3,
    );
    await add(
      2,
      "Restorative Hair Spa",
      "A nourishing scalp massage and conditioning ritual for healthier-looking hair.",
      "/images/salon.jpg",
      129900,
      null,
      45,
      4,
    );
    const combo = async (
      name,
      description,
      image,
      price,
      discount,
      ids,
      sort,
    ) => {
      const id = Number(
        (
          await run(
            "INSERT INTO packages(name,description,image,price,discount,sort) VALUES(?,?,?,?,?,?) RETURNING id",
            name,
            description,
            image,
            price,
            discount,
            sort,
          )
        ).lastInsertRowid,
      );
      for (const item of ids)
        await run("INSERT INTO package_services VALUES(?,?)", id, item);
    };
    await combo(
      "The Signature Duo",
      "A precision haircut and beard sculpt, all in one visit.",
      "/images/beard.jpg",
      119800,
      99900,
      [hair, beard],
      1,
    );
    await combo(
      "The Noir Ritual",
      "Our signature cut, beard sculpt, and deep cleanse facial.",
      "/images/salon.jpg",
      269700,
      219900,
      [hair, beard, face],
      2,
    );
    await run(
      "INSERT INTO coupons(code,type,amount,minimum,usage_limit) VALUES('FIRST10','percent',10,50000,500)",
    );
    await run(
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
