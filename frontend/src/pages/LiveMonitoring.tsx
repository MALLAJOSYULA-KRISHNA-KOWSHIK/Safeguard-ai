import { useEffect, useState } from 'react';
import useViolationsStore from '../store/violationsStore';
import useDashboardStore from '../store/dashboardStore';
import { usePolling } from '../hooks/usePolling';
import { getSocket } from '../lib/socket';
import api from '../lib/api';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface PendingApproval {
  token: string;
  worker_id: string;
  worker_name: string;
  missing_items: string[];
  detected_ppe: string[];
}

const LiveMonitoring = () => {
  const violations = useViolationsStore((state) => state.liveFeed);
  const stats = useDashboardStore((state) => state);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socket.on('violation_detected', (data) => {
      useViolationsStore.getState().addViolation(data);
    });
    socket.on('dashboard_stats', (data) => {
      useDashboardStore.getState().setStats(data);
    });
    socket.on('ppe_approval_needed', (data: PendingApproval) => {
      setPendingApprovals((prev) => [...prev, data]);
    });
    
    socket.emit('subscribe_live', {});
    return () => {
      socket.off('violation_detected');
      socket.off('dashboard_stats');
      socket.off('ppe_approval_needed');
    };
  }, []);

  usePolling(async () => {
    try {
      const res = await api.get('/analytics/dashboard/stats/');
      if (res.data?.data) {
        useDashboardStore.getState().setStats(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  }, 10000);

  const handleResolveApproval = async (token: string, action: 'approve' | 'reject') => {
    try {
      await api.post('/kiosk/resolve-approval', { token, action });
      setPendingApprovals((prev) => prev.filter(p => p.token !== token));
    } catch (err) {
      console.error('Error resolving approval:', err);
      alert('Failed to resolve approval');
    }
  };

  return (
    <div className="space-y-6 font-sans text-gray-900">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Violations Today</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{stats.totalViolationsToday}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Compliance Rate</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{stats.complianceRate}%</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">High Risk Zones</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{stats.highRiskCount}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Resolved</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{stats.resolvedCount}</div>
        </div>
      </div>

      {pendingApprovals.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Action Required: Pending Approvals
          </h3>
          {pendingApprovals.map(approval => (
            <div key={approval.token} className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-red-900 font-bold text-lg">{approval.worker_name} ({approval.worker_id})</p>
                <div className="mt-2 flex gap-4">
                  <p className="text-red-700 font-medium text-sm">
                    <span className="font-bold">Missing:</span> {approval.missing_items.join(', ').replace(/_/g, ' ')}
                  </p>
                  {approval.detected_ppe && approval.detected_ppe.length > 0 && (
                    <p className="text-green-700 font-medium text-sm">
                      <span className="font-bold">Detected:</span> {approval.detected_ppe.join(', ').replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
                <p className="text-red-600 text-xs mt-2">Worker is waiting at the kiosk for approval.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleResolveApproval(approval.token, 'approve')}
                  className="flex items-center gap-1 rounded-md bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 transition-colors shadow-sm"
                >
                  <CheckCircle className="h-4 w-4" /> Allow
                </button>
                <button
                  onClick={() => handleResolveApproval(approval.token, 'reject')}
                  className="flex items-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors shadow-sm"
                >
                  <XCircle className="h-4 w-4" /> Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-lg font-bold tracking-tight text-gray-900 border-b border-gray-100 pb-4">Live Violation Feed</div>
        <div className="space-y-4">
          {violations.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
              Waiting for live events...
            </div>
          ) : (
            violations.slice(0, 6).map((violation) => (
              <div key={violation.id} className="rounded-md border border-gray-200 bg-gray-50 p-4 transition-colors hover:bg-gray-100 shadow-sm">
                <div className="flex items-center justify-between text-sm font-medium text-gray-600">
                  <span className="capitalize">{violation.ppe_type.replace('_', ' ')}</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${violation.status === 'open' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>{violation.status}</span>
                </div>
                <div className="mt-2 text-lg font-bold text-gray-900">Camera {violation.camera_id}</div>
                <div className="mt-1 text-sm text-gray-500">{violation.zone}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveMonitoring;