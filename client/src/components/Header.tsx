import { Link, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function Header() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navLink = (to: string, label: string) => {
    const active = location.pathname === to ||
      (to === "/onboarding" && location.pathname === "/assessment");
    return (
      <Link
        to={to}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          active
            ? "bg-warm-100 text-warm-900"
            : "text-warm-600 hover:text-warm-900 hover:bg-warm-100"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-warm-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center group-hover:bg-brand-700 transition-colors">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-warm-900 tracking-tight font-display">
                HFE
              </span>
              <span className="hidden sm:block text-warm-400 text-sm font-medium">
                Home Fall &amp; Safety Evaluator
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {navLink("/", "Home")}
            {navLink("/onboarding", "Assessment")}
            {navLink("/report", "Report")}
            {user && navLink("/history", "History")}
            {user ? (
              <button
                onClick={() => void logout()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-warm-600 hover:text-warm-900 hover:bg-warm-100 transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link
                to="/login"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === "/login"
                    ? "bg-warm-100 text-warm-900"
                    : "text-warm-600 hover:text-warm-900 hover:bg-warm-100"
                }`}
              >
                Login
              </Link>
            )}
            <Link
              to="/onboarding"
              className="ml-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Start Free →
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
