import { useState } from "react";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { AlertCircle, Lock, Mail, KeyRound, ArrowLeft, Shield } from "lucide-react";
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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a] px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-purple-600/5" />
        <div className="relative max-w-md w-full">
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                <AlertCircle className="h-10 w-10 text-amber-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center text-white mb-3">
              2FA Required
            </h1>
            <p className="text-gray-400 text-center mb-8 leading-relaxed">
              Two-factor authentication must be enabled on your account to access this area.
              Please enable 2FA in the main panel first.
            </p>
            <button
              onClick={() => {
                setRequires2FASetup(false);
                setEmail("");
                setPassword("");
              }}
              className="w-full py-3 px-4 bg-gray-800 text-gray-300 rounded-xl font-medium hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a] px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-purple-600/5" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNNjAgMEgwdjYwaDYwVjB6TTEgMWg1OHY1OEgxVjF6IiBmaWxsPSIjMWYyOTM3IiBmaWxsLW9wYWNpdHk9Ii4zIi8+PC9nPjwvc3ZnPg==')] opacity-40" />

      <div className="relative max-w-md w-full">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logo} alt="OzVPS" className="h-20 mb-4 drop-shadow-2xl" />
          <div className="flex items-center gap-2 text-gray-500">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium tracking-wide uppercase">Admin Portal</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-[#111827] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!pendingLoginToken ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full pl-12 pr-4 py-3.5 bg-[#0d1321] border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="admin@example.com"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-[#0d1321] border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="Enter your password"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify2FA} className="space-y-6">
              <div className="text-center">
                <div className="inline-flex p-4 bg-blue-500/10 rounded-2xl mb-4 border border-blue-500/20">
                  <KeyRound className="h-8 w-8 text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Two-Factor Authentication</h2>
                <p className="text-gray-400">
                  Enter the 6-digit code from your authenticator app
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
                  className="w-full px-4 py-5 bg-[#0d1321] border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-center text-3xl tracking-[0.5em] font-mono"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full py-3.5 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  "Verify Code"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingLoginToken(null);
                  setCode("");
                  setError(null);
                }}
                className="w-full py-3 px-4 text-gray-400 rounded-xl hover:text-white hover:bg-gray-800/50 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-5 w-5" />
                Back to Login
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-gray-600">
          Authorized personnel only
        </p>
      </div>
    </div>
  );
}
