import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Video, Upload, CheckCircle2, ScanFace, Hourglass } from 'lucide-react';
import api from '../lib/api';
import { usePolling } from '../hooks/usePolling';

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

type ModalMode = 'add' | 'edit' | null;

const WorkerManagement = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
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
      const res = await api.get('/workers');
      setWorkers(res.data.data ?? []);
    } catch {
      setError('Failed to load workers');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  usePolling(() => fetchWorkers(true), 10000);

  useEffect(() => {
    fetchWorkers();
    api.get('/settings/zones')
      .then(r => {
        const d = r.data;
        console.log('zones raw response:', d);
        setZones(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
      })
      .catch((e) => console.error('zones fetch failed:', e));
    api.get('/settings/supervisors')
      .then(r => {
        const d = r.data;
        console.log('supervisors raw response:', d);
        setSupervisors(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
      })
      .catch((e) => console.error('supervisors fetch failed:', e));
  }, [fetchWorkers]);

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
    capturedImageRef.current = ''; // ← reset ref on close
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
        await api.post('/workers/register', formData);
      } else if (modalMode === 'edit' && editTarget) {
        await api.put(`/workers/${editTarget.id}`, formData);
      }
      closeModal();
      await fetchWorkers();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (w: Worker) => {
    try {
      await api.put(`/workers/${w.id}`, { is_active: !w.is_active });
      await fetchWorkers();
    } catch { setError('Failed to update status'); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/workers/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchWorkers();
    } catch { setError('Failed to delete worker'); }
  };

  const filtered = workers.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.worker_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (w.department ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 font-sans text-gray-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Worker Management</h1>
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
          <div className="p-8 text-center text-sm font-medium text-gray-500">Loading workers…</div>
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
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-8 shadow-xl">
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

              {/* Zone Dropdown */}
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

              {/* Supervisor Dropdown — filtered by selected zone */}
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

              {/* face capture */}
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
};

export default WorkerManagement;