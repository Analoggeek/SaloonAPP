export function bookingUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    url.pathname !== "/" ||
    url.hostname.endsWith(".github.io")
  ) {
    throw new Error(
      "Use the live booking server's HTTPS origin, not GitHub Pages or a subpage.",
    );
  }
  return url;
}

export async function verifyBookingServer(url, request = fetch) {
  const query = async (route) => {
    const response = await request(new URL(route, url), {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        `Booking server check failed at ${route} (HTTP ${response.status}).`,
      );
    return response.json();
  };
  const health = await query("/healthz");
  if (health.status !== "ok") throw new Error("Booking server is not healthy.");
  const catalog = await query("/api/catalog");
  if (!Array.isArray(catalog.services) || catalog.services.length === 0)
    throw new Error(
      "Publish at least one bookable service before building the customer APK.",
    );
}
