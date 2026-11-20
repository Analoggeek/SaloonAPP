import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/playfair-display/latin-500.css";
import "@fontsource/playfair-display/latin-600.css";
import "@fontsource/playfair-display/latin-500-italic.css";
import "./style.css";
const admin =
  location.pathname === "/admin" || location.pathname.startsWith("/admin/");
if (
  !admin &&
  import.meta.env.PROD &&
  window.isSecureContext &&
  window.top === window &&
  "serviceWorker" in navigator
) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {});
}
const { default: App } = await (admin
  ? import("./admin.jsx")
  : import("./customer.jsx"));
createRoot(document.getElementById("root")).render(<App />);
