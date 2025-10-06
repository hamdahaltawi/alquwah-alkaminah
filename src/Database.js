// src/Database.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dsotsmmdstwdwlkqxnws.supabase.co";

const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzb3RzbW1kc3R3ZHdsa3F4bndzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1Nzk3MzMsImV4cCI6MjA3NDE1NTczM30.yp_euT57Y75o20OFJ6o3NOOwGmZQ-D42r-WEIccr9Ic";

/* ====== Client واحد لكل المشروع ====== */
// منع تكرار العملاء حتى مع hot-reload
if (!globalThis.__SB_CLIENT__) {
  globalThis.__SB_CLIENT__ = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "garage_auth_v1",
    },
  });
}
export const supabase = globalThis.__SB_CLIENT__;

const DEFAULT_TAX_RATE = 0.15;
/* ====== Helpers ====== */
const money = (n) => Number(n || 0);

/* ====== API ====== */
export async function fetchWorkers() {
  const { data, error } = await supabase
    .from("workers")
    .select("id,name,phone,position,active,badgeNumber,password")
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchRecentTickets({
  workerId,
  from,
  to,
  limit = 100,
} = {}) {
  let q = supabase
    .from("tickets")
    .select(
      `
      id, created_at, worker_id, title, "Service", work_notes, status,
      price, discount, tax, payment_method,
      car_info, plate_number, plate_letters_ar,
      country, make, model, year, color,
      customer_name, customer_phone
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  // طبّق حدود التاريخ بشكل ذكي:
  // - لو جاني YYYY-MM-DD: وسّعه لبداية/نهاية اليوم
  // - لو جاني ISO مع Z: احذف Z وخلّي " " بدل T
  if (from) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(from))) {
      const { fromSQL } = dayBoundsSQL(from);
      q = q.gte("created_at", fromSQL);
    } else {
      q = q.gte("created_at", toSqlTs(from));
    }
  }
  if (to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) {
      const { toSQL } = dayBoundsSQL(to);
      q = q.lte("created_at", toSQL);
    } else {
      q = q.lte("created_at", toSqlTs(to));
    }
  }

  if (workerId) q = q.eq("worker_id", workerId);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function updateTicketStatus(id, status) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
// ملخص الفترة (إيراد / عدد / متوسط زمن)
export async function fetchSummary({ from, to, workerId }) {
  let q = supabase
    .from("tickets")
    .select("id, price, discount, status, created_at, updated_at, worker_id");

  if (from) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(from))) {
      const { fromSQL } = dayBoundsSQL(from);
      q = q.gte("created_at", fromSQL);
    } else {
      q = q.gte("created_at", toSqlTs(from));
    }
  }
  if (to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) {
      const { toSQL } = dayBoundsSQL(to);
      q = q.lte("created_at", toSQL);
    } else {
      q = q.lte("created_at", toSqlTs(to));
    }
  }
  if (workerId) q = q.eq("worker_id", workerId);

  const { data, error } = await q;
  if (error) throw error;

  const tickets = data || [];
  const revenue = tickets.reduce(
    (a, t) => a + (Number(t.price || 0) - Number(t.discount || 0)),
    0
  );
  const ticketsCount = tickets.length;
  const waitingParts = tickets.filter(
    (t) => t.status === "WAITING_PARTS"
  ).length;

  const diffs = tickets
    .map((t) => {
      const c = new Date(t.created_at).getTime();
      const u = new Date(t.updated_at || t.created_at).getTime();
      return (u - c) / 36e5;
    })
    .filter((x) => x >= 0);

  const avg_cycle_time_hours = diffs.length
    ? diffs.reduce((a, b) => a + b, 0) / diffs.length
    : null;

  return {
    revenue,
    tickets: ticketsCount,
    waiting_parts: waitingParts,
    avg_cycle_time_hours,
  };
}

// 5) إيراد حسب الموظف خلال الفترة
export async function fetchRevByWorker({ from, to }) {
  let q = supabase
    .from("tickets")
    .select(
      "id, price, discount, worker_id, workers:worker_id ( name ), created_at"
    );

  if (from) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(from))) {
      const { fromSQL } = dayBoundsSQL(from);
      q = q.gte("created_at", fromSQL);
    } else {
      q = q.gte("created_at", toSqlTs(from));
    }
  }
  if (to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) {
      const { toSQL } = dayBoundsSQL(to);
      q = q.lte("created_at", toSQL);
    } else {
      q = q.lte("created_at", toSqlTs(to));
    }
  }

  const { data, error } = await q;
  if (error) throw error;

  const tickets = data || [];
  const map = new Map();

  tickets.forEach((t) => {
    const id = t.worker_id || "unknown";
    const name = t.workers?.name || `#${id}`;
    const val = Number(t.price || 0) - Number(t.discount || 0);
    const prev = map.get(id) || {
      worker_id: id,
      worker_name: name,
      revenue: 0,
    };
    prev.revenue += val;
    map.set(id, prev);
  });

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

// ===== Workers CRUD =====
export async function listWorkers() {
  const { data, error } = await supabase
    .from("workers")
    .select("id,name,phone,position,active,badgeNumber,password")
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createWorker({
  name,
  phone,
  position,
  badgeNumber,
  password,
  active = true,
}) {
  const { data, error } = await supabase
    .from("workers")
    .insert([{ name, phone, position, badgeNumber, password, active }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorker(id, patch) {
  const { data, error } = await supabase
    .from("workers")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleWorkerActive(id, active) {
  return updateWorker(id, { active });
}

export async function deleteWorker(id) {
  const { error } = await supabase.from("workers").delete().eq("id", id);
  if (error) throw error;
  return true;
}
export async function fetchTaxRate() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "tax_rate")
      .single();
    const n = Number(data?.value);
    return Number.isFinite(n) ? n : DEFAULT_TAX_RATE;
  } catch {
    return DEFAULT_TAX_RATE;
  }
}
function getCurrentQuarterRange() {
  const now = new Date();
  const m = now.getMonth();
  const qStart = m - (m % 3);
  const start = new Date(now.getFullYear(), qStart, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(start.getMonth() + 3);
  return { start, end };
}

async function getActive3MRange() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "active_tax_start")
      .single();

    if (!data?.value) return getCurrentQuarterRange();

    const start = new Date(data.value);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(start.getMonth() + 3);
    return { start, end };
  } catch {
    return getCurrentQuarterRange();
  }
}

function addMonths(d, m) {
  const nd = new Date(d);
  const day = nd.getDate();
  nd.setMonth(nd.getMonth() + m);
  if (nd.getDate() < day) nd.setDate(0);
  return nd;
}

export async function fetchTaxTotalForActive3MPeriod() {
  const { start, end } = await getActive3MRange();

  // نجلب فقط الأعمدة اللي نحتاجها ونجمّع في الجافاسكربت
  const { data, error } = await supabase
    .from("tickets")
    .select("tax, created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) {
    return { tax_total: 0, days_left: 0, error: error.message };
  }

  const rows = Array.isArray(data) ? data : [];
  // تجاهل NULL و NaN
  const tax_total = rows.reduce((sum, r) => {
    const v = Number(r?.tax);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  // الأيام المتبقية لنهاية الـ 3 شهور
  const now = new Date();
  const msLeft = Math.max(0, new Date(end) - now);
  const days_left = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  return { tax_total, days_left };
}

// زر “ابدأ اليوم”
export async function initTaxPeriodStartToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    await supabase
      .from("app_settings")
      .upsert([{ key: "active_tax_start", value: today.toISOString() }], {
        onConflict: "key",
      });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

//###############

function isNetworkPay(v) {
  return String(v || "").trim() === "شبكة";
}

export async function getWorkerNameById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("workers")
    .select("name")
    .eq("id", id)
    .single();
  if (error) return null;
  return data?.name || null;
}
// يحوّل أي تاريخ يجي (YYYY-MM-DD | ISO مع Z) لسلسلة SQL بدون Z
function toSqlTs(v) {
  if (!v) return undefined;
  let s = String(v).trim();
  // YYYY-MM-DD فقط → حوّله لبداية/نهاية اليوم حسب الاستخدام
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // نرجع اليوم فقط، والدوال تحت تضيف الوقت
  // ISO → اشِل الــ Z وخلّي الفراغ بدل T
  s = s.replace("T", " ").replace("Z", "");
  // قص على 23 حرف لو طويلة
  return s.length > 23 ? s.slice(0, 23) : s;
}

// يبني حدود اليوم كاملة من قيمة YYYY-MM-DD
function dayBoundsSQL(dStr) {
  if (!dStr) return {};
  const d = String(dStr).slice(0, 10); // YYYY-MM-DD
  return {
    fromSQL: `${d} 00:00:00`,
    toSQL: `${d} 23:59:59.999`,
  };
}
// يُعيد كل الموظفين (نشطين وموقّفين) مرتّبين بالاسم
export async function fetchAllWorkers() {
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, phone, position, active, badgeNumber")
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}
