// src/App.js
import "./styles.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./Components/AppLayout";
import Homepage from "./pages/Homepage";
import Login from "./pages/Login";
import ManagerPage from "./pages/Manager-page";
import WorkersPage from "./pages/WorkersPage";
import EmployeePage from "./pages/EmployeePage";

function ProtectedRoute({ allow, children }) {
  const role = localStorage.getItem("role");
  if (!role) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(role)) return <Navigate to="/login" replace />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const role = localStorage.getItem("role");
  if (role === "manager") return <Navigate to="/manager" replace />;
  if (role === "employee") return <Navigate to="/employee" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Layout يلف كل الصفحات */}
        <Route element={<AppLayout />}>
          {/* 👇 الهوم كـ index على "/" */}
          <Route index element={<Homepage />} />
          {/* اختياري: ألياس لمسارات أخرى */}
          <Route path="home" element={<Homepage />} />
          <Route path="homepage" element={<Homepage />} />

          <Route
            path="login"
            element={
              <RedirectIfAuthed>
                <Login />
              </RedirectIfAuthed>
            }
          />

          {/* مدير فقط */}
          <Route
            path="manager"
            element={
              <ProtectedRoute allow={["manager"]}>
                <ManagerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="manager/workers"
            element={
              <ProtectedRoute allow={["manager"]}>
                <WorkersPage />
              </ProtectedRoute>
            }
          />

          {/* موظف فقط */}
          <Route
            path="employee"
            element={
              <ProtectedRoute allow={["employee"]}>
                <EmployeePage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* أي مسار غير معروف */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
