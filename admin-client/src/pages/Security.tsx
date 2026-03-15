import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { securityApi, settingsApi } from "../lib/api";
import { toast } from "sonner";
import { Shield, Key, Save, TestTube, Check, X, AlertTriangle, ExternalLink, Wrench } from "lucide-react";
import { cn } from "../lib/utils";

export default function Security() {
  const queryClient = useQueryClient();
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [version, setVersion] = useState<'v2' | 'v3'>('v3');
  const [hasChanges, setHasChanges] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);

  const { isLoading: maintenanceLoading } = useQuery({
    queryKey: ["maintenance-setting"],
    queryFn: settingsApi.getMaintenance,
    onSuccess: (data) => setMaintenanceEnabled(data.enabled),
  });

  const maintenanceMutation = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.updateMaintenance(enabled),
    onSuccess: (data) => {
      setMaintenanceEnabled(data.enabled);
      toast.success(data.enabled ? "Maintenance mode enabled" : "Maintenance mode disabled");
      queryClient.invalidateQueries({ queryKey: ["maintenance-setting"] });
    },
    onError: () => toast.error("Failed to update maintenance mode"),
  });

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
      setSecretKey("");
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
      <h1 className="text-2xl font-bold text-white mb-6">Security Settings</h1>

      {/* Maintenance Mode */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg mt-0.5">
              <Wrench className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Maintenance Mode</h3>
              <p className="text-sm text-white/50 mt-1 max-w-md">
                When enabled, all visitors will see a maintenance page instead of the login screen. Existing sessions are unaffected.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {maintenanceLoading ? (
              <span className="text-xs text-white/40">Loading...</span>
            ) : (
              <>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium border",
                  maintenanceEnabled
                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                    : "bg-green-500/20 text-green-400 border-green-500/30"
                )}>
                  {maintenanceEnabled ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => maintenanceMutation.mutate(!maintenanceEnabled)}
                  disabled={maintenanceMutation.isPending}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
                    maintenanceEnabled
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  )}
                >
                  {maintenanceMutation.isPending
                    ? "Saving..."
                    : maintenanceEnabled
                    ? "Disable Maintenance"
                    : "Enable Maintenance"}
                </button>
              </>
            )}
          </div>
        </div>
        {maintenanceEnabled && (
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-sm text-orange-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Maintenance mode is active. Users cannot access the platform.</span>
          </div>
        )}
      </div>

      {/* reCAPTCHA Section */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-[hsl(210_100%_50%)/15] rounded-lg">
            <Shield className="h-6 w-6 text-[hsl(210_100%_70%)]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">reCAPTCHA Protection</h2>
            <p className="text-sm text-white/50">
              Protect login and registration forms from bots
            </p>
          </div>
        </div>

        {/* Status Banner */}
        {!isLoading && (
          <div className={`mb-6 p-4 rounded-lg border ${
            settings?.enabled
              ? "bg-[hsl(160_84%_39%)/10] border-[hsl(160_84%_39%)/30]"
              : "bg-[hsl(14_100%_60%)/10] border-[hsl(14_100%_60%)/30]"
          }`}>
            <div className="flex items-center gap-3">
              {settings?.enabled ? (
                <>
                  <Check className="h-5 w-5 text-[hsl(160_84%_60%)]" />
                  <div>
                    <p className="font-medium text-[hsl(160_84%_60%)]">reCAPTCHA is Active</p>
                    <p className="text-sm text-[hsl(160_84%_60%)/70]">
                      Login and registration forms are protected ({settings.version.toUpperCase()})
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-[hsl(14_100%_70%)]" />
                  <div>
                    <p className="font-medium text-[hsl(14_100%_70%)]">reCAPTCHA is Disabled</p>
                    <p className="text-sm text-[hsl(14_100%_70%)/70]">
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(210_100%_50%)]"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
              <div>
                <label className="font-medium text-white text-sm">Enable reCAPTCHA</label>
                <p className="text-xs text-white/50 mt-0.5">
                  Require reCAPTCHA verification on login and registration
                </p>
              </div>
              <button
                onClick={() => {
                  setEnabled(!enabled);
                  handleChange();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? "bg-[hsl(210_100%_50%)]" : "bg-white/20"
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
              <label className="block text-sm font-medium text-white/60 mb-2">
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
                      ? "border-[hsl(210_100%_50%)] bg-[hsl(210_100%_50%)/10]"
                      : "border-white/10 hover:border-white/20 bg-white/5"
                  }`}
                >
                  <p className="font-medium text-white text-sm">v3 (Recommended)</p>
                  <p className="text-xs text-white/50 mt-1">
                    Invisible — scores user behavior without interaction
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
                      ? "border-[hsl(210_100%_50%)] bg-[hsl(210_100%_50%)/10]"
                      : "border-white/10 hover:border-white/20 bg-white/5"
                  }`}
                >
                  <p className="font-medium text-white text-sm">v2 Checkbox</p>
                  <p className="text-xs text-white/50 mt-1">
                    "I'm not a robot" checkbox verification
                  </p>
                </button>
              </div>
            </div>

            {/* API Keys */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">
                  Site Key (Public)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    type="text"
                    value={siteKey}
                    onChange={(e) => {
                      setSiteKey(e.target.value);
                      handleChange();
                    }}
                    placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none font-mono text-sm placeholder-white/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">
                  Secret Key (Private)
                  {settings?.hasSecretKey && !secretKey && (
                    <span className="ml-2 text-[hsl(160_84%_60%)] text-xs">(configured)</span>
                  )}
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    type="password"
                    value={secretKey}
                    onChange={(e) => {
                      setSecretKey(e.target.value);
                      handleChange();
                    }}
                    placeholder={settings?.hasSecretKey ? "••••••••••••••••••••" : "6Lxxxxxxxxxxxxxxxxxxxxxxxxx"}
                    className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-[hsl(210_100%_50%)/40] outline-none font-mono text-sm placeholder-white/30"
                  />
                </div>
              </div>
            </div>

            {/* Get Keys Link */}
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink className="h-4 w-4 text-white/40" />
              <a
                href="https://www.google.com/recaptcha/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(210_100%_60%)] hover:text-[hsl(210_100%_70%)] transition-colors"
              >
                Get reCAPTCHA keys from Google
              </a>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.valid
                  ? "bg-[hsl(160_84%_39%)/10] border-[hsl(160_84%_39%)/30]"
                  : "bg-[hsl(0_84%_60%)/10] border-[hsl(0_84%_60%)/30]"
              }`}>
                <div className="flex items-center gap-2">
                  {testResult.valid ? (
                    <>
                      <Check className="h-5 w-5 text-[hsl(160_84%_60%)]" />
                      <span className="text-[hsl(160_84%_60%)] font-medium">Configuration is valid</span>
                    </>
                  ) : (
                    <>
                      <X className="h-5 w-5 text-[hsl(0_84%_70%)]" />
                      <span className="text-[hsl(0_84%_70%)] font-medium">
                        {testResult.error || "Invalid configuration"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-white/8">
              <button
                onClick={() => testMutation.mutate()}
                disabled={!canTest || testMutation.isPending}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 rounded-lg hover:bg-white/10 hover:text-white disabled:opacity-50 flex items-center gap-2 transition-colors text-sm"
              >
                <TestTube className="h-4 w-4" />
                {testMutation.isPending ? "Testing..." : "Test Configuration"}
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending || !hasChanges}
                className="px-4 py-2 bg-[hsl(210_100%_50%)] text-white rounded-lg hover:bg-[hsl(210_100%_45%)] disabled:opacity-50 flex items-center gap-2 transition-colors text-sm"
              >
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </button>
              {hasChanges && (
                <span className="text-sm text-[hsl(14_100%_70%)]">Unsaved changes</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-6">
        <h3 className="font-semibold text-white mb-4">About reCAPTCHA</h3>
        <div className="space-y-3 text-sm text-white/50">
          <p>
            <span className="text-white/70 font-medium">v3 (Recommended):</span> Runs invisibly in the background and assigns a score (0.0–1.0)
            based on user behavior. No user interaction required. Best for user experience.
          </p>
          <p>
            <span className="text-white/70 font-medium">v2 Checkbox:</span> Shows a "I'm not a robot" checkbox. May present image challenges
            if suspicious activity is detected. More intrusive but familiar to users.
          </p>
          <p className="pt-3 border-t border-white/8">
            reCAPTCHA protects your login and registration forms from automated attacks, credential stuffing,
            and bot registrations.
          </p>
        </div>
      </div>
    </div>
  );
}
