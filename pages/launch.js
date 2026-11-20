// Raw GitHub Pages does not run Vite. This static entry never attempts a booking.
if (!import.meta.env?.MODE) {
  const gateway = document.querySelector("[data-noir-gateway]");
  const asset = new URL("../public/images/hero.jpg", import.meta.url).href;
  gateway.style.setProperty("--noir-image", `url("${asset}")`);
  const https = (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password
        ? parsed
        : null;
    } catch {
      return null;
    }
  };
  const connect = (selector, href) => {
    const link = gateway.querySelector(selector);
    link.href = href;
    link.hidden = false;
  };
  fetch(new URL("../public/booking-links.json", import.meta.url), {
    cache: "no-cache",
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((links) => {
      const booking = https(links?.bookingUrl);
      if (!booking || booking.origin === location.origin) return;
      connect("[data-booking-link]", booking.href);
      gateway.querySelector("[data-booking-status]").textContent =
        "Book your next visit on the Maison Noir booking website.";
      const apk = https(links?.androidApkUrl);
      connect(
        "[data-installer-link]",
        apk?.href || new URL("/install.html", booking.origin).href,
      );
    })
    .catch(() => {});
}
