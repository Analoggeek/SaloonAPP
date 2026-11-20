import React, { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesColumn,
  Clock3,
  CreditCard,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Scissors,
  Settings,
  Sun,
  Tag,
  Wallet,
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
const tabs = [
  ["Overview", LayoutDashboard],
  ["Bookings", CalendarDays],
  ["Services", Scissors],
  ["Packages", Package],
  ["Coupons", Tag],
  ["Availability", Clock3],
  ["Settings", Settings],
];
const statusOptions = [
  "pending",
  "confirmed",
  "completed",
  "rejected",
  "cancelled",
  "awaiting_payment",
  "payment_expired",
  "payment_review",
];
const transitions = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["completed", "cancelled"],
  awaiting_payment: ["cancelled"],
  payment_expired: ["cancelled"],
};
const money = (n) =>
  n === "" || n === null ? null : Math.round(Number(n) * 100);
const rupees = (n) => (n == null ? "" : n / 100);
function Field({
  name,
  value,
  onChange,
  type = "text",
  className = "",
  ...props
}) {
  return (
    <label className={className}>
      {name}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </label>
  );
}
function Area({ name, value, onChange, ...props }) {
  return (
    <label className="span-all">
      {name}
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </label>
  );
}
function ImageField({ name, value, change, disabled }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function upload(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 3_000_000) {
      setError("Please select an image under 3 MB.");
      return;
    }
    setBusy(true);
    try {
      const reader = new FileReader();
      const data = await new Promise((ok, bad) => {
        reader.onload = () => ok(reader.result);
        reader.onerror = bad;
        reader.readAsDataURL(file);
      });
      const r = await api("/admin/upload", { data });
      change(r.url);
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="span-all image-field">
      <label>
        {name}
        <input
          type="file"
          disabled={disabled || busy}
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
        />
      </label>
      {busy && <Busy />}
      {value && (
        <div>
          <img src={value} alt="Current upload" />
          <button
            className="text-button"
            type="button"
            disabled={disabled}
            onClick={() => change("")}
          >
            Remove image
          </button>
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}
function AdminLogin({ onLogin, dark, toggle }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api("/admin/login", { email, password }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <aside>
        <Brand />
        <div>
          <p className="eyebrow">
            <i /> MAISON NOIR STUDIO
          </p>
          <h1>
            Behind the
            <br />
            <em>chair.</em>
          </h1>
          <p>
            Salon operations, from the first booking to the finishing touch.
          </p>
        </div>
        <a href="/">
          Customer website <ArrowUpRight size={16} />
        </a>
      </aside>
      <main>
        <button
          className="icon-button login-theme"
          onClick={toggle}
          aria-label="Toggle theme"
        >
          {dark ? <Sun /> : <Moon />}
        </button>
        <form onSubmit={login}>
          <span className="eyebrow">
            <i /> STAFF PORTAL
          </span>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to manage your salon.</p>
          <Field
            name="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="username"
            required
          />
          <div className="password-wrap">
            <Field
              name="Password"
              type={show ? "text" : "password"}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              <Eye size={18} />
            </button>
          </div>
          <ErrorBox>{error}</ErrorBox>
          <button className="btn gold full" disabled={busy}>
            {busy ? "Signing in…" : "Sign In"} <ArrowUpRight size={17} />
          </button>
        </form>
      </main>
    </div>
  );
}
function Analytics({ stats }) {
  const k = [
    ["Total Bookings", "total"],
    ["Today’s Bookings", "today"],
    ["Pending Bookings", "pending"],
    ["Confirmed Bookings", "confirmed"],
    ["Completed Bookings", "completed"],
    ["Cancelled / Rejected", "cancelled"],
    ["Total Revenue", "revenue"],
    ["Online Payments", "online"],
    ["Cash Payments", "cash"],
  ];
  return (
    <>
      <div className="stat-grid">
        {k.map(([name, key], i) => (
          <article className="stat-card" key={key}>
            <div>
              {i < 6 ? (
                <CalendarDays size={18} />
              ) : i === 8 ? (
                <Wallet size={18} />
              ) : (
                <CreditCard size={18} />
              )}
              <span>{name}</span>
            </div>
            <strong>{i < 6 ? stats[key] : cash(stats[key])}</strong>
          </article>
        ))}
      </div>
      <div className="analytics-grid">
        {[
          ["Booking activity", "count"],
          ["Revenue activity", "revenue"],
        ].map(([title, key]) => {
          const max = Math.max(1, ...stats.daily.map((x) => x[key]));
          return (
            <article className="admin-panel chart-panel" key={key}>
              <h2>
                <ChartNoAxesColumn size={19} /> {title}
              </h2>
              <p className="muted">Last seven days · IST</p>
              <div className="bar-chart">
                {stats.daily.map((d) => (
                  <div key={d.date}>
                    <strong>{key === "count" ? d[key] : cash(d[key])}</strong>
                    <span
                      style={{
                        height: `${Math.max(2, (d[key] / max) * 100)}%`,
                      }}
                    />
                    <small>{d.date.slice(5).replace("-", "/")}</small>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
function BookingEditor({ record, done, readonly }) {
  const [data, set] = useState({
    date: record.date,
    time: record.time,
    status: record.status,
    notes: record.notes,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const change = (k, v) => set((x) => ({ ...x, [k]: v }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/bookings/${record.id}`, data, "PATCH");
      done();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="admin-form">
      <div className="booking-admin-info">
        <b>{record.name}</b> ·{" "}
        <a href={`tel:${record.mobile}`}>{record.mobile}</a>
        {record.email && <div>{record.email}</div>}
        <div>
          {label(record.method)} · {label(record.payment_status)} ·{" "}
          {cash(record.total)}
        </div>
        {record.payment_id && <div>Payment ID: {record.payment_id}</div>}
        {record.instructions && (
          <p>
            <strong>Customer notes:</strong> {record.instructions}
          </p>
        )}
        {record.items.map((x, i) => (
          <div className="simple-line" key={i}>
            <span>
              {x.name} × {x.quantity}
            </span>
            <b>{cash(x.price * x.quantity)}</b>
          </div>
        ))}
      </div>
      <div className="form-grid">
        <Field
          name="Appointment date"
          type="date"
          value={data.date}
          onChange={(v) => change("date", v)}
          disabled={
            readonly || !["pending", "confirmed"].includes(record.status)
          }
          required
        />
        <Field
          name="Appointment time (IST)"
          type="time"
          value={data.time}
          onChange={(v) => change("time", v)}
          disabled={
            readonly || !["pending", "confirmed"].includes(record.status)
          }
          required
        />
        <label className="span-all">
          Booking status
          <select
            value={data.status}
            disabled={readonly}
            onChange={(e) => change("status", e.target.value)}
          >
            {[record.status, ...(transitions[record.status] || [])].map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </select>
        </label>
        <Area
          name="Internal notes"
          rows={3}
          maxLength={2000}
          value={data.notes}
          onChange={(v) => change("notes", v)}
          disabled={readonly}
        />
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!readonly && (
        <button className="btn gold full" disabled={busy}>
          {busy ? "Saving…" : "Save booking"}
        </button>
      )}
    </form>
  );
}
const productDefault = {
  name: "",
  description: "",
  image: "",
  price: "",
  discount: "",
  duration: 30,
  category_id: 1,
  sort: 0,
  enabled: true,
  serviceIds: [],
};
const couponDefault = {
  code: "",
  type: "percent",
  amount: "",
  expires: "",
  minimum: 0,
  max_discount: "",
  usage_limit: "",
  enabled: true,
};
function CatalogEditor({ kind, record, cat, done, readonly }) {
  const coupon = kind === "coupons",
    svc = kind === "services";
  const [v, set] = useState(() =>
    record
      ? {
          ...record,
          enabled: Boolean(record.enabled),
          price: rupees(record.price),
          discount: rupees(record.discount),
          serviceIds: record.services?.map((x) => x.service_id) || [],
          amount:
            record.type === "fixed" ? rupees(record.amount) : record.amount,
          minimum: rupees(record.minimum),
          max_discount: rupees(record.max_discount),
        }
      : coupon
        ? couponDefault
        : productDefault,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const change = (k, value) => set((x) => ({ ...x, [k]: value }));
  const field = (name, k, opts = {}) => (
    <Field
      name={name}
      value={v[k]}
      onChange={(x) => change(k, x)}
      disabled={readonly}
      {...opts}
    />
  );
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (deleting) {
        await api(`/admin/${kind}/${record.id}`, undefined, "DELETE");
        done();
        return;
      }
      const data = coupon
        ? {
            code: v.code,
            type: v.type,
            amount: v.type === "fixed" ? money(v.amount) : Number(v.amount),
            expires: v.expires,
            minimum: money(v.minimum) ?? 0,
            max_discount: money(v.max_discount),
            usage_limit: v.usage_limit ? Number(v.usage_limit) : null,
            enabled: v.enabled,
          }
        : {
            name: v.name,
            description: v.description,
            image: v.image,
            price: money(v.price),
            discount: money(v.discount),
            sort: Number(v.sort),
            enabled: v.enabled,
            ...(svc
              ? {
                  duration: Number(v.duration),
                  category_id: Number(v.category_id),
                }
              : { serviceIds: v.serviceIds }),
          };
      await api(
        `/admin/${kind}${record ? "/" + record.id : ""}`,
        data,
        record ? "PUT" : "POST",
      );
      done();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-form" onSubmit={save} noValidate={deleting}>
      <div className="form-grid">
        {coupon ? (
          <>
            {field("Coupon code", "code", { required: true, maxLength: 32 })}
            <label>
              Discount type
              <select
                disabled={readonly}
                value={v.type}
                onChange={(e) => change("type", e.target.value)}
              >
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>
            {field(
              v.type === "fixed" ? "Amount (₹)" : "Discount (%)",
              "amount",
              {
                required: true,
                type: "number",
                min: v.type === "fixed" ? 0.01 : 1,
                step: v.type === "fixed" ? "0.01" : "1",
              },
            )}
            {field("Expiry date (optional)", "expires", { type: "date" })}
            {field("Minimum booking (₹)", "minimum", {
              type: "number",
              min: 0,
              step: "0.01",
            })}
            {field("Maximum discount (optional)", "max_discount", {
              type: "number",
              min: 0.01,
              step: "0.01",
            })}
            {field("Usage limit (optional)", "usage_limit", {
              type: "number",
              min: 1,
            })}
          </>
        ) : (
          <>
            {field("Name", "name", {
              required: true,
              className: "span-all",
              minLength: 2,
              maxLength: 100,
            })}
            <Area
              name="Description"
              value={v.description}
              onChange={(x) => change("description", x)}
              required
              rows={3}
              maxLength={1000}
              disabled={readonly}
            />
            <ImageField
              name="Catalog image"
              value={v.image}
              change={(x) => change("image", x)}
              disabled={readonly}
            />
            {field("Regular price (₹)", "price", {
              type: "number",
              required: true,
              min: 0.01,
              step: "0.01",
            })}
            {field("Discounted price (₹, optional)", "discount", {
              type: "number",
              min: 0.01,
              step: "0.01",
            })}
            {field("Display order", "sort", {
              type: "number",
              min: 0,
              max: 9999,
              required: true,
            })}
            {svc ? (
              <>
                {field("Duration (minutes)", "duration", {
                  type: "number",
                  min: 5,
                  max: 720,
                  required: true,
                })}
                <label className="span-all">
                  Category
                  <select
                    disabled={readonly}
                    value={v.category_id}
                    onChange={(e) => change("category_id", e.target.value)}
                  >
                    {cat.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <fieldset className="span-all check-list">
                <legend>Included services</legend>
                {cat.services.map((s) => (
                  <label key={s.id}>
                    <input
                      disabled={readonly}
                      type="checkbox"
                      checked={v.serviceIds.includes(s.id)}
                      onChange={() =>
                        change(
                          "serviceIds",
                          v.serviceIds.includes(s.id)
                            ? v.serviceIds.filter((i) => i !== s.id)
                            : [...v.serviceIds, s.id],
                        )
                      }
                    />
                    {s.name}
                    {!s.enabled && " (disabled)"}
                  </label>
                ))}
                {!cat.services.length && <p>Add services first.</p>}
              </fieldset>
            )}
          </>
        )}
        <label className="check-row span-all">
          <input
            type="checkbox"
            disabled={readonly}
            checked={v.enabled}
            onChange={(e) => change("enabled", e.target.checked)}
          />{" "}
          Enabled
        </label>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!readonly && (
        <div className="admin-form-actions">
          {deleting ? (
            <>
              <p>Delete this record? This cannot be undone.</p>
              <button
                type="button"
                className="btn outline"
                onClick={() => setDeleting(false)}
              >
                Keep record
              </button>
              <button className="btn danger" disabled={busy}>
                Confirm Delete
              </button>
            </>
          ) : (
            <>
              {record && (
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => setDeleting(true)}
                >
                  Delete
                </button>
              )}
              <button className="btn gold" disabled={busy}>
                {busy ? "Saving…" : "Save Changes"}
              </button>
            </>
          )}
        </div>
      )}
    </form>
  );
}
function Configuration({ kind, value, readonly, refresh }) {
  const availability = kind === "Availability";
  const [v, set] = useState(value),
    [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    [error, setError] = useState(""),
    [ok, setOk] = useState(""),
    [busy, setBusy] = useState(false);
  const change = (k, x) => {
    set((y) => ({ ...y, [k]: x }));
    setOk("");
  };
  const field = (name, k, opts = {}) => (
    <Field
      name={name}
      value={v[k]}
      onChange={(x) => change(k, x)}
      disabled={readonly}
      {...opts}
    />
  );
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      const data = availability
        ? { ...v, slot: Number(v.slot), capacity: Number(v.capacity) }
        : v;
      await api(`/admin/${kind.toLowerCase()}`, data, "PUT");
      setOk("Changes saved.");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function block(slot) {
    if (!date || (slot && !time)) {
      setError("Choose a date and, for a time block, a time.");
      return;
    }
    setError("");
    if (slot) {
      if (!v.blockedSlots.some((b) => b.date === date && b.time === time))
        change("blockedSlots", [...v.blockedSlots, { date, time }]);
    } else if (!v.blockedDates.includes(date))
      change("blockedDates", [...v.blockedDates, date]);
  }
  return (
    <form className="admin-panel config-form" onSubmit={save}>
      <h2>{availability ? "Appointment schedule" : "Customer website"}</h2>
      <div className="form-grid">
        {availability ? (
          <>
            {field("Opening time (IST)", "open", {
              type: "time",
              required: true,
            })}
            {field("Closing time (IST)", "close", {
              type: "time",
              required: true,
            })}
            {field("Slot interval (minutes)", "slot", {
              type: "number",
              required: true,
              min: 5,
              max: 120,
            })}
            {field("Concurrent appointments", "capacity", {
              type: "number",
              required: true,
              min: 1,
              max: 30,
            })}
            <fieldset className="span-all check-list">
              <legend>Weekly holidays</legend>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                <label key={d}>
                  <input
                    disabled={readonly}
                    type="checkbox"
                    checked={v.holidays.includes(i)}
                    onChange={() =>
                      change(
                        "holidays",
                        v.holidays.includes(i)
                          ? v.holidays.filter((x) => x !== i)
                          : [...v.holidays, i],
                      )
                    }
                  />
                  {d}
                </label>
              ))}
            </fieldset>
            <div className="span-all">
              <h3>Block appointments</h3>
              <p className="muted">
                This prevents new bookings. Existing appointments are not
                changed.
              </p>
              <div className="form-grid">
                <Field
                  name="Date to block"
                  type="date"
                  value={date}
                  onChange={setDate}
                  disabled={readonly}
                />
                <Field
                  name="Time to block (IST)"
                  type="time"
                  value={time}
                  onChange={setTime}
                  disabled={readonly}
                />
              </div>
              <div className="admin-form-actions">
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => block(false)}
                  disabled={readonly}
                >
                  Block full date
                </button>
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => block(true)}
                  disabled={readonly}
                >
                  Block time slot
                </button>
              </div>
              {[
                ...v.blockedDates.map((x) => ({ date: x })),
                ...v.blockedSlots,
              ].map((b) => (
                <div className="simple-line" key={`${b.date}:${b.time}`}>
                  <span>
                    {friendlyDate(b.date)} ·{" "}
                    {b.time ? friendlyTime(b.time) : "Full day"}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={readonly}
                    onClick={() =>
                      b.time
                        ? change(
                            "blockedSlots",
                            v.blockedSlots.filter(
                              (x) => x.date !== b.date || x.time !== b.time,
                            ),
                          )
                        : change(
                            "blockedDates",
                            v.blockedDates.filter((x) => x !== b.date),
                          )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {field("Salon name", "name", { required: true, maxLength: 80 })}
            {field("Contact number", "phone", { type: "tel" })}
            {field("WhatsApp number (with country code)", "whatsapp", {
              type: "tel",
            })}
            {field("Opening hours display text", "hours")}
            {field("Salon address", "address", { className: "span-all" })}
            {field("Google Maps link", "maps", {
              type: "url",
              className: "span-all",
            })}
            {field("Instagram URL", "instagram", { type: "url" })}
            {field("Facebook URL", "facebook", { type: "url" })}
            <Area
              name="Website description"
              value={v.description}
              onChange={(x) => change("description", x)}
              rows={3}
              maxLength={1000}
              disabled={readonly}
            />
            <ImageField
              name="Logo"
              value={v.logo}
              change={(x) => change("logo", x)}
              disabled={readonly}
            />
            <ImageField
              name="Homepage banner"
              value={v.banner}
              change={(x) => change("banner", x)}
              disabled={readonly}
            />
            <div className="span-all">
              <h3>Customer testimonials</h3>
              {(v.testimonials || []).map((t, i) => {
                const edit = (k, x) =>
                  change(
                    "testimonials",
                    v.testimonials.map((r, j) =>
                      j === i ? { ...r, [k]: x } : r,
                    ),
                  );
                return (
                  <div className="form-grid review-fields" key={i}>
                    <Field
                      name="Customer name"
                      value={t.name}
                      onChange={(x) => edit("name", x)}
                      required
                      disabled={readonly}
                    />
                    <Field
                      name="Rating"
                      type="number"
                      min={1}
                      max={5}
                      value={t.rating}
                      onChange={(x) => edit("rating", Number(x))}
                      required
                      disabled={readonly}
                    />
                    <Area
                      name="Testimonial"
                      value={t.quote}
                      onChange={(x) => edit("quote", x)}
                      rows={2}
                      required
                      disabled={readonly}
                    />
                    <button
                      className="text-button"
                      type="button"
                      disabled={readonly}
                      onClick={() =>
                        change(
                          "testimonials",
                          v.testimonials.filter((_, j) => i !== j),
                        )
                      }
                    >
                      Remove testimonial
                    </button>
                  </div>
                );
              })}
              <button
                className="btn outline"
                disabled={readonly || (v.testimonials?.length ?? 0) >= 12}
                type="button"
                onClick={() =>
                  change("testimonials", [
                    ...(v.testimonials || []),
                    { name: "", quote: "", rating: 5 },
                  ])
                }
              >
                <Plus size={15} /> Add testimonial
              </button>
            </div>
          </>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {ok && (
        <p className="success-text" role="status">
          {ok}
        </p>
      )}
      {!readonly && (
        <button className="btn gold" disabled={busy}>
          {busy ? "Saving…" : "Save Changes"}
        </button>
      )}
    </form>
  );
}
export default function Admin() {
  const [user, setUser] = useState(undefined),
    [tab, setTab] = useState("Overview"),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [dark, toggleTheme] = useTheme(),
    [menu, setMenu] = useState(false);
  const [editor, setEditor] = useState(null),
    [token, setToken] = useState(0),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [date, setDate] = useState(""),
    [page, setPage] = useState(1);
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ search, status, date }).filter(([, v]) => v),
    ),
  ).toString();
  const refresh = () => setToken((x) => x + 1);
  useEffect(() => {
    document.title = "Maison Noir · Salon Management";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.append(meta);
    api("/admin/session")
      .then(setUser)
      .catch(() => setUser(null));
    return () => meta.remove();
  }, []);
  useEffect(() => {
    if (!user) return;
    const c = new AbortController();
    const path =
      tab === "Overview"
        ? "stats"
        : tab === "Bookings"
          ? `bookings?${query}&page=${page}`
          : ["Services", "Packages", "Coupons"].includes(tab)
            ? "catalog"
            : tab.toLowerCase();
    const load = () =>
      api(`/admin/${path}`, undefined, "GET", c.signal)
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((e) => {
          if (e.status === 401) setUser(null);
          else if (e.name !== "AbortError") setError(e.message);
        });
    const debounce = setTimeout(load, tab === "Bookings" ? 180 : 0);
    const live = ["Overview", "Bookings"].includes(tab);
    const interval = live ? setInterval(load, 15_000) : null;
    const events = live ? new EventSource("/api/admin/events") : null;
    events?.addEventListener("booking", load);
    return () => {
      c.abort();
      clearTimeout(debounce);
      clearInterval(interval);
      events?.close();
    };
  }, [tab, user, token, query, page]);
  function navigate(t) {
    if (t !== tab) {
      setData(null);
      setError("");
      setTab(t);
    }
    setMenu(false);
  }
  async function logout() {
    try {
      await api("/admin/logout", {}, "POST");
      setUser(null);
      setTab("Overview");
      setData(null);
    } catch (e) {
      if (e.status === 401) setUser(null);
      else setError(e.message);
    }
  }
  async function editBooking(row) {
    try {
      setEditor({
        kind: "booking",
        record: await api(`/admin/bookings/${row.id}`),
      });
    } catch (e) {
      setError(e.message);
    }
  }
  if (user === undefined)
    return (
      <div className="center-load">
        <Busy />
      </div>
    );
  if (!user)
    return <AdminLogin onLogin={setUser} dark={dark} toggle={toggleTheme} />;
  const readonly = user.role !== "admin",
    catalogTab = ["Services", "Packages", "Coupons"].includes(tab),
    singular = { Services: "service", Packages: "package", Coupons: "coupon" }[
      tab
    ];
  const done = () => {
    setEditor(null);
    refresh();
  };
  return (
    <div className="admin-shell">
      <aside className={menu ? "admin-sidebar open" : "admin-sidebar"}>
        <Brand suffix="MANAGEMENT" href="/admin" />
        <nav aria-label="Admin sections">
          {tabs.map(([t, Icon]) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => navigate(t)}
            >
              <Icon size={18} />
              {t}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/">
            <ArrowUpRight size={17} /> Customer website
          </a>
          <button onClick={logout}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <button
            className="icon-button admin-menu"
            onClick={() => setMenu((m) => !m)}
            aria-label="Toggle admin navigation"
          >
            <Menu />
          </button>
          <div>
            <p>SALON MANAGEMENT</p>
            <h1>{tab}</h1>
          </div>
          <div>
            <span>
              {user.email}
              {readonly && " · Read only"}
            </span>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>
        <div className="admin-content">
          <ErrorBox>{error}</ErrorBox>
          {tab === "Bookings" && (
            <div className="admin-filters">
              <Field
                name="Search bookings"
                value={search}
                onChange={(v) => {
                  setPage(1);
                  setSearch(v);
                }}
                placeholder="Name, mobile number or booking ID"
              />
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setPage(1);
                    setStatus(e.target.value);
                  }}
                >
                  <option value="">All statuses</option>
                  {statusOptions.map((x) => (
                    <option key={x} value={x}>
                      {label(x)}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="Date"
                type="date"
                value={date}
                onChange={(v) => {
                  setPage(1);
                  setDate(v);
                }}
              />
              <a
                className="btn outline"
                href={`/api/admin/bookings.csv?${query}`}
              >
                <ArrowDownToLine size={17} /> Export CSV
              </a>
            </div>
          )}
          {!data ? (
            !error && <Busy />
          ) : tab === "Overview" ? (
            <>
              <div className="admin-kicker">
                <p className="muted">
                  Current performance and appointment activity.
                </p>
                <button className="btn outline" onClick={refresh}>
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>
              <Analytics stats={data} />
            </>
          ) : tab === "Bookings" ? (
            <div className="admin-panel table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Booking",
                      "Customer",
                      "Services",
                      "Appointment (IST)",
                      "Status",
                      "Payment",
                      "Total",
                      "",
                    ].map((s, i) => (
                      <th key={i}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(data) &&
                    data.slice(0, 50).map((b) => (
                      <tr key={b.id}>
                        <td>
                          <b>{b.id}</b>
                        </td>
                        <td>
                          {b.name}
                          <small>{b.mobile}</small>
                        </td>
                        <td>{b.services}</td>
                        <td>
                          {friendlyDate(b.date)}
                          <small>{friendlyTime(b.time)}</small>
                        </td>
                        <td>
                          <span className={`status-chip ${b.status}`}>
                            {label(b.status)}
                          </span>
                        </td>
                        <td>
                          {label(b.method)}
                          <small>{label(b.payment_status)}</small>
                        </td>
                        <td>{cash(b.total)}</td>
                        <td>
                          <button
                            className="btn outline compact"
                            onClick={() => editBooking(b)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!data.length && (
                <p className="empty-state">No bookings match these filters.</p>
              )}
              {(page > 1 || data.length > 50) && (
                <div className="table-pages">
                  <button
                    className="btn outline compact"
                    disabled={page === 1}
                    onClick={() => {
                      setData(null);
                      setPage((p) => p - 1);
                    }}
                  >
                    Previous
                  </button>
                  <span>Page {page}</span>
                  <button
                    className="btn outline compact"
                    disabled={data.length <= 50}
                    onClick={() => {
                      setData(null);
                      setPage((p) => p + 1);
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          ) : catalogTab ? (
            <>
              <div className="admin-kicker">
                <p className="muted">
                  Manage {tab.toLowerCase()} for the customer website.
                </p>
                {!readonly && (
                  <button
                    className="btn gold"
                    onClick={() =>
                      setEditor({ kind: tab.toLowerCase(), record: null })
                    }
                  >
                    <Plus size={17} /> Add {singular}
                  </button>
                )}
              </div>
              <div className="admin-panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{tab === "Coupons" ? "Code" : "Name"}</th>
                      <th>{tab === "Coupons" ? "Discount" : "Price"}</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data[tab.toLowerCase()] || []).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="catalog-row">
                            {r.image && <img src={r.image} alt="" />}
                            <div>
                              <b>{r.name || r.code}</b>
                              <small>
                                {r.category ||
                                  r.services?.map((s) => s.name).join(", ") ||
                                  r.expires}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {tab === "Coupons"
                            ? r.type === "percent"
                              ? `${r.amount}%`
                              : cash(r.amount)
                            : cash(r.discount ?? r.price)}
                        </td>
                        <td>
                          <span className="status-chip">
                            {r.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn outline compact"
                            onClick={() =>
                              setEditor({ kind: tab.toLowerCase(), record: r })
                            }
                          >
                            {readonly ? "View" : "Edit"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data[tab.toLowerCase()]?.length && (
                  <p className="empty-state">No {tab.toLowerCase()} yet.</p>
                )}
              </div>
            </>
          ) : (
            <Configuration
              key={tab}
              kind={tab}
              value={data}
              readonly={readonly}
              refresh={refresh}
            />
          )}
        </div>
      </main>
      {editor && (
        <Modal
          title={
            editor.kind === "booking"
              ? editor.record.id
              : `${editor.record ? "Manage" : "Add"} ${singular}`
          }
          close={() => setEditor(null)}
        >
          {editor.kind === "booking" ? (
            <BookingEditor
              record={editor.record}
              readonly={readonly}
              done={done}
            />
          ) : (
            <CatalogEditor
              kind={editor.kind}
              record={editor.record}
              cat={data}
              readonly={readonly}
              done={done}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
