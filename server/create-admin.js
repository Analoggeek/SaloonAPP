import { upsertAdmin, closeDb } from "./db.js";
const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const role = process.env.ADMIN_ROLE || "admin";
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  password.length < 12 ||
  password.length > 128 ||
  !["admin", "viewer"].includes(role)
) {
  console.error(
    "Supply ADMIN_EMAIL and ADMIN_PASSWORD (12–128 characters); ADMIN_ROLE may be admin or viewer.",
  );
  process.exit(1);
}
try {
  await upsertAdmin(email, password, role);
} finally {
  await closeDb();
}
console.log("Admin saved; previous sessions revoked.");
