import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { requestLogin, register, verifyLogin } from "../lib/authClient";
import { useAuth } from "../components/AuthProvider";

type Stage = "email" | "code";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, name || undefined);
      } else {
        await requestLogin(email);
      }
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await verifyLogin(email, code);
      setUser(user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/onboarding" ? from : "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-warm-200 rounded-2xl p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-warm-900 mb-1.5 font-display">Sign in to HFE</h1>
          <p className="text-warm-500 text-sm">
            Sign in to access your saved reports and share your family's safety plan.
          </p>
        </div>

        {stage === "email" ? (
          <form onSubmit={submitEmail} className="space-y-3">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-warm-700 mb-1">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                aria-required="true"
                aria-describedby={error ? "login-error" : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white border border-warm-200 text-warm-900 placeholder-warm-400 rounded-xl px-4 py-2.5 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 transition-colors"
              />
            </div>
            {isRegister && (
              <div>
                <label htmlFor="login-name" className="block text-sm font-medium text-warm-700 mb-1">
                  Name <span className="font-normal text-warm-500">(optional)</span>
                </label>
                <input
                  id="login-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-white border border-warm-200 text-warm-900 placeholder-warm-400 rounded-xl px-4 py-2.5 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 transition-colors"
                />
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? "Sending..." : isRegister ? "Create account & send code" : "Send login code"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-3">
            <p className="text-xs text-warm-600">
              Enter the 6-digit code sent to {email}.
            </p>
            <div>
              <label htmlFor="login-code" className="block text-sm font-medium text-warm-700 mb-1">
                Verification code
              </label>
              <input
                id="login-code"
                type="text"
                required
                aria-required="true"
                aria-describedby={error ? "login-error" : undefined}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full bg-white border border-warm-200 text-warm-900 placeholder-warm-400 rounded-xl px-4 py-2.5 tracking-[0.25em] focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 transition-colors"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? "Verifying..." : "Verify and sign in"}
            </button>
          </form>
        )}

        {error && (
          <p id="login-error" role="alert" className="text-sm text-red-600 mt-4">
            {error}
          </p>
        )}

        <button
          onClick={() => {
            setError(null);
            setStage("email");
            setIsRegister((value) => !value);
          }}
          className="text-sm text-brand-600 hover:text-brand-700 mt-6 block"
        >
          {isRegister ? "Already have an account? Request login code" : "New here? Create account"}
        </button>
      </div>
    </div>
  );
}
