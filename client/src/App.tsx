import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import Onboarding from "./pages/Onboarding";
import Assessment from "./pages/Assessment";
import LiveAssessment from "./pages/LiveAssessment";
import Report from "./pages/Report";
import Login from "./pages/Login";
import RequireAuth, { RequireAdmin } from "./components/RequireAuth";
import History from "./pages/History";
import RevenueDashboardPage from "./pages/RevenueDashboard";
import ReferralStartPage from "./pages/ReferralStart";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Routes>
        {/* Onboarding has its own full-screen layout (no header) */}
        <Route path="/login" element={<Login />} />
        <Route path="/start/:referralCode" element={<ReferralStartPage />} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

        {/* All other routes use the shared header */}
        <Route
          path="/*"
          element={
            <>
              <Header />
              <main id="main-content" className="flex-1">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
                  <Route path="/assessment" element={<RequireAuth><Assessment /></RequireAuth>} />
                  <Route path="/assessment/live" element={<RequireAuth><LiveAssessment /></RequireAuth>} />
                  <Route path="/report" element={<RequireAuth><Report /></RequireAuth>} />
                  <Route path="/report/:sessionId" element={<RequireAuth><Report /></RequireAuth>} />
                  <Route path="/admin/revenue" element={<RequireAdmin><RevenueDashboardPage /></RequireAdmin>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </>
          }
        />
      </Routes>
    </div>
  );
}
