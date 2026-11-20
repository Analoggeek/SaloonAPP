import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookingUrl, verifyBookingServer } from "../android/booking-url.mjs";

test("GitHub Pages has a static fallback without a raw JSX entry", () => {
  const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(shell, /data-noir-gateway/);
  assert.match(shell, /Online booking is not available/);
  assert.match(shell, /src="\.\/pages\/launch\.js"/);
  assert.doesNotMatch(shell, /<script[^>]*src="[^"]+\.jsx"/);
});

test("Android installer targets a healthy HTTPS checkout with real services", async () => {
  for (const invalid of [
    "https://analoggeek.github.io/SaloonAPP/",
    "http://example.com",
    "https://example.com/admin",
    "https://user@example.com",
    "https://example.com/#x",
  ]) {
    assert.throws(() => bookingUrl(invalid));
  }
  const url = bookingUrl("https://salon.example.com");
  const request =
    (services) =>
    async ({ pathname }) =>
      Response.json(pathname === "/healthz" ? { status: "ok" } : { services });
  await assert.rejects(
    verifyBookingServer(url, request([])),
    /at least one bookable service/,
  );
  await verifyBookingServer(url, request([{ id: 1 }]));
});

test("PWA manifest references available PNG icons", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../public/app.webmanifest", import.meta.url), "utf8"),
  );
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const png = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
