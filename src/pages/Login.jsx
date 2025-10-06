// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../Database.js";

function normalizePhone(v) {
  let s = String(v || "").trim();
  if (s.startsWith("+966")) s = "0" + s.slice(4); // +9665xxxx -> 05xxxx
  s = s.replace(/[\s-]+/g, ""); // احذف فواصل
  s = s.replace(/\D/g, "").slice(0, 10); // اجعلها 10 أرقام
  return s;
}

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const raw = identifier.trim();
      const isNumericOnly = /^\d+$/.test(raw);

      let phone = null;
      let badge = null;

      if (/^(05|\+9665)/.test(raw)) {
        phone = normalizePhone(raw);
      } else if (isNumericOnly) {
        badge = Number(raw);
      } else {
        phone = normalizePhone(raw);
      }

      let query = supabase
        .from("workers")
        .select("id,name,phone,position,badgeNumber,password,active")
        .limit(1);

      if (phone && badge != null) {
        query = query.or(`phone.eq.${phone},badgeNumber.eq.${badge}`);
      } else if (phone) {
        query = query.eq("phone", phone);
      } else if (badge != null) {
        query = query.eq("badgeNumber", badge);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;

      if (!data) {
        setError("المستخدم غير موجود");
        return;
      }

      if ((data.password || "") !== password) {
        setError("كلمة المرور غير صحيحة");
        return;
      }
      if (!data.active) {
        setError("حسابك غير مُفعل. يرجى التواصل مع الإدارة.");
        return;
      }

      // ===== جلسة/هوية (خزّن كسلاسل لضمان UUID/النص) =====
      localStorage.setItem("user_id", String(data.id));
      localStorage.setItem("worker_id", String(data.id)); // مهم
      localStorage.setItem("user_name", String(data.name || ""));
      localStorage.setItem("phone", String(data.phone || ""));
      localStorage.setItem("badgeNumber", String(data.badgeNumber ?? ""));

      // الدور (يشمل Admin)
      const pos = String(data.position || "").toLowerCase();
      const isManager =
        Number(data.badgeNumber) === 1 || pos === "manager" || pos === "admin";

      localStorage.setItem("role", isManager ? "manager" : "employee");

      // تأكيد فوري أن التخزين تم
      if (!localStorage.getItem("worker_id")) {
        throw new Error("تعذّر حفظ هوية المستخدم (worker_id).");
      }

      // حدث تغيّر جلسة
      window.dispatchEvent(new Event("authchange"));

      // توجيه
      navigate(isManager ? "/manager" : "/employee", { replace: true });
    } catch (e) {
      setError(e.message || "حدث خطأ أثناء تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page auth-card">
      <h1>تسجيل الدخول</h1>
      {error && <div className="alert danger mb16">{error}</div>}

      <form onSubmit={handleSubmit} className="grid" style={{ gap: 12 }}>
        <label>
          رقم الجوال أو البادج نمبر
          <input
            type="text"
            placeholder="05xxxxxxxx أو Badge#"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </label>

        <label>
          كلمة المرور
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <div className="auth-actions">
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "جاري..." : "دخول"}
          </button>
          <a className="btn ghost" href="/">
            العودة للصفحة الرئيسية
          </a>
        </div>
      </form>
    </div>
  );
}
