// src/pages/Homepage.jsx
import { Link } from "react-router-dom";

export default function Homepage() {
  return (
    <section
      className="landing-hero full-bleed"
      style={{ backgroundImage: 'url("/Homepage image.png")' }} // من مجلد public
    >
      <div className="landing-overlay" />
      <div className="landing-container">
        <h1 className="landing-title">مرحبًا في نظام إدارة الورشة</h1>
        <p className="landing-subtitle">
          منصة داخلية للمدير والموظفين لتتبّع التذاكر، التنسيق، والتقارير — في
          مكان واحد.
        </p>
        <div className="landing-actions">
          <Link to="/login" className="landing-cta">
            ابدأ الآن
          </Link>
        </div>
      </div>
    </section>
  );
}
