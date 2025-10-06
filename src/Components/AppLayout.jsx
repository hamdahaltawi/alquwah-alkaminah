// src/Components/AppLayout.jsx
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";

export default function AppLayout() {
  const year = new Date().getFullYear();
  const { pathname } = useLocation();

  // normalize path: lower-case + remove trailing slashes
  const p =
    (pathname || "/")
      .split("?")[0]
      .split("#")[0]
      .replace(/\/+$/, "")
      .toLowerCase() || "/";

  const isHome = ["/", "/home", "/homepage"].includes(p);

  // ===== روابط الملفات الرسمية + أيقوناتها (كلها داخل public/)
  // ضع الـ PDF في public/files/، والصور في public/badges/ أو مباشرة في public/
  const OFFICIAL_FILES = [
    {
      key: "cr",
      title: "السجل التجاري",
      img: "/سجل تجاري.png", // مثال: public/سجل تجاري.png
    },
    {
      key: "na",
      title: "العنوان الوطني",
      img: "/العنوان الوطني.png", // مثال: public/العنوان الوطني.png
    },
    {
      key: "vat",
      title: "شهادة ضريبة القيمة المضافة",
      img: "/شهادة الضريبة.png", // مثال: public/شهادة الضريبة.png
    },
  ];

  return (
    <div className="shell">
      <Navbar />

      <main className={`content ${isHome ? "home" : ""}`}>
        {isHome ? (
          <Outlet />
        ) : (
          <div className="container">
            <Outlet />
          </div>
        )}
      </main>

      <footer className="footerbar">
        <div className="footer-wrap container">
          {/* السطر 1 */}
          <div className="footer-top">© {year} جميع الحقوق محفوظة</div>

          {/* السطر 2 */}
          <div className="footer-center">
            <span className="muted">تم تطوير الموقع بواسطة</span>
            <img
              src="/Tonira logo BG.png"
              alt="Tonira Tech"
              className="footer-logo"
            />
          </div>

          {/* السطر 3 */}
          <div className="footer-bottom">
            <span className="muted">الدعم: TONIRAtechSupport@gmail.com</span>
            <span className="sep">•</span>
            <span className="muted">الإصدار 1.0.0</span>
          </div>

          {/* السطر 4: سطر واحد لكل شعارات الملفات كرابط قابل للنقر */}
          <div className="footer-links">
            {OFFICIAL_FILES.map((f) => (
              <a
                key={f.key}
                href={f.href}
                target="_blank"
                rel="noopener noreferrer"
                title={f.title}
                aria-label={f.title}
                className="footer-badge"
              >
                <img src={f.img} alt={f.title} />
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
