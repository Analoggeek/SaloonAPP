import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { db, closeDb } from "./db.js";
if (!db) {
  await closeDb();
  console.error(
    "For PostgreSQL, use pg_dump or the database provider’s backup tools.",
  );
  process.exit(1);
}
const dir = resolve(process.env.BACKUP_DIR || "backups");
mkdirSync(dir, { recursive: true, mode: 0o700 });
process.umask(0o077);
const file = resolve(
  dir,
  `salon-${new Date().toISOString().replace(/[^0-9]/g, "")}.sqlite`,
);
await backup(db, file);
await closeDb();
console.log(file);
