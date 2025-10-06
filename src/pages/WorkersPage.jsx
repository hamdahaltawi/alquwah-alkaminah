// src/pages/WorkersPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  supabase,
  fetchWorkers,
  fetchRecentTickets,
  getWorkerNameById,
} from "../Database.js";
import { printDoc, printTicketSmart } from "../Invoices"; // استخدام دالة الطباعة المشتركة

/* ===================== الصفحة ===================== */
const ROLE_OPTIONS = ["Worker", "Manager", "Admin"];

// إجمالي بعد الخصم (يدعم price أو bill)
const totalAfterDiscount = (t) =>
  Math.max(Number(t.price ?? t.bill ?? 0) - Number(t.discount ?? 0), 0);

export default function WorkersPage() {
  // أعلى المكوّن

  const [viewMode, setViewMode] = useState("add"); // 'add' | 'list' | 'invoice'

  // بيانات عامة
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // فورم الإضافة
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(ROLE_OPTIONS[0]);
  const [badge, setBadge] = useState("");
  const [password, setPassword] = useState("");

  // فلاتر القائمة
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // تحرير (مودال)
  const [editing, setEditing] = useState(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eRole, setERole] = useState(ROLE_OPTIONS[0]);
  const [eBadge, setEBadge] = useState("");

  // طباعة فاتورة
  const todayISO = new Date().toISOString().slice(0, 10);
  const [invFrom, setInvFrom] = useState(todayISO);
  const [invTo, setInvTo] = useState(todayISO);
  const [invLoading, setInvLoading] = useState(false);
  const [invTickets, setInvTickets] = useState([]);

  // فلتر الفترة لتبويب الطباعة
  const [preset, setPreset] = useState("last_30");
  const fmtYMD = (d) => {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const da = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  };
  const rangeFromPreset = (p) => {
    const today = new Date();
    let start, end;
    switch (p) {
      case "this_month":
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;
      case "last_30":
        start = new Date(today);
        start.setDate(start.getDate() - 29);
        end = today;
        break;
      case "this_quarter": {
        const q = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), q * 3, 1);
        end = today;
        break;
      }
      case "this_year":
        start = new Date(today.getFullYear(), 0, 1);
        end = today;
        break;
      default:
        return null;
    }
    return { from: fmtYMD(start), to: fmtYMD(end) };
  };
  const applyPreset = (val) => {
    setPreset(val);
    const r = rangeFromPreset(val);
    if (!r) return;
    setInvFrom(r.from);
    setInvTo(r.to);
  };
  useEffect(() => {
    applyPreset("last_30");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // كل الأرقام إنجليزي
  const currency = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "SAR",
    }).format(Number(n || 0));

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const list = await fetchWorkers();
      setWorkers(list || []);
    } catch (e) {
      setMsg(e.message || "تعذر جلب الموظفين");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // إضافة
  // === عدّل دالتك هكذا ===
  async function onAddWorker(e) {
    e.preventDefault();
    setMsg("");
    if (!name || !phone) return setMsg("يرجى تعبئة: الاسم + الجوال.");

    try {
      setLoading(true);

      const pwd = password || null;

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        position: role || ROLE_OPTIONS[0],
        badgeNumber: badge ? Number(badge) : null,
        active: true,
        password: pwd,
      };

      const { data, error } = await supabase
        .from("workers")
        .insert([payload])
        .select()
        .single();
      if (error) throw error;

      setWorkers((prev) => [data, ...(prev || [])]);

      setName("");
      setPhone("");
      setRole(ROLE_OPTIONS[0]);
      setBadge("");
      setPassword("");

      setMsg("✅ تم إضافة الموظف بنجاح");
      setViewMode("list");
    } catch (e) {
      setMsg(e.message || "تعذر إضافة الموظف");
    } finally {
      setLoading(false);
    }
  }

  // تفعيل/إيقاف
  async function onToggleActive(id, current) {
    try {
      setMsg("");
      const { data } = await supabase
        .from("workers")
        .update({ active: !current })
        .eq("id", id)
        .select()
        .single();

      setWorkers((prev) =>
        (prev || []).map((w) =>
          w.id === id ? { ...w, active: data.active } : w
        )
      );
    } catch (e) {
      setMsg(e.message || "تعذر تعديل الحالة");
    }
  }

  // حذف
  async function onDelete(id) {
    if (!window.confirm("هل أنت متأكد من الحذف؟")) return;
    try {
      setMsg("");
      const { error } = await supabase.from("workers").delete().eq("id", id);
      if (error) throw error;
      setWorkers((prev) => (prev || []).filter((w) => w.id !== id));
    } catch (e) {
      setMsg(e.message || "تعذر حذف الموظف");
    }
  }

  // تحرير
  function openEdit(w) {
    setEditing(w);
    setEName(w.name || "");
    setEPhone(w.phone || "");
    setERole(w.position || ROLE_OPTIONS[0]);
    setEBadge(w.badgeNumber ?? "");
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("workers")
        .update({
          name: eName.trim(),
          phone: ePhone.trim(),
          position: eRole,
          badgeNumber: eBadge ? Number(eBadge) : null,
        })
        .eq("id", editing.id)
        .select()
        .single();
      if (error) throw error;
      setWorkers((prev) =>
        (prev || []).map((w) => (w.id === editing.id ? { ...w, ...data } : w))
      );
      setEditing(null);
      setMsg("✅ تم حفظ التعديلات");
    } catch (err) {
      setMsg(err.message || "تعذر حفظ التعديلات");
    } finally {
      setLoading(false);
    }
  }

  // فلترة القائمة
  const filtered = useMemo(() => {
    return (workers || []).filter((w) => {
      if (roleFilter && String(w.position || "") !== roleFilter) return false;
      if (statusFilter) {
        const active = !!w.active;
        if (statusFilter === "active" && !active) return false;
        if (statusFilter === "inactive" && active) return false;
      }
      if (q) {
        const needle = q.trim().toLowerCase();
        const hay = `${w.name || ""} ${w.phone || ""} ${w.position || ""} ${
          w.badgeNumber || ""
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [workers, q, roleFilter, statusFilter]);

  // تنسيق وقت للتابل (إنجليزي)
  const fmtDateTime = (d) =>
    new Date(d).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  // خريطة worker_id -> name لاستخدامها في جدول الفواتير
  const workerNameByBadge = useMemo(() => {
    const map = {};
    (workers || []).forEach((w) => {
      if (w.badgeNumber != null) map[w.badgeNumber] = w.name;
    });
    return map;
  }, [workers]);

  const getWorkerName = (t) =>
    t?.worker_name ||
    t?.worker?.name ||
    (t?.worker_id != null ? workerNameByBadge[t.worker_id] : "") ||
    "—";

  // البحث عن فواتير/تذاكر للطباعة
  async function searchInvoices() {
    setInvLoading(true);
    setMsg("");
    const fromISO = invFrom ? `${invFrom}T00:00:00.000Z` : undefined;
    const toISO = invTo ? `${invTo}T23:59:59.999Z` : undefined;
    try {
      const list = await fetchRecentTickets({
        from: fromISO,
        to: toISO,
        limit: 200,
      });
      const sorted = (list || [])
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setInvTickets(sorted);
    } catch (e) {
      setMsg(e.message || "تعذر جلب الفواتير/التذاكر");
    } finally {
      setInvLoading(false);
    }
  }
  // helper يضمن أرقام ASCII ويقصّها لـ 10 ويحوّل +966 -> 05
  function normalizeSaudiMobile(v) {
    let s = String(v || "").trim();
    if (s.startsWith("+966")) s = "0" + s.slice(4);
    s = s.replace(/[^\d]/g, ""); // ASCII digits only
    if (s.length > 10) s = s.slice(0, 10);
    return s;
  }
  function isValidSaudiMobile(v) {
    return /^05[0-9]{8}$/.test(normalizeSaudiMobile(v));
  }

  return (
    <div className="page employee" dir="rtl">
      {/* رأس الصفحة */}
      <div className="emp-head">
        <div>
          <h2 className="emp-title">إدارة العمليات</h2>
        </div>
      </div>

      {/* شريط الإجراءات الجديد (بطاقات) */}
      <div className="card pro p16 mb16">
        <ActionPicker viewMode={viewMode} setViewMode={setViewMode} />
        {msg && (
          <div
            className={`alert ${
              msg.startsWith("✅") ? "success" : "warning"
            } mt16`}
          >
            {msg}
          </div>
        )}
      </div>

      {/* ===== إضافة موظف ===== */}
      {viewMode === "add" && (
        <div className="card pro">
          <h3 className="m0 mb16">إضافة موظف</h3>
          <form onSubmit={onAddWorker} className="grid" style={{ gap: 12 }}>
            <div className="form-row">
              <label>
                الاسم *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label>
                الجوال *
                <input
                  className="ltr"
                  placeholder="05xxxxxxxx"
                  value={phone}
                  onChange={(e) =>
                    setPhone(normalizeSaudiMobile(e.target.value))
                  }
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  pattern="^05[0-9]{8}$"
                  title="أدخل رقم سعودي يبدأ بـ 05 ومكوّن من 10 أرقام"
                  onInvalid={(e) =>
                    e.currentTarget.setCustomValidity(
                      "أدخل رقم سعودي يبدأ بـ 05 ومكوّن من 10 أرقام"
                    )
                  }
                  onInput={(e) => e.currentTarget.setCustomValidity("")}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                المنصب *
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Badge Number *
                <input
                  className="ltr"
                  type="number"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              كلمة المرور (للتجربة)
              <input
                type="password"
                className="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <div className="row" style={{ gap: 10 }}>
              <button
                className="btn btn-lg btn-primary"
                type="submit"
                disabled={loading}
              >
                {loading ? "جاري..." : "إضافة"}
              </button>

              <button
                type="button"
                className="btn btn-lg btn-secondary push-left"
                onClick={() => {
                  setName("");
                  setPhone("");
                  setRole(ROLE_OPTIONS[0]);
                  setBadge("");
                  setPassword("");
                }}
              >
                تفريغ الحقول
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== عرض الموظفين ===== */}
      {viewMode === "list" && (
        <div className="card pro">
          <h3 className="m0 mb16">الموظفون</h3>

          <div className="toolbar mb16">
            <div className="filters-row">
              <label>
                بحث (اسم/جوال/Badge)
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث..."
                />
              </label>

              <label>
                المنصب
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">الكل</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                حالة عمل الموظف
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">الكل</option>
                  <option value="active">نشط</option>
                  <option value="inactive">موقّف</option>
                </select>
              </label>

              <button
                className="btn btn-blue"
                onClick={load}
                disabled={loading}
              >
                بحث
              </button>
            </div>
          </div>

          <div className="table-card">
            <div className="card-header">
              <span className="muted">{filtered.length} عنصر</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="col-id">ID</th>
                    <th className="col-name">الاسم</th>
                    <th className="col-phone">الجوال</th>
                    <th className="col-role">المنصب</th>
                    <th className="col-badge">Badge</th>
                    <th className="col-status">الحالة</th>
                    <th className="col-actions">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {(filtered || []).length === 0 ? (
                    <tr>
                      <td colSpan={7}>لا توجد بيانات.</td>
                    </tr>
                  ) : (
                    filtered.map((w) => (
                      <tr key={w.id}>
                        <td className="col-id ltr nowrap">
                          {w.id?.toString().slice(0, 8)}
                        </td>
                        <td className="col-name">{w.name || "—"}</td>
                        <td className="col-phone ltr nowrap">
                          {w.phone || "—"}
                        </td>
                        <td className="col-role">{w.position || "—"}</td>
                        <td className="col-badge num">
                          {w.badgeNumber ?? "—"}
                        </td>
                        <td className="col-status">
                          <span
                            className={`badge ${
                              w.active ? "ready" : "cancelled"
                            }`}
                          >
                            {w.active ? "نشط" : "موقّف"}
                          </span>
                        </td>
                        <td className="col-actions">
                          <div
                            className="row"
                            style={{ gap: 8, justifyContent: "center" }}
                          >
                            <button
                              className="btn ghost"
                              onClick={() => openEdit(w)}
                            >
                              تعديل
                            </button>
                            <button
                              className="btn secondary"
                              onClick={() => onToggleActive(w.id, !!w.active)}
                            >
                              {w.active ? "إيقاف" : "تفعيل"}
                            </button>

                            <button
                              className="btn danger"
                              onClick={() => onDelete(w.id)}
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== طباعة فاتورة ===== */}
      {viewMode === "invoice" && (
        <div className="card pro">
          <h3 className="m0 mb16">طباعة فاتورة</h3>

          <div className="toolbar mb16">
            <div className="toolbar-row">
              <label>
                من
                <input
                  type="date"
                  className="ltr"
                  value={invFrom}
                  onChange={(e) => setInvFrom(e.target.value)}
                />
              </label>
              <label>
                إلى
                <input
                  type="date"
                  className="ltr"
                  value={invTo}
                  onChange={(e) => setInvTo(e.target.value)}
                />
              </label>

              <label>
                الفترة
                <select
                  className="ltr"
                  value={preset}
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  <option value="this_month">هذا الشهر</option>
                  <option value="last_30">آخر 30 يوم</option>
                  <option value="this_quarter">هذا الربع</option>
                  <option value="this_year">هذه السنة</option>
                </select>
              </label>

              <div className="toolbar-actions">
                <button
                  className="btn btn-blue "
                  onClick={searchInvoices}
                  disabled={invLoading}
                >
                  {invLoading ? "جاري..." : "بحث"}
                </button>
              </div>
            </div>
          </div>

          <div className="table-card">
            <div className="card-header">
              <span className="muted">{invTickets.length} نتيجة</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>ID</th>
                    <th>التاريخ</th>
                    <th>العميل</th>
                    <th style={{ width: 180 }}>الموظف</th>
                    {/* جديد */}
                    <th>العنوان</th>
                    <th style={{ width: 140 }}>الإجمالي</th>
                    <th style={{ width: 160 }}>طباعة</th>
                  </tr>
                </thead>
                <tbody>
                  {invLoading ? (
                    <tr>
                      <td colSpan={7}>جاري التحميل…</td>
                    </tr>
                  ) : invTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7}>لا توجد نتائج.</td>
                    </tr>
                  ) : (
                    invTickets.map((t) => {
                      const total = totalAfterDiscount(t);
                      return (
                        <tr key={t.id}>
                          <td className="ltr nowrap">
                            {t.id?.toString().slice(0, 8)}
                          </td>
                          <td className="nowrap">
                            {fmtDateTime(t.created_at)}
                          </td>
                          <td>
                            <div className="col">
                              <strong>{t.customer_name || "—"}</strong>
                              <span className="muted ltr">
                                {t.customer_phone || ""}
                              </span>
                            </div>
                          </td>
                          <td>{getWorkerName(t)}</td> {/* جديد */}
                          <td className="clip title-cell">{t.title || "—"}</td>
                          <td className="num nowrap">{currency(total)}</td>
                          <td>
                            <div className="row" style={{ gap: 8 }}>
                              <button
                                className="btn"
                                onClick={() =>
                                  printTicketSmart
                                    ? printTicketSmart(t)
                                    : printDoc(t, "ticket")
                                }
                              >
                                طباعة
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* مودال تعديل */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="m0 mb16">تعديل موظف</h3>
            <form onSubmit={saveEdit} className="grid" style={{ gap: 12 }}>
              <div className="form-row">
                <label>
                  الاسم
                  <input
                    value={eName}
                    onChange={(e) => setEName(e.target.value)}
                  />
                </label>
                <label>
                  الجوال
                  <input
                    className="ltr"
                    value={ePhone}
                    onChange={(e) => setEPhone(e.target.value)}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  المنصب
                  <select
                    value={eRole}
                    onChange={(e) => setERole(e.target.value)}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Badge
                  <input
                    className="ltr"
                    type="number"
                    value={eBadge}
                    onChange={(e) => setEBadge(e.target.value)}
                  />
                </label>
              </div>

              <div className="row" style={{ gap: 10 }}>
                <button className="btn" type="submit" disabled={loading}>
                  {loading ? "جاري..." : "حفظ"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setEditing(null)}
                >
                  إغلاق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ مكوّن شريط الإجراءات (بطاقات) ============ */
function ActionPicker({ viewMode, setViewMode }) {
  const ACTIONS = [
    {
      key: "add",
      icon: "➕",
      title: "إضافة موظف",
      desc: "تسجيل موظف جديد ببياناته",
    },
    {
      key: "list",
      icon: "👥",
      title: "عرض الموظفين",
      desc: "تصفية وتحرير حالات الموظفين",
    },
    {
      key: "invoice",
      icon: "🧾",
      title: "طباعة فاتورة",
      desc: "بحث وطباعة فواتير/تذاكر حسب الفترة",
    },
  ];

  return (
    <div className="action-grid" role="tablist" aria-label="إجراءات الإدارة">
      {ACTIONS.map((a) => {
        const active = viewMode === a.key;
        return (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`action-tile ${active ? "active" : ""}`}
            onClick={() => setViewMode(a.key)}
          >
            <span className="action-icon" aria-hidden="true">
              {a.icon}
            </span>

            <span className="action-texts">
              <span className="action-title">{a.title}</span>
              <span className="action-desc">{a.desc}</span>
            </span>

            <span className="action-badge">{active ? "المحدد" : "اختيار"}</span>
          </button>
        );
      })}
    </div>
  );
}
