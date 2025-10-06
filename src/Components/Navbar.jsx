import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [role, setRole] = useState(localStorage.getItem("role"));
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const update = () => setRole(localStorage.getItem("role"));
    window.addEventListener("authchange", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("authchange", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  useEffect(() => {
    setRole(localStorage.getItem("role"));
  }, [location.pathname]);

  function logout() {
    localStorage.clear();
    window.dispatchEvent(new Event("authchange"));
    navigate("/", { replace: true });
  }

  return (
    <header className="navbar">
      <div className="brand">
        <img src="/القوة الكامنة Logo.png" alt="Tonira" className="logo" />
        <img src="/Tonira logo BG.png" alt="Tonira" className="logo" />
        <span className="brand-name ltr">ورشة القوة الكامنة</span>
      </div>

      <nav>
        <Link to="/">الرئيسية</Link>
        {!role && <Link to="/login">Login</Link>}
        {role === "manager" && (
          <>
            <Link to="/manager">لوحة البيانات</Link>
            <Link to="/manager/workers">العمليات</Link>
          </>
        )}
        {role === "employee" && <Link to="/employee">العمليات</Link>}
        {role && (
          <button
            className="btn ghost"
            onClick={logout}
            style={{ padding: "6px 10px" }}
          >
            Logout
          </button>
        )}
      </nav>
    </header>
  );
}
