import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { securityApi } from "../lib/api";
import { toast } from "sonner";
import { Shield, Key, Save, TestTube, Check, X, AlertTriangle, ExternalLink } from "lucide-react";

export default function Security() {
  const queryClient = useQueryClient();
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [version, setVersion] = useState<'v2' | 'v3'>('v3');
  const [hasChanges, setHasChanges] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["recaptcha-settings"],
    queryFn: securityApi.getRecaptchaSettings,
    onSuccess: (data) => {
      setSiteKey(data.siteKey || "");
      setEnabled(data.enabled);
      setVersion(data.version);
      setHasChanges(false);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      securityApi.updateRecaptchaSettings({
        siteKey,
        secretKey,
        enabled,
        version,
      }),
    onSuccess: () => {
      toast.success("reCAPTCHA settings saved successfully");
      setHasChanges(false);
      setSecretKey(""); // Clear secret key after save
      queryClient.invalidateQueries({ queryKey: ["recaptcha-settings"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: () => securityApi.testRecaptchaConfig(siteKey, secretKey),
    onSuccess: (result) => {
      setTestResult(result);
      if (result.valid) {
        toast.success("reCAPTCHA configuration is valid!");
      } else {
        toast.error(result.error || "Invalid configuration");
      }
    },
    onError: (err: any) => {
      setTestResult({ valid: false, error: err.message });
      toast.error(err.message);
    },
  });

  const handleChange = () => {
    setHasChanges(true);
    setTestResult(null);
  };

  const canTest = siteKey.length > 0 && secretKey.length > 0;
  const canSave = siteKey.length > 0 && (secretKey.length > 0 || settings?.hasSecretKey);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Security Settings</h1>

      {/* reCAPTCHA Section */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Shield className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">reCAPTCHA Protection</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Protect login and registration forms from bots
            </p>
          </div>
        </div>

        {/* Status Banner */}
        {!isLoading && (
          <div className={`mb-6 p-4 rounded-lg border ${
            settings?.enabled
              ? "bg-green-500/10 border-green-500/30"
              : "bg-yellow-500/10 border-yellow-500/30"
          }`}>
            <div className="flex items-center gap-3">
              {settings?.enabled ? (
                <>
                  <Check className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="font-medium text-green-400">reCAPTCHA is Active</p>
                    <p className="text-sm text-green-400/80">
                      Login and registration forms are protected ({settings.version.toUpperCase()})
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  <div>
                    <p className="font-medium text-yellow-400">reCAPTCHA is Disabled</p>
                    <p className="text-sm text-yellow-400/80">
                      Your forms are not protected from automated attacks
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div>
                <label className="font-medium text-gray-900 dark:text-white">Enable reCAPTCHA</label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Require reCAPTCHA verification on login and registration
                </p>
              </div>
              <button
                onClick={() => {
                  setEnabled(!enabled);
                  handleChange();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Version Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                reCAPTCHA Version
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setVersion('v3');
                    handleChange();
                  }}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    version === 'v3'
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-white">v3 (Recommended)</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Invisible - scores user behavior without interaction
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVersion('v2');
                    handleChange();
                  }}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    version === 'v2'
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <p className="font-medium text-gray-900 dark:text-white">v2 Checkbox</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    "I'm not a robot" checkbox verification
                  </p>
                </button>
              </div>
            </div>

            {/* API Keys */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Site Key (Public)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={siteKey}
                    onChange={(e) => {
                      setSiteKey(e.target.value);
                      handleChange();
                    }}
                    placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full pl-10 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Secret Key (Private)
                  {settings?.hasSecretKey && !secretKey && (
                    <span className="ml-2 text-green-500 text-xs">(configured)</span>
                  )}
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    value={secretKey}
                    onChange={(e) => {
                      setSecretKey(e.target.value);
                      handleChange();
                    }}
                    placeholder={settings?.hasSecretKey ? "••••••••••••••••••••" : "6Lxxxxxxxxxxxxxxxxxxxxxxxxx"}
                    className="w-full pl-10 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Get Keys Link */}
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink className="h-4 w-4 text-gray-400" />
              <a
                href="https://www.google.com/recaptcha/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                Get reCAPTCHA keys from Google
              </a>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-4 rounded-lg ${
                testResult.valid
                  ? "bg-green-500/10 border border-green-500/30"
                  : "bg-red-500/10 border border-red-500/30"
              }`}>
                <div className="flex items-center gap-2">
                  {testResult.valid ? (
                    <>
                      <Check className="h-5 w-5 text-green-400" />
                      <span className="text-green-400 font-medium">Configuration is valid</span>
                    </>
                  ) : (
                    <>
                      <X className="h-5 w-5 text-red-400" />
                      <span className="text-red-400 font-medium">
                        {testResult.error || "Invalid configuration"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => testMutation.mutate()}
                disabled={!canTest || testMutation.isPending}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                <TestTube className="h-4 w-4" />
                {testMutation.isPending ? "Testing..." : "Test Configuration"}
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending || !hasChanges}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </button>
              {hasChanges && (
                <span className="text-sm text-yellow-500">Unsaved changes</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-white dark:bg-[var(--color-card)] rounded-xl shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">About reCAPTCHA</h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <p>
            <strong>v3 (Recommended):</strong> Runs invisibly in the background and assigns a score (0.0-1.0)
            based on user behavior. No user interaction required. Best for user experience.
          </p>
          <p>
            <strong>v2 Checkbox:</strong> Shows a "I'm not a robot" checkbox. May present image challenges
            if suspicious activity is detected. More intrusive but familiar to users.
          </p>
          <p className="pt-2 border-t border-gray-200 dark:border-gray-700">
            reCAPTCHA protects your login and registration forms from automated attacks, credential stuffing,
            and bot registrations.
          </p>
        </div>
      </div>
    </div>
  );
}
