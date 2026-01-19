import { useState } from "react";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { AlertCircle, Lock, Mail, KeyRound, ArrowLeft } from "lucide-react";
import logo from "../assets/logo.png";

export default function Login() {
  const { login, verify2FA } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingLoginToken, setPendingLoginToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requires2FASetup, setRequires2FASetup] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.requires2FASetup) {
        setRequires2FASetup(true);
        setError("Two-factor authentication must be enabled to access this area.");
        return;
      }

      if (result.requires2FA && result.pendingLoginToken) {
        setPendingLoginToken(result.pendingLoginToken);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingLoginToken) return;

    setError(null);
    setIsLoading(true);

    try {
      await verify2FA(pendingLoginToken, code);
      toast.success("Authenticated");
    } catch (err: any) {
      setError(err.message || "Invalid code");
    } finally {
      setIsLoading(false);
    }
  };

  if (requires2FASetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
        <div className="max-w-sm w-full">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8">
            <div className="flex justify-center mb-6">
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <AlertCircle className="h-8 w-8 text-amber-400" />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-center text-white mb-3">
              2FA Required
            </h1>
            <p className="text-slate-400 text-sm text-center mb-6 leading-relaxed">
              Two-factor authentication must be enabled on your account to access this area.
              Please enable 2FA in the main panel first.
            </p>
            <button
              onClick={() => {
                setRequires2FASetup(false);
                setEmail("");
                setPassword("");
              }}
              className="w-full py-2.5 px-4 bg-slate-700/50 text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="max-w-sm w-full">
        {/* Subtle logo */}
        <div className="flex justify-center mb-8">
          <img src={logo} alt="" className="h-8 opacity-60" />
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8">
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {!pendingLoginToken ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none transition-all text-sm"
                    placeholder="Email"
                  />
                </div>
              </div>
              <div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none transition-all text-sm"
                    placeholder="Password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-500 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify2FA} className="space-y-5">
              <div className="text-center mb-2">
                <div className="inline-flex p-3 bg-blue-500/10 rounded-xl mb-4">
                  <KeyRound className="h-6 w-6 text-blue-400" />
                </div>
                <p className="text-slate-400 text-sm">
                  Enter the 6-digit code from your authenticator
                </p>
              </div>
              <div>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-full px-4 py-4 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 outline-none transition-all text-center text-2xl tracking-[0.3em] font-mono"
                  placeholder="------"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-500 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  "Verify"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingLoginToken(null);
                  setCode("");
                  setError(null);
                }}
                className="w-full py-2.5 px-4 text-slate-400 rounded-lg text-sm hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Restricted access
        </p>
      </div>
    </div>
  );
}
