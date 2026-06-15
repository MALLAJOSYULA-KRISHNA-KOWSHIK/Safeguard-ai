import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  AlertTriangle,
  HardHat,
  LogOut,
  RefreshCw,
  CheckCircle2,
  Activity,
  Map,
  ClipboardList,
  Trophy,
  FileBarChart,
  Settings,
  Download,
  XCircle,
  Trash2
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { usePolling } from '../hooks/usePolling';
import { getSocket } from '../lib/socket';
import api from '../lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ComplianceReports from './ComplianceReports';

const TODAY = new Date().toISOString().split('T')[0];

// ── Types ──────────────────────────────────────────────────────────────────
interface Violation {
  id: string;
  worker_name: string;
  violation_type: string;
  ppe_type: string;
  severity: string;
  timestamp: string;
  status: string;
  zone?: string;
  camera_id?: string;
}

interface AttendanceRecord {
  id: string;
  worker_name: string;
  worker_code: string;
  check_in: string | null;
  check_out: string | null;
  status?: string;
  image_url?: string | null;
}

interface Worker {
  id: string;
  worker_id: string;
  name: string;
  department: string;
  is_active: boolean;
  compliance_rate?: number;
  zone_name?: string | null;
}

interface LeaderboardEntry {
  id: string;
  worker_id: string;
  name: string;
  compliance_rate: number;
  total_shifts: number;
  department: string;
}

interface PPECount {
  ppe_type: string;
  count: number;
}

