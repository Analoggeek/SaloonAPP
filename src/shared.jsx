import React, { useEffect, useRef } from "react";
import { Scissors, X, LoaderCircle, AlertCircle } from "lucide-react";
export async function api(
  path,
  body,
  method = body === undefined ? "GET" : "POST",
  signal,
) {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-Salon-Request": "1" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Something went wrong."), {
      status: response.status,
    });
  return data;
}
export const cash = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: n % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n / 100);
export const label = (s) =>
  ({
    cash: "Cash on Service",
    online: "Pay Online",
    pending: "Pending Confirmation",
    awaiting_payment: "Awaiting Payment",
    payment_expired: "Payment Expired",
    payment_review: "Payment Needs Review",
    paid_review: "Paid · Needs Review",
  })[s] ||
  String(s || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (v) => v.toUpperCase());
export function friendlyDate(s) {
  return s
    ? new Intl.DateTimeFormat("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(s + "T00:00:00Z"))
    : "";
}
export function friendlyTime(s) {
  if (!s) return "";
  const [h, m] = s.split(":");
  return `${+h % 12 || 12}:${m} ${+h >= 12 ? "PM" : "AM"}`;
}
export function Brand({
  settings = {},
  suffix = "SALON & GROOMING",
  href = "/",
}) {
  return (
    <a
      className="brand"
      href={href}
      aria-label={`${settings.name || "Maison Noir"} home`}
    >
      {settings.logo ? (
        <img className="brand-logo" src={settings.logo} alt="" />
      ) : (
        <span className="brand-icon">
          <Scissors size={21} strokeWidth={1.55} />
        </span>
      )}
      <span>
        <strong>{settings.name || "Maison Noir"}</strong>
        <small>{suffix}</small>
      </span>
    </a>
  );
}
export function ErrorBox({ children }) {
  return children ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{children}</span>
    </div>
  ) : null;
}
export function Busy() {
  return (
    <span className="loading" role="status">
      <LoaderCircle size={21} /> Loading…
    </span>
  );
}
export function Modal({ title, close, children, wide = false }) {
  const dialog = useRef(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const d = dialog.current;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) closeRef.current();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Close">
            <X size={23} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function useTheme() {
  const [dark, setDark] = React.useState(
    () => localStorage.getItem("noir-theme") === "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("noir-theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, () => setDark((x) => !x)];
}
