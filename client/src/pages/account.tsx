import { AppShell } from "@/components/layout/app-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SshKey } from "@/lib/api";
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
  Plus,
  Trash2,
  KeyRound,
  Copy,
  Check
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Account() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // SSH Key state
  const [isAddKeyDialogOpen, setIsAddKeyDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<SshKey | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPublic, setNewKeyPublic] = useState("");
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => api.getUserProfile(),
  });
  
  // SSH Keys query
  const { data: sshKeys, isLoading: isLoadingSshKeys } = useQuery({
    queryKey: ['sshKeys'],
    queryFn: () => api.listSshKeys(),
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setEmail(profile.email || "");
      setTimezone(profile.timezone || "");
    }
  }, [profile]);

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
    mutationFn: (password: string) => api.changePassword(password),
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
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
  
  // SSH Key mutations
  const createSshKeyMutation = useMutation({
    mutationFn: ({ name, publicKey }: { name: string; publicKey: string }) => 
      api.createSshKey(name, publicKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshKeys'] });
      toast({
        title: "SSH Key Added",
        description: "Your SSH key has been added successfully.",
      });
      setIsAddKeyDialogOpen(false);
      setNewKeyName("");
      setNewKeyPublic("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add SSH Key",
        description: error.message || "Failed to add SSH key.",
        variant: "destructive",
      });
    }
  });
  
  const deleteSshKeyMutation = useMutation({
    mutationFn: (keyId: number) => api.deleteSshKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshKeys'] });
      toast({
        title: "SSH Key Deleted",
        description: "Your SSH key has been removed.",
      });
      setKeyToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete SSH Key",
        description: error.message || "Failed to delete SSH key.",
        variant: "destructive",
      });
    }
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({ name, email, timezone });
  };

  const handleChangePassword = () => {
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
    changePasswordMutation.mutate(newPassword);
  };
  
  const handleAddSshKey = () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for your SSH key.",
        variant: "destructive",
      });
      return;
    }
    if (!newKeyPublic.trim()) {
      toast({
        title: "Public Key Required",
        description: "Please paste your SSH public key.",
        variant: "destructive",
      });
      return;
    }
    // Validate SSH key format
    const keyTypes = ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss'];
    const isValidFormat = keyTypes.some(type => newKeyPublic.trim().startsWith(type + ' '));
    if (!isValidFormat) {
      toast({
        title: "Invalid SSH Key",
        description: "SSH key must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2-*",
        variant: "destructive",
      });
      return;
    }
    createSshKeyMutation.mutate({ name: newKeyName.trim(), publicKey: newKeyPublic.trim() });
  };
  
  const copyToClipboard = (text: string, keyId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };
  
  const truncateKey = (key: string) => {
    if (key.length <= 50) return key;
    return key.substring(0, 30) + '...' + key.substring(key.length - 20);
  };

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2" data-testid="text-page-title">Account Settings</h1>
          <p className="text-muted-foreground">Manage your profile and security settings</p>
        </div>

        {isLoading ? (
          <GlassCard className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading profile...</p>
          </GlassCard>
        ) : error ? (
          <GlassCard className="p-12 flex flex-col items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Unable to Load Profile</h3>
            <p className="text-muted-foreground text-center max-w-md">
              There was an issue loading your profile. Please try again later.
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GlassCard className="p-6" data-testid="profile-section">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Profile Information</h3>
                    <p className="text-sm text-muted-foreground">Your personal details</p>
                  </div>
                </div>
                {!isEditing && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-white/10 hover:bg-white/5"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-profile"
                  >
                    Edit
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-muted-foreground">Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-black/20 border-white/10 text-white"
                      data-testid="input-name"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-black/20 rounded-md border border-white/10">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-white" data-testid="text-name">{profile?.name || 'Not set'}</span>
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
                      className="bg-black/20 border-white/10 text-white"
                      data-testid="input-email"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-black/20 rounded-md border border-white/10">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-white" data-testid="text-email">{profile?.email || 'Not set'}</span>
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
                      className="bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50"
                      data-testid="input-timezone"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-black/20 rounded-md border border-white/10">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-white" data-testid="text-timezone">{profile?.timezone || 'Not set'}</span>
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
                      className="border-white/10 hover:bg-white/5"
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

            </GlassCard>

            <GlassCard className="p-6" data-testid="security-section">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Security</h3>
                  <p className="text-sm text-muted-foreground">Change your password</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-muted-foreground">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="bg-black/20 border-white/10 text-white pr-10 placeholder:text-muted-foreground/50"
                      data-testid="input-new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-muted-foreground">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50"
                    data-testid="input-confirm-password"
                  />
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={changePasswordMutation.isPending || !newPassword || !confirmPassword}
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
            </GlassCard>
          </div>
        )}
        
        {/* SSH Key Manager Section */}
        {!isLoading && !error && (
          <GlassCard className="p-6" data-testid="ssh-keys-section">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">SSH Keys</h3>
                  <p className="text-sm text-muted-foreground">Manage SSH keys for secure server access</p>
                </div>
              </div>
              
              <Dialog open={isAddKeyDialogOpen} onOpenChange={setIsAddKeyDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="button-add-ssh-key"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10">
                  <DialogHeader>
                    <DialogTitle className="text-white">Add SSH Key</DialogTitle>
                    <DialogDescription>
                      Add a public SSH key to use when reinstalling your servers. 
                      The key will be added to the authorized_keys file.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="keyName" className="text-muted-foreground">Key Name</Label>
                      <Input
                        id="keyName"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g., My Laptop, Work Computer"
                        className="bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50"
                        data-testid="input-ssh-key-name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="publicKey" className="text-muted-foreground">Public Key</Label>
                      <Textarea
                        id="publicKey"
                        value={newKeyPublic}
                        onChange={(e) => setNewKeyPublic(e.target.value)}
                        placeholder="ssh-rsa AAAA... or ssh-ed25519 AAAA..."
                        className="bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50 font-mono text-xs min-h-[100px]"
                        data-testid="input-ssh-public-key"
                      />
                      <p className="text-xs text-muted-foreground">
                        Paste your public key (usually found in ~/.ssh/id_rsa.pub or ~/.ssh/id_ed25519.pub)
                      </p>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsAddKeyDialogOpen(false);
                        setNewKeyName("");
                        setNewKeyPublic("");
                      }}
                      className="border-white/10 hover:bg-white/5"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddSshKey}
                      disabled={createSshKeyMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="button-submit-ssh-key"
                    >
                      {createSshKeyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add Key
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            {isLoadingSshKeys ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
            ) : sshKeys && sshKeys.length > 0 ? (
              <div className="space-y-3">
                {sshKeys.map((key) => (
                  <div 
                    key={key.id}
                    className="flex items-center justify-between p-4 bg-black/20 rounded-lg border border-white/10"
                    data-testid={`ssh-key-${key.id}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20 shrink-0">
                        <Key className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white truncate" data-testid={`ssh-key-name-${key.id}`}>
                          {key.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {truncateKey(key.publicKey)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-white/5"
                        onClick={() => copyToClipboard(key.publicKey, key.id)}
                        data-testid={`button-copy-key-${key.id}`}
                      >
                        {copiedKeyId === key.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-red-500/10 text-red-400 hover:text-red-300"
                        onClick={() => setKeyToDelete(key)}
                        data-testid={`button-delete-key-${key.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="mb-2">No SSH keys added yet</p>
                <p className="text-sm">Add an SSH key to use when reinstalling your servers</p>
              </div>
            )}
          </GlassCard>
        )}
        
        {/* Delete SSH Key Confirmation */}
        <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
          <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete SSH Key</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the SSH key "{keyToDelete?.name}"? 
                This action cannot be undone. Servers that use this key will no longer accept connections using it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/10 hover:bg-white/5">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => keyToDelete && deleteSshKeyMutation.mutate(keyToDelete.id)}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteSshKeyMutation.isPending}
              >
                {deleteSshKeyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {profile && (
          <div className="flex justify-center gap-6 text-xs text-muted-foreground mt-8">
            <div>
              <span>VirtFusion ID: </span>
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
