import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Camera,
  Globe,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Moon,
  Phone,
  Plus,
  Scissors,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  api,
  Brand,
  Busy,
  cash,
  ErrorBox,
  friendlyDate,
  friendlyTime,
  label,
  Modal,
  useTheme,
} from "./shared.jsx";

const defaults = {
  name: "Maison Noir",
  banner: "/images/hero.jpg",
  description:
    "Expert grooming, timeless style, and a moment to make your own.",
};
const bagKey = "noir-cart-v1";
const bookingRoute = () =>
  location.pathname === "/booking" || location.pathname.startsWith("/booking/");
const bookingRouteId = () =>
  location.pathname.match(/^\/booking\/(MN-[A-F0-9]{12})$/)?.[1] || "";
const readBag = () => {
  try {
    const list = JSON.parse(localStorage.getItem(bagKey));
    return Array.isArray(list)
      ? list
          .filter(
            (x) =>
              x &&
              ["service", "package"].includes(x.kind) &&
              Number.isInteger(x.id) &&
              Number.isInteger(x.quantity) &&
              x.quantity > 0 &&
              x.quantity <= 10,
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
};
const same = (a, b) => a.kind === b.kind && a.id === b.id;
const itemKey = (i) => `${i.kind}:${i.id}`;
const catalogEmpty = {
  services: [],
  packages: [],
  categories: [],
  settings: defaults,
};
const eyebrow = (text) => (
  <span className="eyebrow">
    <i />
    {text}
  </span>
);
const priceFor = (x) => x.discount ?? x.price;
const clockDuration = (n) =>
  n >= 60
    ? `${Math.floor(n / 60)} hr${n % 60 ? ` ${n % 60} min` : ""}`
    : `${n} min`;
function Card({ record, kind, add, count }) {
  return (
    <article className="product-card">
      <div className="product-photo">
        <img src={record.image} alt={record.name} loading="lazy" />
        {record.discount && (
          <span className="product-badge">
            {Math.round((1 - record.discount / record.price) * 100)}% OFF
          </span>
        )}
      </div>
      <div className="product-info">
        <div className="product-meta">
          <span>
            {kind === "package" ? "Grooming Package" : record.category}
          </span>
          <span>
            <Clock3 size={14} />
            {clockDuration(record.duration)}
          </span>
        </div>
        <h3>{record.name}</h3>
        <p>{record.description}</p>
        {kind === "package" && (
          <small className="included">
            {record.services.map((s) => s.name).join(" · ")}
          </small>
        )}
        <div className="product-foot">
          <div>
            <strong>{cash(priceFor(record))}</strong>
            {record.discount && <del>{cash(record.price)}</del>}
          </div>
          <button
            className={`btn card-btn ${count ? "added" : ""}`}
            onClick={() => add(kind, record.id)}
            aria-label={`Add ${record.name} to cart`}
          >
            {count ? <Check size={16} /> : <Plus size={16} />}{" "}
            {count ? `In cart (${count})` : "Add to Cart"}
          </button>
        </div>
      </div>
    </article>
  );
}
function whatsapp(s) {
  return s.whatsapp ? `https://wa.me/${s.whatsapp.replace(/\D/g, "")}` : "";
}
function mapEmbed(s) {
  if (!s.maps || !s.address) return "";
  const u = new URL("https://www.google.com/maps");
  u.searchParams.set("q", s.address);
  u.searchParams.set("output", "embed");
  return u.toString();
}
function Summary({ q }) {
  return (
    <div className="summary">
      <div>
        <span>Subtotal</span>
        <b>{cash(q.subtotal)}</b>
      </div>
      {q.discount > 0 && (
        <div className="saving">
          <span>Discount {q.couponCode && `(${q.couponCode})`}</span>
          <b>−{cash(q.discount)}</b>
        </div>
      )}
      <div className="summary-total">
        <span>Total</span>
        <b>{cash(q.total)}</b>
      </div>
    </div>
  );
}
function BookingDetails({ b, retry, busy }) {
  return (
    <div className="booking-details">
      <div className="confirmation-mark">
        <Check size={24} />
      </div>
      <div className="booking-id">
        <span>BOOKING ID</span>
        <strong>{b.id}</strong>
      </div>
      <p className="booking-status">{label(b.status)}</p>
      <dl>
        <dt>Customer</dt>
        <dd>
          {b.name} · {b.mobile}
        </dd>
        {b.email && (
          <>
            <dt>Email</dt>
            <dd>{b.email}</dd>
          </>
        )}
        <dt>Appointment</dt>
        <dd>
          {friendlyDate(b.date)} at {friendlyTime(b.time)} IST
        </dd>
        <dt>Payment</dt>
        <dd>
          {label(b.method)} · {label(b.payment_status)}
        </dd>
        {b.payment_id && (
          <>
            <dt>Payment ID</dt>
            <dd>{b.payment_id}</dd>
          </>
        )}
      </dl>
      <h3>Booked services</h3>
      {b.items.map((x, i) => (
        <div className="simple-line" key={i}>
          <span>
            {x.name} × {x.quantity}
          </span>
          <strong>{cash(x.price * x.quantity)}</strong>
        </div>
      ))}
      <Summary q={b} />
      {b.status === "awaiting_payment" && (
        <>
          <p className="muted">
            Your slot is held for up to 15 minutes. If you already paid, wait
            for verification and check the status again before retrying.
          </p>
          <button
            disabled={busy}
            className="btn gold full"
            onClick={() => retry(b)}
          >
            <CreditCard size={17} /> Retry payment
          </button>
        </>
      )}
      {b.status === "payment_review" && (
        <p className="muted">
          Payment was received after the appointment hold ended. Contact the
          salon to arrange a new appointment or refund.
        </p>
      )}
    </div>
  );
}
let razorScript;
function loadRazor() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorScript)
    razorScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        razorScript = null;
        reject(new Error("Could not load Razorpay. Please retry."));
      };
      document.head.append(script);
    });
  return razorScript;
}
const newCheckout = () => ({
  name: "",
  mobile: "",
  email: "",
  date: "",
  time: "",
  instructions: "",
  method: "cash",
});
export default function Customer() {
  const [catalog, setCatalog] = useState(catalogEmpty),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [bag, setBag] = useState(readBag),
    [modal, setModal] = useState(
      location.hash === "#track" || bookingRoute() ? "track" : "",
    ),
    [menu, setMenu] = useState(false),
    [dark, toggleTheme] = useTheme();
  const [viewAll, setViewAll] = useState(false),
    [category, setCategory] = useState(""),
    [nav, setNav] = useState(location.hash || "#home");
  const [toast, setToast] = useState(""),
    [coupon, setCoupon] = useState(""),
    [couponDraft, setCouponDraft] = useState(""),
    [quote, setQuote] = useState(null),
    [quoteError, setQuoteError] = useState(""),
    [quoteVersion, setQuoteVersion] = useState(0),
    [couponError, setCouponError] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [booking, setBooking] = useState(null),
    [checkout, setCheckout] = useState(newCheckout),
    [requestKey, setRequestKey] = useState("");
  const [track, setTrack] = useState(() => ({
      id: bookingRouteId(),
      mobile: "",
    })),
    [slotList, setSlotList] = useState(null),
    [slotError, setSlotError] = useState(""),
    [slotVersion, setSlotVersion] = useState(0);
  const s = catalog.settings;
  const bagCount = bag.reduce((a, x) => a + x.quantity, 0);
  const onsale = catalog.services.slice(0, 3);
  const visible = viewAll
    ? catalog.services.filter((x) => !category || x.category_id === +category)
    : onsale;
  const fullBag = useMemo(
    () =>
      bag.map((x) => ({
        ...x,
        record: catalog[x.kind === "service" ? "services" : "packages"].find(
          (p) => p.id === x.id,
        ),
      })),
    [bag, catalog],
  );
  const rawQ = {
    subtotal: fullBag.reduce(
      (a, x) => a + (x.record ? priceFor(x.record) * x.quantity : 0),
      0,
    ),
    discount: 0,
    total: fullBag.reduce(
      (a, x) => a + (x.record ? priceFor(x.record) * x.quantity : 0),
      0,
    ),
  };
  const open = (kind) => {
    setError("");
    setMenu(false);
    setModal(kind);
    if (kind === "track") setBooking(null);
  };
  const close = () => {
    if (bookingRoute()) history.replaceState(null, "", "/");
    setModal("");
    setError("");
  };
  function refresh(signal) {
    api("/catalog", undefined, "GET", signal)
      .then((d) => {
        setCatalog(d);
        setLoadError("");
        document.title = `${d.settings.name} · Salon & Grooming`;
        document.querySelector('meta[name="description"]').content =
          d.settings.description || defaults.description;
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(e.message);
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }
  useEffect(() => {
    const ctrl = new AbortController();
    refresh(ctrl.signal);
    const focus = () => refresh(ctrl.signal);
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 30_000);
    return () => {
      window.removeEventListener("focus", focus);
      clearInterval(timer);
      ctrl.abort();
    };
  }, []);
  useEffect(() => {
    const sync = () => {
      setModal(bookingRoute() ? "track" : "");
      setBooking(null);
      setTrack((x) => ({ ...x, id: bookingRouteId() }));
      setError("");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    localStorage.setItem(bagKey, JSON.stringify(bag));
  }, [bag]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!["cart", "checkout"].includes(modal) || !bag.length) {
      setQuote(null);
      setQuoteError("");
      return;
    }
    const controller = new AbortController();
    setQuote(null);
    setQuoteError("");
    api("/quote", { items: bag, coupon }, "POST", controller.signal)
      .then(setQuote)
      .catch((e) => {
        if (e.name !== "AbortError") setQuoteError(e.message);
      });
    return () => controller.abort();
  }, [bag, coupon, modal, quoteVersion]);
  useEffect(() => {
    const c = new AbortController();
    setSlotList(null);
    setSlotError("");
    if (modal === "checkout" && checkout.date && quote?.duration) {
      if (quote.duration > 1440) {
        setSlotList([]);
        setSlotError(
          "This booking is too long. Split it into separate appointments.",
        );
        return;
      }
      api(
        `/slots?date=${checkout.date}&duration=${quote.duration}`,
        undefined,
        "GET",
        c.signal,
      )
        .then((d) => {
          setSlotList(d.slots);
          setCheckout((v) =>
            d.slots.includes(v.time) ? v : { ...v, time: "" },
          );
        })
        .catch((e) => {
          if (e.name !== "AbortError") setSlotError(e.message);
        });
    }
    return () => c.abort();
  }, [checkout.date, quote?.duration, modal, slotVersion]);
  function change(kind, id, delta) {
    setBag((prev) => {
      const found = prev.find((x) => same(x, { kind, id }));
      if (!found)
        return delta > 0 && prev.length < 20
          ? [...prev, { kind, id, quantity: 1 }]
          : prev;
      return prev
        .map((x) =>
          x === found
            ? { ...x, quantity: Math.min(10, x.quantity + delta) }
            : x,
        )
        .filter((x) => x.quantity > 0);
    });
  }
  function add(kind, id) {
    const record = catalog[kind === "service" ? "services" : "packages"].find(
      (x) => x.id === id,
    );
    const found = bag.find((x) => same(x, { kind, id }));
    if (found?.quantity === 10 || (!found && bag.length >= 20)) {
      setToast("Your cart has reached its item limit.");
      return;
    }
    change(kind, id, 1);
    setToast(`${record.name} added to cart`);
  }
  function startBooking() {
    if (bag.length) open("cart");
    else {
      setViewAll(true);
      setNav("#services");
      setMenu(false);
      location.hash = "services";
      document
        .getElementById("services")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  }
  function browse() {
    setViewAll(true);
    setCategory("");
    setNav("#services");
    setMenu(false);
    close();
  }
  async function applyCoupon(e) {
    e.preventDefault();
    setCouponError("");
    const next = couponDraft.trim().toUpperCase();
    if (!next) return;
    setBusy(true);
    try {
      const q = await api("/quote", { items: bag, coupon: next });
      setCoupon(next);
      setCouponDraft(next);
      setQuote(q);
    } catch (e) {
      setCouponError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function finish(b, phase = "confirmation") {
    if (phase === "confirmation" && !bookingRoute()) {
      history.pushState(null, "", `/booking/${b.id}`);
      window.scrollTo(0, 0);
    }
    setBooking(b);
    setTrack({ id: b.id, mobile: b.mobile });
    setModal(phase);
  }
  async function paymentPopup(payment, b, phase) {
    const credentials = { id: b.id, mobile: b.mobile };
    let restore = () => {},
      verifying = false;
    try {
      await loadRazor();
      const d = document.querySelector("dialog[open]");
      d?.close();
      restore = () => {
        if (d?.isConnected && !d.open) d.showModal();
      };
      const r = new window.Razorpay({
        key: payment.key,
        amount: payment.amount,
        currency: payment.currency,
        order_id: payment.orderId,
        name: s.name,
        description: `Appointment ${b.id}`,
        prefill: { name: b.name, email: b.email, contact: b.mobile },
        theme: { color: "#b89452" },
        handler: async (p) => {
          verifying = true;
          restore();
          setBusy(true);
          try {
            finish(
              await api("/payments/verify", {
                ...credentials,
                orderId: p.razorpay_order_id,
                paymentId: p.razorpay_payment_id,
                signature: p.razorpay_signature,
              }),
              phase,
            );
          } catch (e) {
            setError(
              `Payment could not be confirmed yet. Check your booking status. ${e.message}`,
            );
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: async () => {
            if (verifying) return;
            restore();
            try {
              finish(await api("/payments/dismiss", credentials), phase);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          },
        },
      });
      r.on("payment.failed", () => {
        setError(
          "Payment did not go through. You can retry in Razorpay or check your booking status.",
        );
      });
      r.open();
    } catch (e) {
      restore();
      setError(e.message);
      setBusy(false);
    }
  }
  async function submitBooking(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const key = requestKey || crypto.randomUUID();
    setRequestKey(key);
    try {
      const result = await api("/bookings", {
        ...checkout,
        items: bag,
        coupon,
        requestKey: key,
        expectedTotal: quote?.total,
      });
      setBag([]);
      setCoupon("");
      setCouponDraft("");
      setRequestKey("");
      setCheckout(newCheckout());
      finish(result.booking);
      if (result.payment) {
        await paymentPopup(result.payment, result.booking, "confirmation");
        return;
      }
      setError(result.paymentError);
    } catch (e) {
      setError(e.message);
      setQuoteVersion((v) => v + 1);
      setSlotVersion((v) => v + 1);
    }
    setBusy(false);
  }
  async function retryPayment(b) {
    setError("");
    setBusy(true);
    try {
      await paymentPopup(
        await api("/payments/retry", { id: b.id, mobile: b.mobile }),
        b,
        modal,
      );
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function lookup(e) {
    e.preventDefault();
    setError("");
    setBooking(null);
    setBusy(true);
    try {
      setBooking(await api("/lookup", track));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const link = (text, hash, fn) => (
    <a
      href={hash}
      className={nav === hash ? "active" : ""}
      onClick={() => {
        setNav(hash);
        setMenu(false);
        fn?.();
      }}
    >
      {text}
    </a>
  );
  const sectionHead = (tag, title, description, action) => (
    <div className="section-head">
      <div>
        {eyebrow(tag)}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
  const card = (p, kind) => (
    <Card
      key={p.id}
      record={p}
      kind={kind}
      add={add}
      count={bag.find((x) => same(x, { kind, id: p.id }))?.quantity ?? 0}
    />
  );
  const editCheckout = (k, v) =>
    setCheckout((x) => ({
      ...x,
      [k]: v,
      ...(k === "date" ? { time: "" } : {}),
    }));
  const tracking = (
    <>
      <form className="track-form" onSubmit={lookup}>
        <p className="muted">
          Enter your booking ID and the mobile number used to book.
        </p>
        <label>
          Booking ID
          <input
            required
            placeholder="MN-…"
            maxLength={15}
            value={track.id}
            onChange={(e) =>
              setTrack({ ...track, id: e.target.value.toUpperCase() })
            }
          />
        </label>
        <label>
          Mobile number
          <input
            required
            type="tel"
            value={track.mobile}
            onChange={(e) => setTrack({ ...track, mobile: e.target.value })}
          />
        </label>
        <button className="btn gold full" disabled={busy}>
          {busy ? "Checking…" : "Check Status"} <ArrowRight size={17} />
        </button>
      </form>
      <ErrorBox>{error}</ErrorBox>
      {booking && (
        <BookingDetails b={booking} retry={retryPayment} busy={busy} />
      )}
    </>
  );
  if (bookingRoute() && ["confirmation", "track"].includes(modal)) {
    const title =
      modal === "track"
        ? "Track a Booking"
        : booking?.status === "pending"
          ? "Appointment Requested"
          : booking?.status === "confirmed"
            ? "Appointment Confirmed"
            : "Booking Details";
    return (
      <div className="result-page">
        <header className="site-header">
          <div className="container result-nav">
            <Brand settings={s} href="/" />
            <a href="/">
              Back to salon <ArrowUpRight size={16} />
            </a>
          </div>
        </header>
        <main className="result-content">
          <div>
            {eyebrow("YOUR APPOINTMENT")}
            <h1>{title}</h1>
            {modal === "track"
              ? tracking
              : booking && (
                  <>
                    <ErrorBox>{error}</ErrorBox>
                    <BookingDetails
                      b={booking}
                      retry={retryPayment}
                      busy={busy}
                    />
                    <button
                      className="btn outline full"
                      onClick={() => {
                        setModal("track");
                        setError("");
                      }}
                    >
                      Check booking status <ArrowRight size={16} />
                    </button>
                  </>
                )}
          </div>
        </main>
      </div>
    );
  }
  return (
    <>
      <header className="site-header" id="home">
        <div className="container nav-wrap">
          <Brand settings={s} href="#home" />
          <nav
            className={menu ? "main-nav open" : "main-nav"}
            aria-label="Main navigation"
          >
            {link("Home", "#home")}
            {link("Services", "#services", () => setViewAll(true))}
            {link("Packages", "#packages")}
            {link("About", "#about")}
            {link("Contact", "#contact")}
          </nav>
          <div className="nav-actions">
            <button
              className="icon-button nav-theme"
              onClick={toggleTheme}
              aria-label={
                dark ? "Switch to light theme" : "Switch to dark theme"
              }
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button bag-button"
              aria-label={`Open cart, ${bagCount} items`}
              onClick={() => open("cart")}
            >
              <ShoppingBag size={20} />
              <span>{bagCount}</span>
            </button>
            <button className="btn gold nav-book" onClick={startBooking}>
              Book Now <ArrowUpRight size={15} />
            </button>
            <button
              className="icon-button menu-button"
              onClick={() => setMenu((v) => !v)}
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main>
        <section
          className="hero"
          aria-labelledby="hero-heading"
          style={{ "--hero-photo": `url('${s.banner || defaults.banner}')` }}
        >
          <div className="container hero-content">
            <div className="hero-copy">
              {eyebrow("THE ART OF GROOMING")}
              <h1 id="hero-heading">
                Look Good.
                <br />
                <em>Feel Great.</em>
              </h1>
              <p>{s.description || defaults.description}</p>
              <div className="hero-actions">
                <button className="btn gold" onClick={startBooking}>
                  <CalendarDays size={17} /> Book Appointment{" "}
                  <ArrowRight size={17} />
                </button>
                <a className="hero-link" href="#services" onClick={browse}>
                  Explore Services <ArrowDown size={14} />
                </a>
              </div>
            </div>
          </div>
          <div className="hero-index" aria-hidden="true">
            <span>01</span>
            <i /> <span>THE MAISON EXPERIENCE</span>
          </div>
        </section>
        <div className="benefits">
          <div className="container benefit-grid">
            <div>
              <Scissors />
              <span>
                <strong>Expert Stylists</strong>
                <small>Precision in every detail</small>
              </span>
            </div>
            <div>
              <Sparkles />
              <span>
                <strong>Premium Products</strong>
                <small>Only the finest for you</small>
              </span>
            </div>
            <div>
              <CalendarDays />
              <span>
                <strong>Easy Online Booking</strong>
                <small>Your time, your way</small>
              </span>
            </div>
          </div>
        </div>
        <section className="section services" id="services">
          <div className="container">
            {sectionHead(
              "THE SERVICE MENU",
              viewAll ? "Salon Services" : "Our Signature Services",
              "Expert care, tailored to your style.",
              <a
                className="btn outline"
                href="#services"
                onClick={() => {
                  setViewAll((v) => !v);
                  setCategory("");
                  setNav("#services");
                }}
              >
                {viewAll ? "Featured Services" : "View All Services"}{" "}
                <ArrowRight size={17} />
              </a>,
            )}
            {viewAll && (
              <div className="category-filter" aria-label="Filter services">
                <button
                  className={!category ? "selected" : ""}
                  onClick={() => setCategory("")}
                >
                  All Services
                </button>
                {catalog.categories
                  .filter((c) =>
                    catalog.services.some((x) => x.category_id === c.id),
                  )
                  .map((c) => (
                    <button
                      className={category === String(c.id) ? "selected" : ""}
                      key={c.id}
                      onClick={() => setCategory(String(c.id))}
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
            )}
            {loading ? (
              <Busy />
            ) : loadError ? (
              <>
                <ErrorBox>{loadError}</ErrorBox>
                <button className="btn outline" onClick={() => refresh()}>
                  Retry
                </button>
              </>
            ) : visible.length ? (
              <div className="product-grid">
                {visible.map((p) => card(p, "service"))}
              </div>
            ) : (
              <p className="empty-state">
                No services are available right now. Please check back soon.
              </p>
            )}
          </div>
        </section>
        <section className="section packages" id="packages">
          <div className="container">
            {sectionHead(
              "BETTER TOGETHER",
              "The Grooming Edit",
              "Thoughtfully paired treatments for a complete refresh.",
            )}
            {catalog.packages.length ? (
              <div className="product-grid package-grid">
                {catalog.packages.map((p) => card(p, "package"))}
              </div>
            ) : (
              !loading && (
                <p className="empty-state">
                  No packages are available right now.
                </p>
              )
            )}
          </div>
        </section>
        {!![...catalog.services, ...catalog.packages].filter((x) => x.discount)
          .length && (
          <section className="section offers">
            <div className="container offer-inner">
              <div>
                {eyebrow("SPECIAL OFFERS")}
                <h2>A little extra, for less.</h2>
                <p>
                  Explore current savings on selected services and packages.
                </p>
              </div>
              <div className="offer-links">
                {[
                  ...catalog.services.map((x) => ({
                    ...x,
                    target: "#services",
                  })),
                  ...catalog.packages.map((x) => ({
                    ...x,
                    target: "#packages",
                  })),
                ]
                  .filter((x) => x.discount)
                  .map((x) => (
                    <a
                      key={`${x.target}:${x.id}`}
                      href={x.target}
                      onClick={x.target === "#services" ? browse : undefined}
                    >
                      {x.name}{" "}
                      <strong>Save {cash(x.price - x.discount)}</strong>
                      <ChevronRight size={16} />
                    </a>
                  ))}
              </div>
            </div>
          </section>
        )}
        <section className="section about" id="about">
          <div className="container split">
            <img
              src="/images/salon.jpg"
              alt="Warmly lit Maison Noir salon interior"
              loading="lazy"
            />
            <div>
              {eyebrow("THE MAISON EXPERIENCE")}
              <h2>
                Good grooming.
                <br />
                <em>Quiet confidence.</em>
              </h2>
              <p>{s.description || defaults.description}</p>
              <button className="btn gold" onClick={startBooking}>
                Find Your Service <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
        </section>
        {!!s.testimonials?.length && (
          <section className="section reviews" id="reviews">
            <div className="container">
              {sectionHead("CLIENT NOTES", "In Their Words", "")}
              <div className="product-grid">
                {s.testimonials.map((r, i) => (
                  <figure className="review" key={i}>
                    <div aria-label={`${r.rating} stars`}>
                      {Array.from({ length: r.rating }, (_, j) => (
                        <Star key={j} size={17} fill="currentColor" />
                      ))}
                    </div>
                    <blockquote>“{r.quote}”</blockquote>
                    <figcaption>{r.name}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}
        <section className="section contact" id="contact">
          <div className="container contact-grid">
            <div>
              {eyebrow("COME ON IN")}
              <h2>Visit the Salon</h2>
              {s.address && (
                <p>
                  <MapPin size={19} />
                  {s.address}
                </p>
              )}
              {s.hours && (
                <p>
                  <Clock3 size={19} />
                  {s.hours}
                </p>
              )}
              {s.phone && (
                <p>
                  <Phone size={19} />
                  <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>
                    {s.phone}
                  </a>
                </p>
              )}
              {!s.address && !s.phone && (
                <p>
                  Contact details will appear here when published by the salon.
                </p>
              )}
              <div className="contact-actions">
                {s.maps && (
                  <a
                    className="btn outline"
                    href={s.maps}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get Directions <ArrowUpRight size={17} />
                  </a>
                )}
                {whatsapp(s) && (
                  <a
                    className="btn outline"
                    href={whatsapp(s)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={17} /> WhatsApp
                  </a>
                )}
              </div>
            </div>
            {mapEmbed(s) && (
              <iframe
                title="Salon location on Google Maps"
                src={mapEmbed(s)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            )}
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container footer-top">
          <div>
            <Brand settings={s} href="#home" />
            <p>{s.description || defaults.description}</p>
          </div>
          <div>
            <strong>EXPLORE</strong>
            <a href="#services" onClick={browse}>
              Services
            </a>
            <a href="#packages">Packages</a>
            <a href="#about">About us</a>
          </div>
          <div>
            <strong>APPOINTMENTS</strong>
            <button onClick={startBooking}>Book appointment</button>
            <button onClick={() => open("track")}>Track a booking</button>
            <a href="#contact">Contact</a>
          </div>
          <div>
            <strong>FOLLOW</strong>
            <div className="socials">
              {s.instagram && (
                <a
                  aria-label="Instagram"
                  href={s.instagram}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Camera size={18} />
                </a>
              )}
              {s.facebook && (
                <a
                  aria-label="Facebook"
                  href={s.facebook}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Globe size={18} />
                </a>
              )}
              {whatsapp(s) && (
                <a
                  aria-label="WhatsApp"
                  href={whatsapp(s)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={18} />
                </a>
              )}
            </div>
            <button onClick={toggleTheme}>
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} {s.name}. All rights reserved.
          </span>
          <a href="/admin">
            Staff login <ArrowUpRight size={13} />
          </a>
        </div>
      </footer>
      <div className="floating-actions">
        {whatsapp(s) ? (
          <a
            className="floating-chat"
            aria-label="Contact on WhatsApp"
            href={whatsapp(s)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={24} />
          </a>
        ) : (
          <button
            className="floating-chat"
            aria-label="Track a booking"
            onClick={() => open("track")}
          >
            <MessageCircle size={23} />
          </button>
        )}
      </div>
      <div className="mobile-bookbar">
        <button className="btn gold" onClick={startBooking}>
          <CalendarDays size={17} /> Book Appointment
        </button>
        <button className="btn outline" onClick={() => open("cart")}>
          <ShoppingBag size={17} /> {bagCount}
        </button>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            onClick={() => {
              setToast("");
              open("cart");
            }}
          >
            View cart <ArrowRight size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              cart: "Your Cart",
              checkout: "Book an Appointment",
              confirmation:
                booking?.status === "pending"
                  ? "Appointment Requested"
                  : booking?.status === "confirmed"
                    ? "Appointment Confirmed"
                    : "Booking Details",
              track: "Track a Booking",
            }[modal]
          }
          close={close}
          wide={modal === "checkout"}
        >
          {modal === "cart" &&
            (bag.length ? (
              <>
                <div className="cart-lines">
                  {fullBag.map((i) => (
                    <div className="cart-line" key={itemKey(i)}>
                      {i.record && <img src={i.record.image} alt="" />}
                      <div>
                        <strong>{i.record?.name || "Unavailable item"}</strong>
                        <small>
                          {i.record
                            ? `${cash(priceFor(i.record))} each · ${i.record.duration} min`
                            : "Remove this item to continue."}
                        </small>
                        <div className="qty">
                          <button
                            disabled={i.quantity <= 1}
                            aria-label="Decrease quantity"
                            onClick={() => change(i.kind, i.id, -1)}
                          >
                            <Minus size={15} />
                          </button>
                          <span>{i.quantity}</span>
                          <button
                            disabled={i.quantity >= 10}
                            aria-label="Increase quantity"
                            onClick={() => change(i.kind, i.id, 1)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="cart-line-end">
                        <button
                          className="icon-button"
                          aria-label="Remove item"
                          onClick={() =>
                            setBag((x) => x.filter((y) => !same(y, i)))
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                        {i.record && (
                          <b>{cash(priceFor(i.record) * i.quantity)}</b>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <form className="coupon-form" onSubmit={applyCoupon}>
                  <input
                    aria-label="Coupon code"
                    placeholder="Coupon code"
                    value={couponDraft}
                    onChange={(e) => setCouponDraft(e.target.value)}
                    maxLength={32}
                  />
                  <button className="btn outline" disabled={busy}>
                    Apply
                  </button>
                  {coupon && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setCoupon("");
                        setCouponDraft("");
                        setCouponError("");
                      }}
                    >
                      Clear
                    </button>
                  )}
                </form>
                <ErrorBox>{couponError || quoteError}</ErrorBox>
                <Summary q={quote || rawQ} />
                <button
                  className="btn gold full"
                  disabled={!quote || busy}
                  onClick={() => open("checkout")}
                >
                  Proceed to Checkout <ArrowRight size={17} />
                </button>
                <button className="btn text-button full" onClick={close}>
                  Continue shopping
                </button>
              </>
            ) : (
              <div className="empty-cart">
                <ShoppingBag size={42} />
                <h3>Your cart is empty</h3>
                <p>Add a service or package to get started.</p>
                <a href="#services" className="btn gold" onClick={browse}>
                  Explore Services <ArrowRight size={16} />
                </a>
              </div>
            ))}
          {modal === "checkout" && (
            <form className="checkout-form" onSubmit={submitBooking}>
              <div>
                <h3>Your details</h3>
                <div className="form-grid">
                  <label>
                    Customer name
                    <input
                      required
                      autoComplete="name"
                      minLength={2}
                      maxLength={100}
                      value={checkout.name}
                      onChange={(e) => editCheckout("name", e.target.value)}
                    />
                  </label>
                  <label>
                    Mobile number
                    <input
                      required
                      type="tel"
                      autoComplete="tel"
                      value={checkout.mobile}
                      onChange={(e) => editCheckout("mobile", e.target.value)}
                    />
                  </label>
                  <label className="span-all">
                    Email <span>(optional)</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={checkout.email}
                      onChange={(e) => editCheckout("email", e.target.value)}
                    />
                  </label>
                </div>
                <h3>Choose a time</h3>
                <div className="form-grid">
                  <label>
                    Appointment date
                    <input
                      required
                      type="date"
                      min={catalog.today}
                      value={checkout.date}
                      onChange={(e) => editCheckout("date", e.target.value)}
                    />
                  </label>
                  <label>
                    Available slot <span>(IST)</span>
                    <select
                      required
                      disabled={!slotList?.length}
                      value={checkout.time}
                      onChange={(e) => editCheckout("time", e.target.value)}
                    >
                      <option value="">
                        {!checkout.date
                          ? "Choose a date"
                          : slotList === null
                            ? "Loading slots…"
                            : slotList.length
                              ? "Choose a time"
                              : "No slots available"}
                      </option>
                      {slotList?.map((t) => (
                        <option key={t} value={t}>
                          {friendlyTime(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="span-all">
                    Special instructions <span>(optional)</span>
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={checkout.instructions}
                      onChange={(e) =>
                        editCheckout("instructions", e.target.value)
                      }
                    />
                  </label>
                </div>
                <ErrorBox>{slotError}</ErrorBox>
              </div>
              <aside>
                <h3>Your appointment</h3>
                {(
                  quote?.items ||
                  fullBag
                    .filter((x) => x.record)
                    .map((x) => ({
                      ...x,
                      name: x.record.name,
                      price: priceFor(x.record),
                    }))
                ).map((x) => (
                  <div className="simple-line" key={itemKey(x)}>
                    <span>
                      {x.name} × {x.quantity}
                    </span>
                    <strong>{cash(x.price * x.quantity)}</strong>
                  </div>
                ))}
                <Summary q={quote || rawQ} />
                <fieldset className="payment-options">
                  <legend>Payment method</legend>
                  <label>
                    <input
                      type="radio"
                      name="method"
                      checked={checkout.method === "cash"}
                      onChange={() => editCheckout("method", "cash")}
                    />
                    <Wallet size={17} /> Cash on Service
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="method"
                      checked={checkout.method === "online"}
                      disabled={!catalog.onlineEnabled || quote?.total === 0}
                      onChange={() => editCheckout("method", "online")}
                    />
                    <CreditCard size={17} /> Pay Online
                  </label>
                  {!catalog.onlineEnabled && (
                    <small>Online payments are not available right now.</small>
                  )}
                </fieldset>
                <ErrorBox>{error || quoteError}</ErrorBox>
                <button
                  className="btn gold full"
                  disabled={!quote || !checkout.time || busy}
                >
                  {busy
                    ? "Saving…"
                    : checkout.method === "online"
                      ? "Continue to Payment"
                      : "Request Appointment"}{" "}
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  className="text-button full"
                  onClick={() => open("cart")}
                >
                  Back to cart
                </button>
              </aside>
            </form>
          )}
          {modal === "track" && tracking}
        </Modal>
      )}
    </>
  );
}
