import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "../layout/AdminLayout";
import {
  Users, RefreshCw, Loader2, Plus, Minus, Link, Unlink,
  CheckCircle2, Mail, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface VFUser {
  virtfusionId: number | null;
  auth0UserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  virtfusionLinked: boolean;
  status: 'active' | 'deleted';
  serverCount: number;
  balanceCents: number;
  stripeCustomerId?: string;
  created: string;
}

export default function AdminUsers() {
  const queryClient = useQueryClient();

  // State
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<"add" | "remove">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<VFUser | null>(null);

  // Queries
  const { data: vfUsersData, isLoading: vfUsersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin', 'vf', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
  });

  const vfUsers: VFUser[] = (vfUsersData?.users || []).filter((u: VFUser) => u.status === 'active');

  // Mutations
  const adjustMutation = useMutation({
    mutationFn: async (data: { auth0UserId: string; amountCents: number; reason: string }) => {
      const response = await fetch('/api/admin/wallet/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Adjustment failed');
      }
      return response.json();
    },
    onSuccess: () => {
      setAdjustDialogOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      setSelectedUser(null);
      toast.success('Credit adjustment applied');
      queryClient.invalidateQueries({ queryKey: ['admin', 'vf', 'users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Handlers
  const handleUserRowAdjust = (user: VFUser, type: "add" | "remove") => {
    setSelectedUser(user);
    setAdjustType(type);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustDialogOpen(true);
  };

  const handleAdjustSubmit = () => {
    if (!selectedUser || !adjustAmount || !adjustReason) return;
    const amountDollars = parseFloat(adjustAmount);
    if (isNaN(amountDollars) || amountDollars <= 0) return;
    const amountCents = Math.round(amountDollars * 100) * (adjustType === "remove" ? -1 : 1);
    adjustMutation.mutate({
      auth0UserId: selectedUser.auth0UserId,
      amountCents,
      reason: adjustReason,
    });
  };

  const handleVerifyEmail = async (user: VFUser) => {
    const csrfToken = localStorage.getItem('csrfToken') ||
      document.cookie.split('; ').find(c => c.startsWith('ozvps_csrf='))?.split('=')[1] || '';

    try {
      const res = await fetch('/api/admin/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ auth0UserId: user.auth0UserId }),
      });

      if (res.ok) {
        toast.success('Email verified for ' + user.email);
        refetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to verify');
      }
    } catch (err: any) {
      toast.error('Request failed: ' + err.message);
    }
  };

  return (
    <AdminLayout title="Admin - Users">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Users</h1>
            <p className="text-slate-400 mt-1">{vfUsers.length} active users</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchUsers()}
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Users Table */}
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
          {vfUsersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            </div>
          ) : vfUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No users found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left bg-white/5">
                    <th className="p-4 text-slate-400 font-medium">User</th>
                    <th className="p-4 text-slate-400 font-medium">Email Status</th>
                    <th className="p-4 text-slate-400 font-medium">VirtFusion</th>
                    <th className="p-4 text-slate-400 font-medium">Servers</th>
                    <th className="p-4 text-slate-400 font-medium">Balance</th>
                    <th className="p-4 text-slate-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vfUsers.map((user, idx) => (
                    <tr key={user.auth0UserId || idx} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-4">
                        <p className="font-medium text-white">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="p-4">
                        {user.emailVerified ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center h-7 px-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors"
                            onClick={() => handleVerifyEmail(user)}
                            title="Verify email on user's behalf"
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            Verify
                          </button>
                        )}
                      </td>
                      <td className="p-4">
                        {user.virtfusionLinked ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <Link className="h-3 w-3" />
                            ID: {user.virtfusionId}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Unlink className="h-3 w-3" />
                            Not linked
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-white">
                        {user.serverCount}
                      </td>
                      <td className="p-4">
                        <span className={`font-medium font-mono ${user.balanceCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${(user.balanceCents / 100).toFixed(2)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                            onClick={() => handleUserRowAdjust(user, "add")}
                            title="Add credits"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => handleUserRowAdjust(user, "remove")}
                            title="Remove credits"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Adjust Credits Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <DollarSign className="h-5 w-5 text-amber-400" />
              {adjustType === "add" ? "Add Credits" : "Remove Credits"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {adjustType === "add"
                ? "Add credits to the user's wallet."
                : "Remove credits from the user's wallet."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">User</Label>
              <p className="text-sm text-white">{selectedUser?.email}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-slate-300">Amount (AUD)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-slate-300">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for adjustment..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} className="border-white/10 text-slate-300">
              Cancel
            </Button>
            <Button
              onClick={handleAdjustSubmit}
              disabled={!adjustAmount || !adjustReason || adjustMutation.isPending}
              className={adjustType === "add" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {adjustMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {adjustType === "add" ? "Add Credits" : "Remove Credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
