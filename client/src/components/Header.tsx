import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "./AuthProvider";

export default function Header() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (to: string) =>
    location.pathname === to ||
    (to === "/onboarding" && location.pathname === "/assessment");

  const linkClass = (to: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive(to)
        ? "bg-warm-100 text-warm-900"
        : "text-warm-600 hover:text-warm-900 hover:bg-warm-100"
    }`;

  const mobileLinkClass = (to: string) =>
    `block px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
      isActive(to)
        ? "bg-warm-100 text-warm-900"
        : "text-warm-700 hover:text-warm-900 hover:bg-warm-100"
    }`;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-warm-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        Skip to main content
      </a>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center group-hover:bg-brand-700 transition-colors">
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            <Link to="/" className={linkClass("/")}>Home</Link>
            <Link to="/onboarding" className={linkClass("/onboarding")}>Assessment</Link>
            <Link to="/report" className={linkClass("/report")}>Report</Link>
            {user && <Link to="/history" className={linkClass("/history")}>History</Link>}
            {user?.role === "admin" && (
              <Link to="/admin/revenue" className={linkClass("/admin/revenue")}>Revenue</Link>
            )}
            {user ? (
              <button
                onClick={() => void logout()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-warm-600 hover:text-warm-900 hover:bg-warm-100 transition-colors"
              >
                Logout
              </button>
            ) : (
              <Link to="/login" className={linkClass("/login")}>Login</Link>
            )}
            <Link
              to="/onboarding"
              className="ml-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Start Free →
            </Link>
          </nav>

          {/* Mobile: CTA + hamburger */}
          <div className="flex sm:hidden items-center gap-2">
            <Link
              to="/onboarding"
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Start Free
            </Link>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="p-2 rounded-lg text-warm-600 hover:text-warm-900 hover:bg-warm-100 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-warm-200 bg-white px-4 py-3 space-y-1 animate-fade-in">
          <Link to="/" className={mobileLinkClass("/")}>Home</Link>
          <Link to="/onboarding" className={mobileLinkClass("/onboarding")}>Assessment</Link>
          <Link to="/report" className={mobileLinkClass("/report")}>Report</Link>
          {user && <Link to="/history" className={mobileLinkClass("/history")}>History</Link>}
          {user?.role === "admin" && (
            <Link to="/admin/revenue" className={mobileLinkClass("/admin/revenue")}>Revenue</Link>
          )}
          {user ? (
            <button
              onClick={() => void logout()}
              className="block w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-warm-700 hover:text-warm-900 hover:bg-warm-100 transition-colors"
            >
              Logout
            </button>
          ) : (
            <Link to="/login" className={mobileLinkClass("/login")}>Login</Link>
          )}
        </div>
      )}
    </header>
  );
}
