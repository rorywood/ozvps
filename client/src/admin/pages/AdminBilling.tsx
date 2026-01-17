import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "../layout/AdminLayout";
import { RefreshCw, Loader2, Play, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

function getCsrfToken(): string {
  return localStorage.getItem('csrfToken') ||
    document.cookie.split('; ').find(c => c.startsWith('ozvps_csrf='))?.split('=')[1] || '';
}

async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
      ...options.headers,
    },
  });
}

interface BillingRecord {
  id: number;
  auth0UserId: string;
  virtfusionServerId: string;
  virtfusionServerUuid?: string;
  planId: number;
  monthlyPriceCents: number;
  status: 'active' | 'paid' | 'unpaid' | 'suspended';
  nextBillAt: string;
  suspendAt?: string | null;
  autoRenew: boolean;
  deployedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface BillingLedgerEntry {
  id: number;
  auth0UserId: string;
  virtfusionServerId?: string;
  amountCents: number;
  description: string;
  idempotencyKey: string;
  createdAt: string;
}

export default function AdminBilling() {
  const queryClient = useQueryClient();

  // State
  const [editingBillingRecord, setEditingBillingRecord] = useState<BillingRecord | null>(null);
  const [billingEditForm, setBillingEditForm] = useState({ nextBillAt: '', status: '', suspendAt: '' });

  // Queries
  const { data: billingRecordsData, isLoading: billingLoading, refetch: refetchBilling } = useQuery<{ records: BillingRecord[] }>({
    queryKey: ['admin', 'billing-records'],
    queryFn: async () => {
      const res = await secureFetch('/api/admin/billing/records');
      if (!res.ok) throw new Error('Failed to fetch billing records');
      return res.json();
    },
  });

  const { data: billingLedgerData, isLoading: ledgerLoading, refetch: refetchLedger } = useQuery<{ ledger: BillingLedgerEntry[] }>({
    queryKey: ['admin', 'billing-ledger'],
    queryFn: async () => {
      const res = await secureFetch('/api/admin/billing/ledger');
      if (!res.ok) throw new Error('Failed to fetch billing ledger');
      return res.json();
    },
  });

  const billingRecords = billingRecordsData?.records || [];
  const billingLedger = billingLedgerData?.ledger || [];

  // Mutations
  const runBillingJobMutation = useMutation({
    mutationFn: async () => {
      const response = await secureFetch('/api/admin/billing/run-job', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to run billing job');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Billing job completed');
      refetchBilling();
      refetchLedger();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateBillingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: { nextBillAt?: string; status?: string; suspendAt?: string | null } }) => {
      const response = await secureFetch(`/api/admin/billing/records/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update billing record');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Billing record updated');
      refetchBilling();
      setEditingBillingRecord(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <AdminLayout title="Admin - Billing">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Billing</h1>
            <p className="text-slate-400 mt-1">{billingRecords.length} billing records</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchBilling(); refetchLedger(); }}
              className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => runBillingJobMutation.mutate()}
              disabled={runBillingJobMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {runBillingJobMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Billing Job
            </Button>
          </div>
        </div>

        {/* Billing Records Table */}
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
          {billingLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            </div>
          ) : billingRecords.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No billing records found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left bg-white/5">
                    <th className="p-4 text-slate-400 font-medium">Server</th>
                    <th className="p-4 text-slate-400 font-medium">User</th>
                    <th className="p-4 text-slate-400 font-medium">Status</th>
                    <th className="p-4 text-slate-400 font-medium">Price</th>
                    <th className="p-4 text-slate-400 font-medium">Next Bill</th>
                    <th className="p-4 text-slate-400 font-medium">Suspend At</th>
                    <th className="p-4 text-slate-400 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRecords.map((record) => (
                    <tr key={record.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-4">
                        <p className="font-medium text-white">Server #{record.virtfusionServerId}</p>
                        {record.virtfusionServerUuid && (
                          <p className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]" title={record.virtfusionServerUuid}>
                            {record.virtfusionServerUuid}
                          </p>
                        )}
                      </td>
                      <td className="p-4 text-slate-400 text-xs font-mono truncate max-w-[150px]" title={record.auth0UserId}>
                        {record.auth0UserId.replace('auth0|', '')}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded ${
                          record.status === 'suspended' ? 'bg-red-500/20 text-red-400' :
                          record.status === 'unpaid' ? 'bg-yellow-500/20 text-yellow-400' :
                          record.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="p-4 text-white">
                        ${(record.monthlyPriceCents / 100).toFixed(2)}/mo
                      </td>
                      <td className="p-4 text-slate-400 text-xs">
                        {format(new Date(record.nextBillAt), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="p-4 text-slate-400 text-xs">
                        {record.suspendAt ? format(new Date(record.suspendAt), 'MMM d, yyyy HH:mm') : '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-white"
                            onClick={() => {
                              setEditingBillingRecord(record);
                              setBillingEditForm({
                                nextBillAt: record.nextBillAt.slice(0, 16),
                                status: record.status,
                                suspendAt: record.suspendAt ? record.suspendAt.slice(0, 16) : '',
                              });
                            }}
                          >
                            Edit
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

        {/* Billing Ledger Section */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Billing Ledger (Charges)</h3>
          {ledgerLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            </div>
          ) : billingLedger.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No billing ledger entries
            </div>
          ) : (
            <div className="rounded-xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left bg-white/5">
                      <th className="p-3 text-slate-400 font-medium">Date</th>
                      <th className="p-3 text-slate-400 font-medium">Server</th>
                      <th className="p-3 text-slate-400 font-medium">Amount</th>
                      <th className="p-3 text-slate-400 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingLedger.slice(-50).reverse().map((entry) => (
                      <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-slate-400 text-xs">
                          {format(new Date(entry.createdAt), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="p-3 text-white">
                          {entry.virtfusionServerId || '-'}
                        </td>
                        <td className="p-3 text-white">
                          ${(entry.amountCents / 100).toFixed(2)}
                        </td>
                        <td className="p-3 text-slate-400 text-xs">
                          {entry.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Billing Edit Dialog */}
      <Dialog open={!!editingBillingRecord} onOpenChange={(open) => !open && setEditingBillingRecord(null)}>
        <DialogContent className="bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" />
              Edit Billing Record
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {editingBillingRecord && (
                <span>
                  Editing billing for Server #{editingBillingRecord.virtfusionServerId}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="billingStatus" className="text-slate-300">Status</Label>
              <select
                id="billingStatus"
                value={billingEditForm.status}
                onChange={(e) => setBillingEditForm(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-white/10 text-white"
              >
                <option value="active" className="bg-slate-800 text-white">Active</option>
                <option value="paid" className="bg-slate-800 text-white">Paid</option>
                <option value="unpaid" className="bg-slate-800 text-white">Unpaid</option>
                <option value="suspended" className="bg-slate-800 text-white">Suspended</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nextBillAt" className="text-slate-300">Next Bill At</Label>
              <Input
                id="nextBillAt"
                type="datetime-local"
                value={billingEditForm.nextBillAt}
                onChange={(e) => setBillingEditForm(prev => ({ ...prev, nextBillAt: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="suspendAt" className="text-slate-300">Suspend At (leave empty to clear)</Label>
              <Input
                id="suspendAt"
                type="datetime-local"
                value={billingEditForm.suspendAt}
                onChange={(e) => setBillingEditForm(prev => ({ ...prev, suspendAt: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingBillingRecord(null)}
              disabled={updateBillingMutation.isPending}
              className="border-white/10 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingBillingRecord) {
                  updateBillingMutation.mutate({
                    id: editingBillingRecord.id,
                    updates: {
                      nextBillAt: billingEditForm.nextBillAt ? new Date(billingEditForm.nextBillAt).toISOString() : undefined,
                      status: billingEditForm.status || undefined,
                      suspendAt: billingEditForm.suspendAt ? new Date(billingEditForm.suspendAt).toISOString() : null,
                    },
                  });
                }
              }}
              disabled={updateBillingMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {updateBillingMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