interface PendingApproval {
  token: string;
  worker_id: string;
  worker_name: string;
  supervisor_id: number | null;
  zone_id: number | null;
  missing_items: string[];
  detected_ppe: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string) {
  const parts = name.trim().split(' ');
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

function avatarColor(id: string) {
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % colors.length;
  return colors[h];
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border border-red-200',
  high: 'bg-orange-50 text-orange-700 border border-orange-200',
  medium: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  low: 'bg-green-50 text-green-700 border border-green-200',
};

const SupervisorDashboard = () => {
  const navigate = useNavigate();
  const { accessToken: token, name, zone_id, clearAuth, supervisor_id } = useAuthStore();

  const [activeTab, setActiveTab] = useState('live');
  const [stats, setStats] = useState({ totalViolationsToday: 0, complianceRate: 100, highRiskCount: 0, resolvedCount: 0 });
  const [violations, setViolations] = useState<Violation[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [ppeCounts, setPpeCounts] = useState<PPECount[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [denyNote, setDenyNote] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<{ id: number; name: string; risk_level: string, required_ppe?: string }[]>([]);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editForm, setEditForm] = useState({ name: '', department: '', is_active: true });

  // Settings Toggles
  const [ppeRequirements, setPpeRequirements] = useState({
    helmet: true,
    vest: true,
    gloves: true,
    goggles: false,
    mask: true,
  });
  const [activeZone, setActiveZone] = useState(zone_id ? String(zone_id) : '1');

  useEffect(() => {
    if (activeZone && zones.length > 0) {
      const zone = zones.find(z => String(z.id) === activeZone);
      if (zone && zone.required_ppe) {
        try {
          const reqArray = JSON.parse(zone.required_ppe);
          setPpeRequirements({
            helmet: reqArray.includes('helmet'),
            vest: reqArray.includes('vest'),
            gloves: reqArray.includes('glove'),
            goggles: reqArray.includes('goggles'),
            mask: reqArray.includes('mask'),
          });
        } catch(e) {
          console.error("Failed to parse zone required_ppe", e);
        }
      }
    }
  }, [activeZone, zones]);

  // Search filter for workers
  const [workerSearch, setWorkerSearch] = useState('');

  // Socket Live Events
  const [liveEvents, setLiveEvents] = useState<Violation[]>([]);

  const zid = zone_id ?? '';

  const currentZoneObj = zones.find(z => String(z.id) === String(activeZone) || String(z.id) === String(zone_id));
  const currentRiskLevel = currentZoneObj?.risk_level?.toLowerCase() || 'low';

  let dotColorClass = 'bg-green-500';
  let badgeText = '';
  let badgeClass = '';

  if (currentRiskLevel === 'high') {
    dotColorClass = 'bg-red-500 animate-pulse';
    badgeText = 'HIGH RISK';
    badgeClass = 'rounded bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider';
  } else if (currentRiskLevel === 'medium') {
    dotColorClass = 'bg-amber-500';
    badgeText = 'MEDIUM RISK';
    badgeClass = 'rounded bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider';
  }

  const loadData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      // Fetch stats
      const statsRes = await api.get(`/analytics/dashboard/stats/?zone_id=${zid}`).catch(() => null);
      if (statsRes?.data?.data) {
        setStats(statsRes.data.data);
      } else {
        setStats({
          totalViolationsToday: 0,
          complianceRate: 100,
          highRiskCount: 0,
          resolvedCount: 0
        });
      }

      // Fetch workers
      const workersRes = await api.get('/workers').catch(() => null);
      const fetchedWorkers: Worker[] = workersRes?.data?.data ?? [];
      setWorkers(fetchedWorkers);

      // Fetch violations
      const vioRes = await api.get(`/violations/?zone_id=${zid}&resolved=false`).catch(() => null);
      setViolations(vioRes?.data?.data ?? []);

      // Fetch attendance
      const supIdParam = supervisor_id ? `&supervisor_id=${supervisor_id}` : '';
      const attRes = await api.get(`/attendance?zone_id=${zid}${supIdParam}`).catch(() => null);
      setAttendance(attRes?.data?.data?.records ?? []);

      // Fetch leaderboard
      const leadRes = await api.get(`/analytics/leaderboard/?zone_id=${zid}`).catch(() => null);
      setLeaderboard(leadRes?.data?.data?.workers ?? []);

      // Fetch PPE stats
      const ppeRes = await api.get(`/violations/?zone_id=${zid}&group_by=ppe_type`).catch(() => null);
      setPpeCounts(ppeRes?.data?.data ?? []);

      // Fetch zones
      const zonesRes = await api.get('/settings/zones').catch(() => null);
      if (Array.isArray(zonesRes?.data)) {
        setZones(zonesRes.data);
      }

    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [zid]);

  useEffect(() => {
    loadData();

    // Socket.io initialization for live events
    const socket = getSocket();
    
    const handleConnect = () => {
      const supId = supervisor_id ?? useAuthStore.getState().supervisor_id;
      console.log('Socket connected. Joining supervisor room with ID:', supId);
      if (supId) {
        socket.emit('join_supervisor_room', { supervisor_id: supId });
      }
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on('connect', handleConnect);

    // Decode supervisor ID from JWT token
    let mySupId: number | null = null;
    try {
      if (token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        mySupId = Number(payload.sub);
      }
    } catch (e) {
      console.error('Failed to parse JWT for supervisor ID:', e);
    }

    const onViolation = (data: Violation) => {
      setLiveEvents(prev => [data, ...prev].slice(0, 10));
      // update stats count
      setStats(prev => ({ ...prev, totalViolationsToday: prev.totalViolationsToday + 1 }));
    };

    const onApprovalNeeded = (data: PendingApproval) => {
      console.log('Received ppe_approval_needed:', data);
      setPendingApprovals((prev) => [...prev, data]);
    };

    socket.on('violation_detected', onViolation);
    socket.on('ppe_approval_needed', onApprovalNeeded);

    return () => {
      socket.off('violation_detected', onViolation);
      socket.off('ppe_approval_needed', onApprovalNeeded);
    };
  }, [loadData, token, zone_id]);

  usePolling(() => {
    loadData(true);
  }, 10000);

  const handleExportAttendancePDF = () => {
    const doc = new jsPDF();
    doc.text('Attendance Log', 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [['Worker', 'Badge ID', 'Check In', 'Check Out', 'Status']],
      body: attendance.map(r => [
        r.worker_name,
        r.worker_code,
        fmtTime(r.check_in),
        r.check_out ? fmtTime(r.check_out) : '—',
        r.status === 'Present' || (r.check_in && new Date(r.check_in).getHours() < 9) ? 'On Time' : 'Late'
      ]),
    });
    doc.save('attendance_log.pdf');
  };

  const handleExportLeaderboardPDF = () => {
    const doc = new jsPDF();
    doc.text('Safety Leaderboard', 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [['Rank', 'Worker', 'Compliance Rate', 'Total Shifts']],
      body: leaderboard.map((item, index) => [
        index + 1,
        item.name,
        `${item.compliance_rate}%`,
        item.total_shifts,
      ]),
    });
    doc.save('safety_leaderboard.pdf');
  };

  const handleDeleteAttendance = async (id: string) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    try {
      await api.delete(`/attendance/${id}`);
      setAttendance(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to delete attendance', err);
      alert('Failed to delete attendance record.');
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const resolveViolation = async (id: string) => {
    try {
      await api.put(`/violations/${id}`, { status: 'resolved' });
      setViolations(prev => prev.filter(v => v.id !== id));
      setStats(prev => ({
        ...prev,
        resolvedCount: prev.resolvedCount + 1,
        totalViolationsToday: Math.max(0, prev.totalViolationsToday - 1)
      }));
    } catch (err) {
      console.error('Failed to resolve violation:', err);
    }
  };

  const handleEditWorker = (worker: Worker) => {
    setEditingWorker(worker);
    setEditForm({
      name: worker.name,
      department: worker.department,
      is_active: worker.is_active,
    });
  };

  const handleSaveWorker = async () => {
    if (!editingWorker) return;
    try {
      const res = await api.put(`/workers/${editingWorker.id}`, {
        name: editForm.name,
        department: editForm.department,
        is_active: editForm.is_active,
      });
      if (res.data) {
        loadData(true);
        setEditingWorker(null);
      }
    } catch (err) {
      console.error('Failed to update worker:', err);
      alert('Failed to update worker details. Please try again.');
    }
  };

  const resolveAllViolations = async () => {
    if (violations.length === 0) return;
    if (!confirm('Resolve all open violations in your zone?')) return;
    try {
      await Promise.all(violations.map(v => api.put(`/violations/${v.id}`, { status: 'resolved' })));
      setStats(prev => ({
        ...prev,
        resolvedCount: prev.resolvedCount + violations.length,
        totalViolationsToday: 0
      }));
      setViolations([]);
    } catch (err) {
      console.error('Failed to resolve all violations:', err);
    }
  };

  // Export PDF Report
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PPE Safety Compliance Report — SafeGuard AI', 14, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 23);

    autoTable(doc, {
      startY: 28,
      head: [['Metric', 'Value']],
      body: [
        ['Total Open Violations', stats.totalViolationsToday],
        ['Safety Compliance Rate', `${stats.complianceRate}%`],
        ['Resolved Incidents', stats.resolvedCount],
        ['Risk Zones Active', stats.highRiskCount]
      ],
      headStyles: { fillColor: [30, 64, 175] },
      bodyStyles: { fontSize: 10 }
    });

    doc.save(`safeguard-ai-supervisor-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Render Helpers ────────────────────────────────────────────────────────
  const renderSidebar = () => {
    const navItems = [
      { id: 'live', label: 'Live', icon: Activity },
      { id: 'violations', label: 'Violations', icon: AlertTriangle },
      { id: 'workers', label: 'Workers', icon: Users },
      { id: 'attendance', label: 'Attendance', icon: ClipboardList },
      { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
      { id: 'reports', label: 'Reports', icon: FileBarChart },
      { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
      <aside className="flex md:w-64 w-20 shrink-0 flex-col border-r border-gray-200 bg-white p-5 shadow-sm z-10 select-none">
        {/* Logo */}
        <div className="mb-10 text-xl font-bold text-gray-900 tracking-tight flex items-center justify-center md:justify-start gap-2.5">
          <ShieldCheck className="h-6.5 w-6.5 text-blue-600 animate-pulse" />
          <span className="hidden md:inline font-bold">SafeGuard AI</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center justify-center md:justify-start gap-3.5 rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]
                  ${isActive
                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-6 flex w-full items-center justify-center md:justify-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all shadow-sm active:scale-95"
        >
          <LogOut className="h-5 w-5" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </aside>
    );
  };

  const renderStatsRow = () => {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Violations Today Card */}
        <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100 transition-transform duration-200 hover:-translate-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Violations Today</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900">{stats.totalViolationsToday}</span>
            {stats.totalViolationsToday > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Action Req</span>
            )}
          </div>
        </div>

        {/* Compliance Rate Card */}
        <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100 transition-transform duration-200 hover:-translate-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Compliance Rate</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900">{stats.complianceRate}%</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              stats.complianceRate >= 90 ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
            }`}>
              {stats.complianceRate >= 90 ? 'Excellent' : 'Needs Focus'}
            </span>
          </div>
        </div>

        {/* Resolved Card */}
        <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100 transition-transform duration-200 hover:-translate-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Resolved</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900">{stats.resolvedCount}</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">Completed</span>
          </div>
        </div>
      </div>
    );
  };

  const handleResolveApproval = async (token: string, action: 'approve' | 'reject') => {
    try {
      await api.post('/kiosk/resolve-approval', { 
        token, 
        action,
        note: action === 'reject' ? (denyNote[token] || '') : ''
      });
      setPendingApprovals((prev) => prev.filter(p => p.token !== token));
      loadData(true); // refresh stats
    } catch (err) {
      console.error('Error resolving approval:', err);
      alert('Failed to resolve approval');
    }
  };

  const renderActiveContent = () => {
    if (loading) {
      return (
        <div className="flex h-64 items-center justify-center flex-col gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-semibold text-gray-500">Synchronizing with SafeGuard AI backend...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'live':
        return (
          <div className="space-y-6">
            {renderStatsRow()}

            {/* Pending Approvals (Removed inline section, now floating) */}

            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-ping" />
                  Live Incident Stream
                </h3>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Real-time alerts</span>
              </div>
              <div className="space-y-4">
                {liveEvents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                    <Activity className="h-8 w-8 text-gray-300 mx-auto mb-2.5 animate-pulse" />
                    Waiting for live events...
                  </div>
                ) : (
                  liveEvents.map((violation) => (
                    <div key={violation.id} className="rounded-lg border border-red-100 bg-red-50/30 p-4 flex items-center justify-between hover:bg-red-50/50 transition-colors">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-900">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <span>{violation.worker_name} missing {violation.ppe_type.replace('_', ' ')}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Zone: {violation.zone ?? 'Zone A'} | Camera: {violation.camera_id ?? 'Cam-01'}</p>
                      </div>
                      <span className="text-xs font-bold text-red-600 bg-red-100/50 px-2 py-0.5 rounded-full capitalize">{violation.severity}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );

      case 'violations':
        return (
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Open Violations Log</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Filter and manage open incidents in your active zones</p>
                </div>
                {violations.length > 0 && (
                  <button
                    onClick={resolveAllViolations}
                    className="rounded-lg bg-green-50 border border-green-200 text-green-700 px-4 py-2 text-xs font-bold transition-all hover:bg-green-100/80 active:scale-95 shadow-sm"
                  >
                    Resolve All
                  </button>
                )}
              </div>
              
              {violations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  All clear! No open violations in your zone.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        <th className="px-4 py-3">Worker</th>
                        <th className="px-4 py-3">PPE Violation</th>
                        <th className="px-4 py-3">Severity</th>
                        <th className="px-4 py-3">Zone</th>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {violations.map((v) => (
                        <tr key={v.id} className="hover:bg-gray-55 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900">{v.worker_name}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 text-xs font-semibold">
                              {String(v.violation_type || v.ppe_type || 'Unknown').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${SEV_COLORS[v.severity?.toLowerCase()] ?? 'bg-gray-100 text-gray-600'}`}>
                              {v.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 font-medium">{v.zone ?? 'Zone A'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{timeAgo(v.timestamp)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => resolveViolation(v.id)}
                              className="rounded-lg bg-blue-50 border border-blue-100 text-blue-600 px-3 py-1.5 text-xs font-bold hover:bg-blue-100/70 transition-all"
                            >
                              Resolve
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );

      case 'heatmap':
        return (
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h3 className="text-base font-bold text-gray-900">Zone Grid Heatmap</h3>
                <p className="text-xs text-gray-500 mt-0.5">Real-time risk intensity indicator by site sectors</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: 'Zone A - Main Gate', risk: 'low', rate: 98, color: 'bg-green-500' },
                  { name: 'Zone B - Excavation', risk: 'high', rate: 76, color: 'bg-red-500' },
                  { name: 'Zone C - Scaffolding', risk: 'medium', rate: 84, color: 'bg-amber-500' },
                  { name: 'Zone D - Material Stockyard', risk: 'low', rate: 94, color: 'bg-green-500' },
                  { name: 'Zone E - Electrical Room', risk: 'low', rate: 99, color: 'bg-green-500' },
                  { name: 'Zone F - Roofing Area', risk: 'high', rate: 71, color: 'bg-red-500' },
                ].map((zone) => (
                  <div key={zone.name} className="relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-800">{zone.name}</span>
                      <span className={`inline-block h-3 w-3 rounded-full ${zone.color}`} />
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 uppercase font-semibold">Compliance</p>
                        <p className="text-lg font-extrabold text-gray-900 mt-0.5">{zone.rate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400 uppercase font-semibold">Risk Level</p>
                        <p className="text-xs font-bold uppercase mt-1 capitalize text-gray-700">{zone.risk}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'workers':
        const filteredWorkers = workers.filter(w =>
          w.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
          w.worker_id.toLowerCase().includes(workerSearch.toLowerCase())
        );

        return (
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Personnel Roster</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Track status and PPE compliance rates for workers</p>
                </div>
                <input
                  type="text"
                  placeholder="Search by name or ID…"
                  value={workerSearch}
                  onChange={e => setWorkerSearch(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs font-medium focus:border-blue-500 focus:outline-none w-full sm:w-64"
                />
              </div>

              {filteredWorkers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  No registered workers found.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredWorkers.map((w) => (
                    <div key={w.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-full text-white text-sm font-bold uppercase shadow-inner ${avatarColor(w.worker_id)}`}>
                          {initials(w.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-gray-900 truncate">{w.name}</h4>
                          <p className="text-xs font-mono text-gray-400 mt-0.5">{w.worker_id}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          w.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {w.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="mt-5 pt-4 border-t border-gray-50 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Compliance Rate</p>
                          <p className="text-base font-bold text-gray-800 mt-0.5">{w.compliance_rate ?? 100}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400 font-semibold uppercase">Zone Area</p>
                          <p className="text-xs font-bold text-gray-700 mt-1">{w.zone_name ?? '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'attendance':
        return (
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Attendance Log</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Verification logs for kiosk checking entries</p>
                </div>
                {attendance.length > 0 && (
                  <button
                    onClick={handleExportAttendancePDF}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>
                )}
              </div>

              {attendance.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  No attendance records found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        <th className="px-4 py-3">Face</th>
                        <th className="px-4 py-3">Worker</th>
                        <th className="px-4 py-3">Badge ID</th>
                        <th className="px-4 py-3">Check In</th>
                        <th className="px-4 py-3">Check Out</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {attendance.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            {r.image_url ? (
                              <img src={`http://localhost:8000${r.image_url}`} alt="Face" className="h-10 w-10 rounded-md object-cover border border-gray-200 shadow-sm" />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase">N/A</div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{r.worker_name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.worker_code}</td>
                          <td className="px-4 py-3 text-gray-700 font-medium">{fmtTime(r.check_in)}</td>
                          <td className="px-4 py-3 text-gray-700 font-medium">{r.check_out ? fmtTime(r.check_out) : '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              r.status === 'Present' || (r.check_in && new Date(r.check_in).getHours() < 9) ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {r.status === 'Present' || (r.check_in && new Date(r.check_in).getHours() < 9) ? 'On Time' : 'Late'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => handleDeleteAttendance(r.id)} className="text-red-500 hover:text-red-700 transition-colors p-1.5 rounded-md hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );

      case 'leaderboard':
        return (
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Zone Safety Leaderboard</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Top performing compliant workers ranking</p>
                </div>
                {leaderboard.length > 0 && (
                  <button
                    onClick={handleExportLeaderboardPDF}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>
                )}
              </div>

              {leaderboard.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  No leaderboard statistics available.
                </div>
              ) : (
                <div className="space-y-4">
                  {leaderboard.map((item, index) => {
                    const score = item.compliance_rate;
                    const barColor = score >= 90 ? 'bg-green-500' : score >= 80 ? 'bg-blue-500' : 'bg-amber-500';
                    return (
                      <div key={item.id} className="flex items-center gap-4 rounded-xl border border-gray-50 bg-gray-50/40 p-4 hover:shadow-sm transition-shadow">
                        <span className="w-8 text-center text-lg font-bold text-gray-400">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-bold text-gray-900 capitalize">{item.name}</span>
                            <span className="text-sm font-extrabold text-blue-600">{score}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${score}%` }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="block text-xs font-bold text-gray-400 uppercase">Shifts</span>
                          <span className="text-sm font-bold text-gray-700">{item.total_shifts}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      case 'reports':
        return (
          <div className="space-y-6">
            <ComplianceReports />
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h3 className="text-base font-bold text-gray-900">Supervisor Portal Configuration</h3>
                <p className="text-xs text-gray-500 mt-0.5">Customize enforcement options and check-in parameters</p>
              </div>

              <div className="space-y-6 max-w-xl">
                {/* Active Zone selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">My Supervised Zone</label>
                  <select
                    value={activeZone}
                    onChange={e => setActiveZone(e.target.value)}
                    disabled={true}
                    className="w-full rounded-lg border border-gray-250 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none shadow-sm cursor-not-allowed opacity-80"
                  >
                    {zones.length === 0 ? (
                      <option value="">Loading zones...</option>
                    ) : (
                      zones.filter(z => String(z.id) === String(zone_id)).map(z => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* PPE Requirements toggles */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Enforced PPE Checklist</label>
                  <div className="space-y-2">
                    {[
                      { key: 'helmet', label: 'Safety Helmet' },
                      { key: 'vest', label: 'Reflective Safety Vest' },
                      { key: 'gloves', label: 'Protective Gloves' },
                      { key: 'goggles', label: 'Safety Goggles' },
                      { key: 'mask', label: 'Dust Protection Mask' },
                    ].map((item) => (
                      <label key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-gray-50 bg-gray-50/50 cursor-pointer select-none hover:bg-gray-50 transition-colors">
                        <span className="text-xs font-bold text-gray-700">{item.label}</span>
                        <input
                          type="checkbox"
                          checked={ppeRequirements[item.key as keyof typeof ppeRequirements]}
                          onChange={(e) => setPpeRequirements(prev => ({ ...prev, [item.key]: e.target.checked }))}
                          className="h-4.5 w-4.5 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={async () => {
                    if (!activeZone) return;
                    const selectedPPE = Object.entries(ppeRequirements)
                      .filter(([_, isRequired]) => isRequired)
                      .map(([key, _]) => {
                        if (key === 'gloves') return 'glove';
                        return key;
                      });
                    
                    try {
                      await api.patch(`/settings/zones/${activeZone}`, {
                        required_ppe: selectedPPE
                      });
                      alert('Settings saved successfully');
                      loadData(true);
                    } catch (err) {
                      console.error('Failed to save PPE settings', err);
                      alert('Failed to save configuration');
                    }
                  }}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
                >
                  Save Configuration
                </button>
              </div>
            </div>

            {/* Zone Workers table card */}
            <div className="rounded-xl bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="mb-6 border-b border-gray-100 pb-4">
                <h3 className="text-base font-bold text-gray-900">Zone Workers</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Manage details and status of workers in your supervised zone</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Worker</th>
                      <th className="pb-3 font-semibold font-mono">ID</th>
                      <th className="pb-3 font-semibold">Department</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700 font-semibold">
                    {workers.map((worker) => (
                      <tr key={worker.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="py-3.5 font-bold text-gray-900">{worker.name}</td>
                        <td className="py-3.5 font-mono text-gray-500">{worker.worker_id}</td>
                        <td className="py-3.5 text-gray-500">{worker.department || '—'}</td>
                        <td className="py-3.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            worker.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {worker.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <button
                            onClick={() => handleEditWorker(worker)}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition-colors"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                    {workers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400 font-semibold">
                          No workers assigned to this zone
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900 font-sans">
      {renderSidebar()}
      <main className="flex-1 overflow-auto p-6 md:p-8 space-y-6">
        {/* Top welcome banner */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Supervisor Control Centre</h1>
            <p className="text-sm font-semibold text-gray-400">Zone Operations & Worker Safety Management Dashboard</p>
          </div>
          <div className="flex items-center gap-2.5 bg-white border border-gray-150 rounded-lg px-4 py-2 shadow-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${dotColorClass}`} />
            <span className="text-xs font-bold text-gray-700 capitalize flex items-center gap-1.5">
              Supervisor: {name ?? 'Operator'}
              {currentZoneObj ? ` (${currentZoneObj.name})` : ''}
              {badgeText && (
                <span className={badgeClass}>
                  {badgeText}
                </span>
              )}
            </span>
          </div>
        </div>

        {renderActiveContent()}
      </main>

      {/* Edit Worker Modal Overlay */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="mb-4 border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Edit Worker</h3>
              <p className="text-xs text-gray-450 mt-0.5 font-medium">Updating details for {editingWorker.name} ({editingWorker.worker_id})</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-250 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Department</label>
                <input
                  type="text"
                  value={editForm.department}
                  onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-250 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-gray-50 bg-gray-50/50">
                <div>
                  <p className="text-xs font-bold text-gray-700">Active Status</p>
                  <p className="text-[10px] text-gray-400 font-medium">Allows checking in at kiosks</p>
                </div>
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="h-4.5 w-4.5 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setEditingWorker(null)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWorker}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Requests Panel — fixed bottom right */}
      {pendingApprovals.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-96">
          {pendingApprovals.map(req => (
            <div key={req.token} className="bg-white rounded-xl shadow-2xl border border-red-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold text-red-700 text-sm">PPE Violation — Entry Request</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Worker: {req.worker_name}</p>
              <p className="text-sm text-gray-600 mt-1">
                Missing: {req.missing_items.map(i => 
                  i.charAt(0).toUpperCase() + i.slice(1)
                ).join(', ')}
              </p>
              <textarea
                placeholder="Denial reason (optional)"
                value={denyNote[req.token] || ''}
                onChange={e => setDenyNote(p => ({ ...p, [req.token]: e.target.value }))}
                className="mt-3 w-full rounded-md border border-gray-200 px-3 py-2 text-xs resize-none h-14 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleResolveApproval(req.token, 'approve')}
                  className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors shadow-sm"
                >
                  ✅ Allow Entry
                </button>
                <button
                  onClick={() => handleResolveApproval(req.token, 'reject')}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors shadow-sm"
                >
                  ❌ Deny Entry
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default SupervisorDashboard;
