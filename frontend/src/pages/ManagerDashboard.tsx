import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Video, Upload, CheckCircle2, ScanFace, Hourglass, ShieldCheck, LogOut, Users, Map, Shield } from 'lucide-react';
import api from '../lib/api';
import { usePolling } from '../hooks/usePolling';
import useAuthStore from '../store/authStore';

const BASE_SETTINGS = 'http://localhost:8000/api/settings';

// ── Types ──────────────────────────────────────────────────────────────────
interface Worker {
  id: string;
  worker_id: string;
  name: string;
  department: string;
  email: string;
  language: string;
  is_active: boolean;
  compliance_rate: number;
  has_face: boolean;
  zone_id: number | null;
  zone_name: string | null;
  supervisor_id: number | null;
  supervisor_name: string | null;
}

interface Zone {
  id: string;
  name: string;
  risk_level: 'low' | 'medium' | 'high';
  description: string;
  color: string;
}

interface Supervisor {
  id: string;
  name: string;
  email: string;
  phone: string;
  badge_id: string;
  is_active: boolean;
  zone_id: string | null;
  zone_name: string | null;
}

interface ToastMsg { text: string; ok: boolean }

// ── Shared Components ──────────────────────────────────────────────────────
function Toast({ t }: { t: ToastMsg }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-xl transition-all ${t.ok ? 'bg-green-600' : 'bg-red-600'}`}>
      {t.text}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

// ── Workers Tab ──────────────────────────────────────────────────────────
function WorkersTab({ token, toast }: { token: string; toast: (t: string, ok: boolean) => void }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Worker | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [fWorkerId, setFWorkerId] = useState('');
  const [fName, setFName] = useState('');
  const [fDept, setFDept] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fLang, setFLang] = useState('en');
  const [fImageB64, setFImageB64] = useState('');
  const [zones, setZones] = useState<{id: number; name: string}[]>([]);
  const [supervisors, setSupervisors] = useState<{id: number; name: string; zone_id: number | null}[]>([]);
  const [fZoneId, setFZoneId] = useState<string>('');
  const [fSupervisorId, setFSupervisorId] = useState<string>('');
  
  const [cameraActive, setCameraActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capturedImageRef = useRef<string>('');

  const fetchWorkers = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await api.get('/workers', { headers: { Authorization: `Bearer ${token}` } });
      setWorkers(res.data.data ?? []);
    } catch {
      toast('Failed to load workers', false);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [token, toast]);

  usePolling(() => fetchWorkers(true), 10000);

  useEffect(() => {
    fetchWorkers();
    api.get('/settings/zones', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const d = r.data;
        setZones(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
      })
      .catch((e) => console.error('zones fetch failed:', e));
    api.get('/settings/supervisors', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const d = r.data;
        setSupervisors(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
      })
      .catch((e) => console.error('supervisors fetch failed:', e));
  }, [fetchWorkers, token]);

  const startCamera = async () => {
    try {
      setCameraActive(true);
      setVideoReady(false);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          videoRef.current?.play();
          setVideoReady(true);
        };
      }
    } catch {
      setCameraActive(false);
      setVideoReady(false);
      setError('Camera access denied. Please allow camera in browser settings.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setVideoReady(false);
  };

  const captureFromCamera = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const c = canvasRef.current;
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg');
    capturedImageRef.current = dataUrl;
    setFImageB64(dataUrl);
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      capturedImageRef.current = dataUrl;
      setFImageB64(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const openAddModal = () => {
    setFWorkerId(''); setFName(''); setFDept(''); setFEmail('');
    setFLang('en'); setFImageB64(''); capturedImageRef.current = '';
    setFZoneId(''); setFSupervisorId('');
    setEditTarget(null); setError(''); setModalMode('add');
  };

  const openEditModal = (w: Worker) => {
    setFWorkerId(w.worker_id); setFName(w.name);
    setFDept(w.department ?? ''); setFEmail(w.email);
    setFLang(w.language); setFImageB64(''); capturedImageRef.current = '';
    setFZoneId(w.zone_id ? String(w.zone_id) : '');
    setFSupervisorId(w.supervisor_id ? String(w.supervisor_id) : '');
    setEditTarget(w); setError(''); setModalMode('edit');
  };

  const closeModal = () => {
    stopCamera();
    capturedImageRef.current = '';
    setModalMode(null); setEditTarget(null); setError('');
  };

  const handleSubmit = async () => {
    const imageToSend = fImageB64 || capturedImageRef.current;
    setSaving(true); setError('');
    try {
      const formData = new FormData();
      formData.append('name', fName);
      formData.append('department', fDept);
      formData.append('email', fEmail);
      formData.append('language', fLang);

      if (imageToSend) {
        const res = await fetch(imageToSend);
        const blob = await res.blob();
        formData.append('image', blob, 'face.jpg');
      }

      if (fZoneId) formData.append('zone_id', fZoneId);
      if (fSupervisorId) formData.append('supervisor_id', fSupervisorId);

      if (modalMode === 'add') {
        formData.append('worker_id', fWorkerId);
        await api.post('/workers/register', formData, { headers: { Authorization: `Bearer ${token}` } });
      } else if (modalMode === 'edit' && editTarget) {
        await api.put(`/workers/${editTarget.id}`, formData, { headers: { Authorization: `Bearer ${token}` } });
      }
      closeModal();
      await fetchWorkers();
      toast(modalMode === 'add' ? 'Worker registered' : 'Worker updated', true);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (w: Worker) => {
    try {
      await api.put(`/workers/${w.id}`, { is_active: !w.is_active }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchWorkers();
      toast(`Worker ${!w.is_active ? 'activated' : 'deactivated'}`, true);
    } catch { toast('Failed to update status', false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/workers/${deleteTarget.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setDeleteTarget(null);
      await fetchWorkers();
      toast('Worker deleted', true);
    } catch { toast('Failed to delete worker', false); }
  };

  const filtered = workers.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.worker_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (w.department ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">Worker Management</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">{workers.length} registered workers</p>
        </div>
        <button onClick={openAddModal} className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors">
          + Add Worker
        </button>
      </div>

      <input
        type="text" placeholder="Search by name, ID, or department…"
        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-gray-500">No workers found</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Worker ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Zone</th>
                <th className="px-5 py-3">Supervisor</th>
                <th className="px-5 py-3">Language</th>
                <th className="px-5 py-3 text-center">Compliance</th>
                <th className="px-5 py-3 text-center">Face</th>
                <th className="px-5 py-3 text-center">Active</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono font-medium text-blue-600">{w.worker_id}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{w.name}</td>
                  <td className="px-5 py-3 text-gray-600">{w.department || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{w.zone_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{w.supervisor_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{w.language === 'hi' ? 'हिंदी' : 'English'}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${w.compliance_rate >= 90 ? 'bg-green-100 text-green-800'
                      : w.compliance_rate >= 70 ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'}`}>
                      {Number(w.compliance_rate ?? 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${w.has_face ? 'bg-green-500' : 'bg-red-500'}`}
                      title={w.has_face ? 'Face registered' : 'No face data'} />
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => toggleActive(w)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${w.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${w.is_active ? 'translate-x-4.5' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => openEditModal(w)} className="mr-3 font-medium text-blue-600 hover:text-blue-900">Edit</button>
                    <button onClick={() => setDeleteTarget(w)} className="font-medium text-red-600 hover:text-red-900">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 shadow-xl max-h-screen overflow-y-auto">
            <h2 className="mb-6 text-xl font-bold tracking-tight text-gray-900">
              {modalMode === 'add' ? 'Register New Worker' : 'Edit Worker'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Worker ID</label>
                <input value={fWorkerId} onChange={(e) => setFWorkerId(e.target.value)}
                  disabled={modalMode === 'edit'} placeholder="EMP001"
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500 shadow-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Full Name</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="John Doe"
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Department</label>
                  <input value={fDept} onChange={(e) => setFDept(e.target.value)} placeholder="Field"
                    className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Language</label>
                  <select value={fLang} onChange={(e) => setFLang(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm">
                    <option value="en">English</option>
                    <option value="hi">हिंदी (Hindi)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Email</label>
                <input value={fEmail} onChange={(e) => setFEmail(e.target.value)} type="email"
                  placeholder="worker@safeguard.com"
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Zone</label>
                <select
                  value={fZoneId}
                  onChange={(e) => { setFZoneId(e.target.value); setFSupervisorId(''); }}
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"
                >
                  <option value="">— Select Zone —</option>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Supervisor</label>
                <select
                  value={fSupervisorId}
                  onChange={(e) => setFSupervisorId(e.target.value)}
                  disabled={!fZoneId}
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">— Select Supervisor —</option>
                  {supervisors
                    .filter(s => !fZoneId || s.zone_id === Number(fZoneId))
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))
                  }
                </select>
                {fZoneId && supervisors.filter(s => s.zone_id === Number(fZoneId)).length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">No supervisors assigned to this zone yet</p>
                )}
              </div>

              <div className="pt-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Face Photo <span className="text-red-500 ml-1 font-semibold">*Required for kiosk access</span>
                </label>
                <div className="flex gap-3">
                  {!cameraActive ? (
                    <button type="button" onClick={startCamera}
                      className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                      <Video className="h-4 w-4" /> Use Camera
                    </button>
                  ) : (
                    <button type="button" onClick={captureFromCamera} disabled={!videoReady}
                      className={`flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                        videoReady
                          ? 'border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      }`}>
                      {videoReady ? <><Camera className="h-4 w-4" /> Capture Face</> : <><Hourglass className="h-4 w-4 animate-spin" /> Loading camera…</>}
                    </button>
                  )}
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                    <Upload className="h-4 w-4" /> Upload File
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                {cameraActive && (
                  <div className="relative mt-4 w-full overflow-hidden rounded-md border border-gray-300 bg-black shadow-inner">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="h-48 w-36 rounded-[50%] border-4 border-blue-400 shadow-xl"
                        style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-white drop-shadow-md">
                        <ScanFace className="h-4 w-4" /> Align your face in the oval
                      </p>
                    </div>
                  </div>
                )}

                {fImageB64 && !cameraActive && (
                  <div className="mt-4 flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3">
                    <img src={fImageB64} alt="Face preview"
                      className="h-16 w-16 rounded-full border-2 border-green-500 object-cover shadow-sm" />
                    <div>
                      <p className="flex items-center gap-1 text-sm font-semibold text-green-800"><CheckCircle2 className="h-4 w-4" /> Face captured successfully</p>
                      <button onClick={() => { setFImageB64(''); capturedImageRef.current = ''; }}
                        className="mt-1 text-xs font-medium text-green-700 underline hover:text-green-900">
                        Retake photo
                      </button>
                    </div>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            </div>

            {error && <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">{error}</div>}

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button onClick={closeModal}
                className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm disabled:opacity-50">
                {saving ? 'Saving…' : modalMode === 'add' ? 'Register' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">Delete Worker</h2>
            <p className="mb-6 text-sm text-gray-600">
              Are you sure you want to delete <span className="font-bold text-gray-900">{deleteTarget.name}</span> ({deleteTarget.worker_id})? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Zones Tab ────────────────────────────────────────────────────────────
const BLANK_ZONE = { name: '', risk_level: 'low' as Zone['risk_level'], description: '', color: '#6366f1' };

function ZoneTab({ token, toast }: { token: string; toast: (t: string, ok: boolean) => void }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_ZONE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const r = await fetch(`${BASE_SETTINGS}/zones`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || `Server error ${r.status}`); }
      const data = await r.json();
      setZones(Array.isArray(data) ? data : []);
    } catch (e: any) { toast(e.message || 'Failed to load zones', false); }
    finally { if (!isBackground) setLoading(false); }
  }, [token, toast]);

  usePolling(() => load(true), 10000);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(BLANK_ZONE); setEditId(null); setShowForm(true); };
  const openEdit = (z: Zone) => { setForm({ name: z.name, risk_level: z.risk_level, description: z.description || '', color: z.color || '#6366f1' }); setEditId(z.id); setShowForm(true); };
  const cancel = () => { setShowForm(false); setEditId(null); setForm(BLANK_ZONE); };

  const save = async () => {
    if (!form.name.trim()) { toast('Zone name is required', false); return; }
    setSaving(true);
    try {
      const url = editId ? `${BASE_SETTINGS}/zones/${editId}` : `${BASE_SETTINGS}/zones`;
      const r = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Error'); }
      toast(editId ? 'Zone updated' : 'Zone created', true);
      cancel();
      load();
    } catch (e: any) { toast(e.message || 'Failed to save zone', false); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!window.confirm('Delete this zone?')) return;
    try {
      const r = await fetch(`${BASE_SETTINGS}/zones/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      toast('Zone deleted', true);
      load();
    } catch { toast('Failed to delete zone', false); }
  };

  const RISK: Record<string, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-green-100 text-green-700' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">Zone Settings</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Manage site zones</p>
        </div>
        <button onClick={openAdd} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm">+ Add Zone</button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">{editId ? 'Edit Zone' : 'New Zone'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Welding Bay"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Risk Level</label>
              <select value={form.risk_level} onChange={e => setForm(f => ({ ...f, risk_level: e.target.value as Zone['risk_level'] }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Color</label>
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="mt-1 h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={cancel} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Zone'}
            </button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {zones.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No zones configured yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Risk Level</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Color</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {zones.map(z => (
                  <tr key={z.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-semibold text-gray-900">{z.name}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${RISK[z.risk_level]}`}>{z.risk_level}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{z.description || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="h-5 w-5 rounded-full border border-gray-200" style={{ background: z.color }} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openEdit(z)} className="mr-3 font-medium text-blue-600 hover:text-blue-800">Edit</button>
                      <button onClick={() => del(z.id)} className="font-medium text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Supervisors Tab ────────────────────────────────────────────────────────
const BLANK_SUP = { name: '', email: '', phone: '', badge_id: '', zone_id: '', password: '' };

function SupervisorsTab({ token, toast }: { token: string; toast: (t: string, ok: boolean) => void }) {
  const [sups, setSups] = useState<Supervisor[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_SUP);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const [sr, zr] = await Promise.all([
        fetch(`${BASE_SETTINGS}/supervisors`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BASE_SETTINGS}/zones`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!sr.ok) { const d = await sr.json(); throw new Error(d.error || `Supervisors: server error ${sr.status}`); }
      if (!zr.ok) { const d = await zr.json(); throw new Error(d.error || `Zones: server error ${zr.status}`); }
      const [supsData, zonesData] = await Promise.all([sr.json(), zr.json()]);
      setSups(Array.isArray(supsData) ? supsData : []);
      setZones(Array.isArray(zonesData) ? zonesData : []);
    } catch (e: any) { toast(e.message || 'Failed to load supervisors', false); }
    finally { if (!isBackground) setLoading(false); }
  }, [token, toast]);

  usePolling(() => load(true), 10000);
  useEffect(() => { load(); }, [load]);

  const addSup = async () => {
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email are required', false); return; }
    if (!form.password.trim()) { toast('Password is required', false); return; }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_SETTINGS}/supervisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, zone_id: form.zone_id || null }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Error'); }
      toast('Supervisor added', true);
      setShowForm(false);
      setForm(BLANK_SUP);
      load();
    } catch (e: any) { toast(e.message || 'Failed to add supervisor', false); }
    finally { setSaving(false); }
  };

  const toggleActive = async (s: Supervisor) => {
    try {
      const r = await fetch(`${BASE_SETTINGS}/supervisors/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !s.is_active }),
      });
      if (!r.ok) throw new Error();
      setSups(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !s.is_active } : x));
      toast(`Supervisor ${!s.is_active ? 'activated' : 'deactivated'}`, true);
    } catch { toast('Failed to update status', false); }
  };

  const del = async (id: string) => {
    if (!window.confirm('Delete this supervisor?')) return;
    try {
      const r = await fetch(`${BASE_SETTINGS}/supervisors/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      toast('Supervisor deleted', true);
      load();
    } catch { toast('Failed to delete supervisor', false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">Supervisors</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Manage supervisors</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm">
          {showForm ? 'Cancel' : '+ Add Supervisor'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">New Supervisor</h3>
          <div className="grid grid-cols-2 gap-4">
            {([
              { key: 'name', label: 'Full Name *', placeholder: 'Jane Smith' },
              { key: 'email', label: 'Email *', placeholder: 'jane@site.com' },
              { key: 'phone', label: 'Phone', placeholder: '+91 99999 99999' },
              { key: 'badge_id', label: 'Badge ID', placeholder: 'SUP-001' },
              { key: 'password', label: 'Password *', placeholder: '••••••••' },
            ] as const).map(f => (
              <div key={f.key}>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">{f.label}</label>
                <input
                  type={f.key === 'password' ? 'password' : 'text'}
                  value={form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Zone</label>
              <select value={form.zone_id} onChange={e => setForm(p => ({ ...p, zone_id: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">No zone</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setForm(BLANK_SUP); }} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={addSup} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Supervisor'}
            </button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {sups.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No supervisors added yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Badge</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Zone</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sups.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{s.badge_id || '—'}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{s.name}</td>
                    <td className="px-5 py-3 text-gray-600">{s.email}</td>
                    <td className="px-5 py-3 text-gray-600">{s.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{s.zone_name || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => toggleActive(s)} className="mr-3 font-medium text-blue-600 hover:text-blue-800">
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => del(s.id)} className="font-medium text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'Workers', label: 'Workers', icon: Users },
  { id: 'Zones', label: 'Zones', icon: Map },
  { id: 'Supervisors', label: 'Supervisors', icon: Shield },
] as const;
type Tab = typeof TABS[number]['id'];

const ManagerDashboard = () => {
  const [tab, setTab] = useState<Tab>('Workers');
  const [toastMsg, setToastMsg] = useState<ToastMsg | null>(null);
  
  const token = useAuthStore(s => s.accessToken) ?? '';
  const name = useAuthStore(s => s.name) ?? '';
  const clearAuth = useAuthStore(s => s.clearAuth);
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const toast = useCallback((text: string, ok: boolean) => {
    setToastMsg({ text, ok });
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar Navigation */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white p-6 shadow-sm z-10">
        <div className="mb-8 text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          Manager Portal
        </div>
        
        <div className="mb-6 rounded-lg bg-blue-50 p-3 shadow-inner">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Logged In As</p>
          <p className="font-bold text-gray-900 truncate mt-0.5">{name || 'Manager'}</p>
        </div>

        <nav className="flex-1 space-y-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 rounded-md px-4 py-3 text-sm font-semibold transition-all duration-200
                  ${isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-red-50 hover:text-red-700 hover:border-red-100 transition-colors shadow-sm"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        {tab === 'Workers' && <WorkersTab token={token} toast={toast} />}
        {tab === 'Zones' && <ZoneTab token={token} toast={toast} />}
        {tab === 'Supervisors' && <SupervisorsTab token={token} toast={toast} />}
      </main>
      
      {toastMsg && <Toast t={toastMsg} />}
    </div>
  );
};

export default ManagerDashboard;
