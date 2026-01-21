import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  User,
  Shield,
  Key,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Mail,
  Clock,
  Smartphone,
  QrCode,
  Copy,
  Check,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  AlertTriangle,
  Camera,
  Trash2,
  Upload
} from "lucide-react";
import { useState, useEffect } from "react";

export default function Account() {
  useDocumentTitle('Account Settings');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // 2FA State
  const [twoFAStep, setTwoFAStep] = useState<'idle' | 'setup' | 'verify' | 'backup'>('idle');
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFAQRCode, setTwoFAQRCode] = useState("");
  const [twoFAToken, setTwoFAToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [disableToken, setDisableToken] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => api.getUserProfile(),
  });
  
  const { data: userData } = useQuery({
    queryKey: ['auth-user'],
    queryFn: () => api.getCurrentUser(),
  });
  
  const isAdmin = userData?.user?.isAdmin ?? false;

  // 2FA Status Query
  const { data: twoFAStatus, isLoading: twoFALoading, refetch: refetchTwoFA } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => api.get2FAStatus(),
  });

  // 2FA Mutations
  const setup2FAMutation = useMutation({
    mutationFn: () => api.setup2FA(),
    onSuccess: (data) => {
      setTwoFASecret(data.secret);
      setTwoFAQRCode(data.qrCode);
      setTwoFAStep('setup');
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Failed to start 2FA setup.",
        variant: "destructive",
      });
    }
  });

  const enable2FAMutation = useMutation({
    mutationFn: (token: string) => api.enable2FA(token),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setTwoFAStep('backup');
      setTwoFAToken("");
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication is now active on your account.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid code. Please try again.",
        variant: "destructive",
      });
    }
  });

  const disable2FAMutation = useMutation({
    mutationFn: (params: { token: string; password: string }) => api.disable2FA(params),
    onSuccess: () => {
      setShowDisableConfirm(false);
      setDisableToken("");
      setDisablePassword("");
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been removed from your account.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Disable Failed",
        description: error.message || "Invalid code. Please try again.",
        variant: "destructive",
      });
    }
  });

  const regenerateBackupCodesMutation = useMutation({
    mutationFn: (token: string) => api.regenerate2FABackupCodes(token),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setTwoFAStep('backup');
      setTwoFAToken("");
      toast({
        title: "Backup Codes Regenerated",
        description: "New backup codes have been generated. Save them securely.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Regeneration Failed",
        description: error.message || "Invalid code. Please try again.",
        variant: "destructive",
      });
    }
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyAllBackupCodes = async () => {
    const codesText = backupCodes.join('\n');
    await navigator.clipboard.writeText(codesText);
    toast({
      title: "Copied",
      description: "All backup codes copied to clipboard.",
    });
  };

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setEmail(profile.email || "");
      setTimezone(profile.timezone || "");
      setProfilePictureUrl(profile.profilePictureUrl || null);
    }
  }, [profile]);

  // Profile picture mutations
  const uploadProfilePictureMutation = useMutation({
    mutationFn: (base64Image: string) => api.uploadProfilePicture(base64Image),
    onSuccess: (data) => {
      setProfilePictureUrl(data.profilePictureUrl);
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast({
        title: "Profile Picture Updated",
        description: "Your profile picture has been uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload profile picture.",
        variant: "destructive",
      });
    }
  });

  const deleteProfilePictureMutation = useMutation({
    mutationFn: () => api.deleteProfilePicture(),
    onSuccess: () => {
      setProfilePictureUrl(null);
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast({
        title: "Profile Picture Removed",
        description: "Your profile picture has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete profile picture.",
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a JPEG, PNG, GIF, or WebP image.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image must be less than 10MB.",
        variant: "destructive",
      });
      return;
    }

    // Convert to base64 and upload
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      uploadProfilePictureMutation.mutate(base64);
    };
    reader.readAsDataURL(file);
  };

  const updateProfileMutation = useMutation({
    mutationFn: (updates: { name?: string; email?: string; timezone?: string }) => 
      api.updateUserProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile.",
        variant: "destructive",
      });
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.changePassword(data.currentPassword, data.newPassword),
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: any) => {
      toast({
        title: "Password Change Failed",
        description: error.message || "Failed to change password.",
        variant: "destructive",
      });
    }
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({ name, email, timezone });
  };

  const handleChangePassword = () => {
    if (!currentPassword) {
      toast({
        title: "Current Password Required",
        description: "Please enter your current password.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2" data-testid="text-page-title">Account Settings</h1>
          <p className="text-muted-foreground">Manage your profile and security settings</p>
        </div>

        {isLoading ? (
          <Card className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading profile...</p>
          </Card>
        ) : error ? (
          <Card className="p-12 flex flex-col items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Unable to Load Profile</h3>
            <p className="text-muted-foreground text-center max-w-md">
              There was an issue loading your profile. Please try again later.
            </p>
          </Card>
        ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6" data-testid="profile-section">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Profile Information</h3>
                    <p className="text-sm text-muted-foreground">Your personal details</p>
                  </div>
                </div>
                {!isEditing && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-border hover:bg-muted/50"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-profile"
                  >
                    Edit
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {/* Profile Picture */}
                <div className="flex items-center gap-4 pb-4 border-b border-border">
                  <div className="relative">
                    {profilePictureUrl ? (
                      <img
                        src={profilePictureUrl}
                        alt="Profile"
                        className="h-20 w-20 rounded-full object-cover border-2 border-border"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <label
                      htmlFor="profile-picture-input"
                      className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors shadow-md"
                    >
                      {uploadProfilePictureMutation.isPending ? (
                        <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4 text-primary-foreground" />
                      )}
                    </label>
                    <input
                      id="profile-picture-input"
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={uploadProfilePictureMutation.isPending}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Profile Picture</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      JPEG, PNG, GIF, or WebP. Max 10MB.
                    </p>
                    {profilePictureUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteProfilePictureMutation.mutate()}
                        disabled={deleteProfilePictureMutation.isPending}
                        className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                      >
                        {deleteProfilePictureMutation.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3 mr-1" />
                        )}
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" className="text-muted-foreground">Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-card/30 border-border text-foreground"
                      data-testid="input-name"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-card/30 rounded-md border border-border">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground" data-testid="text-name">{profile?.name || 'Not set'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-card/30 border-border text-foreground"
                      data-testid="input-email"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-card/30 rounded-md border border-border">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground" data-testid="text-email">{profile?.email || 'Not set'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone" className="text-muted-foreground">Timezone</Label>
                  {isEditing ? (
                    <Input
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="e.g., Australia/Sydney"
                      className="bg-card/30 border-border text-foreground placeholder:text-muted-foreground/50"
                      data-testid="input-timezone"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-card/30 rounded-md border border-border">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground" data-testid="text-timezone">{profile?.timezone || 'Not set'}</span>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setName(profile?.name || "");
                        setEmail(profile?.email || "");
                        setTimezone(profile?.timezone || "");
                      }}
                      className="border-border hover:bg-muted/50"
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

            </Card>

            <Card className="p-6" data-testid="security-section">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Security</h3>
                  <p className="text-sm text-muted-foreground">Change your password</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-muted-foreground">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    className="bg-card/30 border-border text-foreground placeholder:text-muted-foreground/50"
                    data-testid="input-current-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-muted-foreground">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      className="bg-card/30 border-border text-foreground pr-10 placeholder:text-muted-foreground/50"
                      data-testid="input-new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters long
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-muted-foreground">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    className="bg-card/30 border-border text-foreground placeholder:text-muted-foreground/50"
                    data-testid="input-confirm-password"
                  />
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Change Password
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-2">
                  Password must be at least 8 characters long
                </p>
              </div>
            </Card>
          </div>

          {/* Two-Factor Authentication Section */}
          <Card className="p-6 mt-6" data-testid="2fa-section">
            <div className="flex items-center gap-3 mb-6">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center border ${
                twoFAStatus?.enabled
                  ? 'bg-green-500/10 text-green-500 border-green-500/20'
                  : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
              }`}>
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Two-Factor Authentication</h3>
                <p className="text-sm text-muted-foreground">
                  {twoFAStatus?.enabled ? 'Enabled - Your account is protected' : 'Add an extra layer of security'}
                </p>
              </div>
              {twoFAStatus?.enabled && (
                <div className="ml-auto flex items-center gap-2 text-green-500">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="text-sm font-medium">Active</span>
                </div>
              )}
            </div>

            {twoFALoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            ) : twoFAStep === 'idle' && !twoFAStatus?.enabled ? (
              // Not enabled - Show setup button
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-4 border border-border">
                  <h4 className="font-medium text-foreground mb-2">How it works:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Download an authenticator app (Google Authenticator, Authy, etc.)</li>
                    <li>Scan the QR code with your app</li>
                    <li>Enter the 6-digit code to verify</li>
                    <li>Save your backup codes securely</li>
                  </ol>
                </div>
                <Button
                  onClick={() => setup2FAMutation.mutate()}
                  disabled={setup2FAMutation.isPending}
                  className="w-full bg-primary hover:bg-primary/90"
                  data-testid="button-setup-2fa"
                >
                  {setup2FAMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <QrCode className="h-4 w-4 mr-2" />
                  )}
                  Set Up Two-Factor Authentication
                </Button>
              </div>
            ) : twoFAStep === 'setup' ? (
              // Setup step - Show QR code
              <div className="space-y-6">
                <div className="flex flex-col items-center">
                  <div className="bg-white p-4 rounded-lg mb-4">
                    <img
                      src={twoFAQRCode}
                      alt="2FA QR Code"
                      className="w-48 h-48"
                      data-testid="img-2fa-qrcode"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-2">
                    Scan this QR code with your authenticator app
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted/50 px-3 py-1 rounded text-xs font-mono text-foreground">
                      {twoFASecret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(twoFASecret)}
                      className="h-8 w-8 p-0"
                    >
                      {copiedCode === twoFASecret ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Or enter this secret key manually
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Enter verification code</Label>
                  <Input
                    value={twoFAToken}
                    onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="bg-card/30 border-border text-foreground text-center text-2xl tracking-widest font-mono"
                    maxLength={6}
                    data-testid="input-2fa-token"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTwoFAStep('idle');
                      setTwoFASecret("");
                      setTwoFAQRCode("");
                      setTwoFAToken("");
                    }}
                    className="flex-1 border-border hover:bg-muted/50"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => enable2FAMutation.mutate(twoFAToken)}
                    disabled={twoFAToken.length !== 6 || enable2FAMutation.isPending}
                    className="flex-1 bg-primary hover:bg-primary/90"
                    data-testid="button-verify-2fa"
                  >
                    {enable2FAMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 mr-2" />
                    )}
                    Verify & Enable
                  </Button>
                </div>
              </div>
            ) : twoFAStep === 'backup' ? (
              // Backup codes step
              <div className="space-y-6">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-500">Save Your Backup Codes</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        These codes can be used to access your account if you lose your authenticator device.
                        Each code can only be used once. Store them securely!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-muted/30 px-3 py-2 rounded border border-border"
                    >
                      <code className="font-mono text-sm text-foreground">{code}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(code)}
                        className="h-6 w-6 p-0"
                      >
                        {copiedCode === code ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={copyAllBackupCodes}
                    className="flex-1 border-border hover:bg-muted/50"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All Codes
                  </Button>
                  <Button
                    onClick={() => {
                      setTwoFAStep('idle');
                      setBackupCodes([]);
                      setTwoFASecret("");
                      setTwoFAQRCode("");
                    }}
                    className="flex-1 bg-primary hover:bg-primary/90"
                    data-testid="button-done-2fa"
                  >
                    I've Saved My Codes
                  </Button>
                </div>
              </div>
            ) : twoFAStatus?.enabled ? (
              // Already enabled - Show management options
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-4 border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Last used</p>
                      <p className="font-medium text-foreground">
                        {twoFAStatus.lastUsedAt
                          ? new Date(twoFAStatus.lastUsedAt).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Enabled</p>
                      <p className="font-medium text-foreground">
                        {twoFAStatus.verifiedAt
                          ? new Date(twoFAStatus.verifiedAt).toLocaleDateString()
                          : 'Unknown'}
                      </p>
                    </div>
                  </div>
                </div>

                {!showDisableConfirm ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTwoFAStep('verify');
                        setTwoFAToken("");
                      }}
                      className="flex-1 border-border hover:bg-muted/50"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate Backup Codes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowDisableConfirm(true)}
                      className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <ShieldOff className="h-4 w-4 mr-2" />
                      Disable 2FA
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-400">Disable Two-Factor Authentication?</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          This will remove the extra security layer from your account.
                          Enter both your password and current 2FA code to confirm.
                        </p>
                      </div>
                    </div>
                    <Input
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="bg-card/30 border-border text-foreground"
                      data-testid="input-disable-2fa-password"
                    />
                    <Input
                      value={disableToken}
                      onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 2FA code"
                      className="bg-card/30 border-border text-foreground text-center text-xl tracking-widest font-mono"
                      maxLength={6}
                      data-testid="input-disable-2fa-token"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDisableConfirm(false);
                          setDisableToken("");
                          setDisablePassword("");
                        }}
                        className="flex-1 border-border hover:bg-muted/50"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => disable2FAMutation.mutate({ token: disableToken, password: disablePassword })}
                        disabled={disableToken.length !== 6 || !disablePassword || disable2FAMutation.isPending}
                        className="flex-1 bg-red-600 hover:bg-red-700"
                        data-testid="button-confirm-disable-2fa"
                      >
                        {disable2FAMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <ShieldOff className="h-4 w-4 mr-2" />
                        )}
                        Disable 2FA
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : twoFAStep === 'verify' ? (
              // Verify for regenerating backup codes
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your current 2FA code to regenerate backup codes. This will invalidate your old codes.
                </p>
                <Input
                  value={twoFAToken}
                  onChange={(e) => setTwoFAToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 2FA code"
                  className="bg-card/30 border-border text-foreground text-center text-xl tracking-widest font-mono"
                  maxLength={6}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTwoFAStep('idle');
                      setTwoFAToken("");
                    }}
                    className="flex-1 border-border hover:bg-muted/50"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => regenerateBackupCodesMutation.mutate(twoFAToken)}
                    disabled={twoFAToken.length !== 6 || regenerateBackupCodesMutation.isPending}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    {regenerateBackupCodesMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Regenerate Codes
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
          </>
        )}

        {profile && isAdmin && (
          <div className="flex justify-center gap-6 text-xs text-muted-foreground mt-8">
            <div>
              <span>VIRTID: </span>
              <span className="font-mono" data-testid="text-vf-id">{profile?.virtFusionUserId || 'Not linked'}</span>
            </div>
            <div>
              <span>Auth0 ID: </span>
              <span className="font-mono" data-testid="text-auth0-id">{profile?.id || 'Unknown'}</span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
