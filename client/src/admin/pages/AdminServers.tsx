import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "../layout/AdminLayout";
import {
  Server, RefreshCw, Loader2, Play, Square, RotateCcw,
  Ban, CheckCircle, Trash2, ArrowRightLeft, Power, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface VFServer {
  id: number;
  name: string;
  hostname: string;
  status: string;
  primaryIp?: string;
  suspended?: boolean;
  owner?: { id: number; email: string; name?: string };
  package?: { name: string };
  hypervisor?: { name: string };
  createdAt?: string;
}

export default function AdminServers() {
  const queryClient = useQueryClient();

  // State
  const [selectedServer, setSelectedServer] = useState<VFServer | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [actionReason, setActionReason] = useState("");
  const [transferUserId, setTransferUserId] = useState("");

  // Queries
  const { data: serversData, isLoading: serversLoading, refetch: refetchServers } = useQuery({
    queryKey: ['admin', 'vf', 'servers'],
    queryFn: async () => {
      const res = await fetch('/api/admin/vf/servers');
      if (!res.ok) throw new Error('Failed to fetch servers');
      return res.json();
    },
  });

  const servers: VFServer[] = serversData?.servers || [];

  // Mutations
  const serverActionMutation = useMutation({
    mutationFn: async (params: { serverId: number; action: string; reason?: string; newOwnerId?: number }) => {
      const { serverId, action, reason, newOwnerId } = params;
      let url = `/api/admin/vf/servers/${serverId}`;
      let method = 'POST';
      const body: Record<string, unknown> = { reason };

      if (action === 'delete') {
        method = 'DELETE';
        url = `/api/admin/vf/servers/${serverId}`;
      } else if (action === 'transfer') {
        url = `/api/admin/vf/servers/${serverId}/transfer`;
        body.newOwnerId = newOwnerId;
      } else if (action === 'suspend') {
        url = `/api/admin/vf/servers/${serverId}/suspend`;
      } else if (action === 'unsuspend') {
        url = `/api/admin/vf/servers/${serverId}/unsuspend`;
      } else {
        url = `/api/admin/vf/servers/${serverId}/power/${action}`;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Action failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Server action completed successfully');
      setActionDialogOpen(false);
      setActionReason("");
      setTransferUserId("");
      setSelectedServer(null);
      refetchServers();
      queryClient.invalidateQueries({ queryKey: ['admin', 'vf', 'stats'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Handlers
  const openActionDialog = (server: VFServer, action: string) => {
    setSelectedServer(server);
    setActionType(action);
    setActionDialogOpen(true);
  };

  const handleActionSubmit = () => {
    if (!selectedServer) return;
    const requiresReason = ['delete', 'suspend', 'transfer'].includes(actionType);
    if (requiresReason && !actionReason.trim()) {
      toast.error('Reason is required for this action');
      return;
    }
    if (actionType === 'transfer' && !transferUserId) {
      toast.error('New owner ID is required');
      return;
    }
    serverActionMutation.mutate({
      serverId: selectedServer.id,
      action: actionType,
      reason: actionReason || undefined,
      newOwnerId: actionType === 'transfer' ? parseInt(transferUserId) : undefined,
    });
  };

  return (
    <AdminLayout title="Admin - Servers">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Servers</h1>
            <p className="text-slate-400 mt-1">{servers.length} servers across all users</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchServers()}
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Servers Table */}
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
          {serversLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No servers found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left bg-white/5">
                    <th className="p-4 text-slate-400 font-medium">Server</th>
                    <th className="p-4 text-slate-400 font-medium">Owner</th>
                    <th className="p-4 text-slate-400 font-medium">Status</th>
                    <th className="p-4 text-slate-400 font-medium">IP</th>
                    <th className="p-4 text-slate-400 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((server) => (
                    <tr key={server.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-4">
                        <p className="font-medium text-white">{server.name}</p>
                        <p className="text-xs text-slate-500">{server.hostname || `ID: ${server.id}`}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-white">{server.owner?.email || 'Unknown'}</p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded ${
                          server.suspended ? 'bg-red-500/20 text-red-400' :
                          server.status === 'running' ? 'bg-green-500/20 text-green-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {server.suspended ? <Ban className="h-3 w-3" /> :
                           server.status === 'running' ? <CheckCircle className="h-3 w-3" /> :
                           <Square className="h-3 w-3" />}
                          {server.suspended ? 'Suspended' : server.status}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 font-mono text-xs">
                        {server.primaryIp || '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          {!server.suspended && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
                                onClick={() => openActionDialog(server, server.status === 'running' ? 'shutdown' : 'boot')}
                                title={server.status === 'running' ? 'Stop' : 'Start'}
                              >
                                {server.status === 'running' ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
                                onClick={() => openActionDialog(server, 'reboot')}
                                title="Restart"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openActionDialog(server, server.suspended ? 'unsuspend' : 'suspend')}
                            title={server.suspended ? 'Unsuspend' : 'Suspend'}
                          >
                            {server.suspended ?
                              <CheckCircle className="h-3.5 w-3.5 text-green-400" /> :
                              <Ban className="h-3.5 w-3.5 text-yellow-400" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
                            onClick={() => openActionDialog(server, 'transfer')}
                            title="Transfer"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => openActionDialog(server, 'delete')}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Server Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {actionType === 'delete' && <Trash2 className="h-5 w-5 text-red-400" />}
              {actionType === 'suspend' && <Ban className="h-5 w-5 text-yellow-400" />}
              {actionType === 'unsuspend' && <CheckCircle className="h-5 w-5 text-green-400" />}
              {actionType === 'transfer' && <ArrowRightLeft className="h-5 w-5 text-blue-400" />}
              {['boot', 'shutdown', 'reboot', 'poweroff'].includes(actionType) && <Power className="h-5 w-5 text-cyan-400" />}
              {actionType.charAt(0).toUpperCase() + actionType.slice(1)} Server
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedServer && (
                <span>
                  Performing <strong className="text-white">{actionType}</strong> on server{' '}
                  <strong className="text-white">{selectedServer.name}</strong>
                  {selectedServer.owner && ` owned by ${selectedServer.owner.email}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {actionType === 'transfer' && (
              <div className="space-y-2">
                <Label htmlFor="newOwnerId" className="text-slate-300">New Owner VirtFusion ID</Label>
                <Input
                  id="newOwnerId"
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  placeholder="Enter VirtFusion user ID"
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            )}

            {['delete', 'suspend', 'transfer'].includes(actionType) && (
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-slate-300">
                  Reason <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  id="reason"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Provide a reason for this action (required for audit)"
                  className="bg-white/5 border-white/10 text-white min-h-[80px]"
                />
              </div>
            )}

            {actionType === 'delete' && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  This action is irreversible. The server will be permanently deleted.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialogOpen(false)}
              className="border-white/10 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleActionSubmit}
              disabled={serverActionMutation.isPending}
              className={actionType === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {serverActionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm {actionType.charAt(0).toUpperCase() + actionType.slice(1)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
