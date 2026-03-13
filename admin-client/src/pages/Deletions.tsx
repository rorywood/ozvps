import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useState } from 'react';
import { AlertTriangle, CheckCircle, RotateCcw, Server, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';

export default function Deletions() {
  const queryClient = useQueryClient();
  const [approveServerId, setApproveServerId] = useState<string | null>(null);
  const [recoverServerId, setRecoverServerId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pending-cancellations'],
    queryFn: () => api.get<{ cancellations: any[] }>('/servers/cancellations/pending'),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: (serverId: string) =>
      api.post<{ success: boolean; message: string }>(`/servers/${serverId}/cancellation/approve`),
    onSuccess: () => {
      toast.success('Deletion approved - server will be deleted in 1 hour');
      queryClient.invalidateQueries({ queryKey: ['pending-cancellations'] });
      setApproveServerId(null);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to approve'),
  });

  const recoverMutation = useMutation({
    mutationFn: (serverId: string) =>
      api.post<{ success: boolean; message: string }>(`/servers/${serverId}/cancellation/recover`),
    onSuccess: () => {
      toast.success('Server recovered - deletion request cancelled');
      queryClient.invalidateQueries({ queryKey: ['pending-cancellations'] });
      setRecoverServerId(null);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to recover'),
  });

  const cancellations = data?.cancellations || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pending Deletions</h1>
          <p className="text-white/50 text-sm mt-1">Review and approve or recover server deletion requests</p>
        </div>
        <span className="px-3 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-sm font-medium">
          {cancellations.length} pending
        </span>
      </div>

      {isLoading ? (
        <div className="text-white/50 text-center py-12">Loading...</div>
      ) : cancellations.length === 0 ? (
        <div className="bg-[hsl(216_28%_7%)] border border-white/8 rounded-xl p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="text-white font-medium">No pending deletions</p>
          <p className="text-white/40 text-sm mt-1">All deletion requests have been reviewed</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cancellations.map((c: any) => (
            <div key={c.id} className="bg-[hsl(216_28%_7%)] border border-orange-500/20 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg mt-0.5">
                    <Server className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{c.serverName || `Server #${c.virtfusionServerId}`}</p>
                    <p className="text-white/50 text-sm">ID: {c.virtfusionServerId} · Mode: {c.mode}</p>
                    {c.reason && <p className="text-white/50 text-sm mt-1">Reason: {c.reason}</p>}
                    <div className="flex items-center gap-1.5 mt-2 text-white/40 text-xs">
                      <Clock className="h-3 w-3" />
                      Requested: {new Date(c.requestedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setRecoverServerId(c.virtfusionServerId)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors text-sm font-medium"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Recover
                  </button>
                  <button
                    onClick={() => setApproveServerId(c.virtfusionServerId)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Approve Deletion
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!approveServerId}
        onOpenChange={(o) => !o && setApproveServerId(null)}
        title="Approve Server Deletion"
        description="This will schedule the server for deletion in 1 hour. This action cannot be undone once deletion begins."
        confirmText="Approve Deletion"
        variant="destructive"
        onConfirm={() => approveServerId && approveMutation.mutate(approveServerId)}
        isPending={approveMutation.isPending}
      />

      <ConfirmDialog
        open={!!recoverServerId}
        onOpenChange={(o) => !o && setRecoverServerId(null)}
        title="Recover Server"
        description="This will cancel the deletion request and restore the server to active status."
        confirmText="Recover Server"
        onConfirm={() => recoverServerId && recoverMutation.mutate(recoverServerId)}
        isPending={recoverMutation.isPending}
      />
    </div>
  );
}
