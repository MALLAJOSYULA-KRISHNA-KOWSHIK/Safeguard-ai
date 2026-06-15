import { useState, useEffect, useCallback } from 'react';
import useAuthStore from '../store/authStore';
import { usePolling } from '../hooks/usePolling';

// ── Types ──────────────────────────────────────────────────────────────────
interface Manager {
  id: number;
  name: string;
  email: string;
  phone: string;
  badge_id: string;
  is_active: boolean;
  created_at: string;
}
interface ToastMsg { text: string; ok: boolean }

const BASE = 'http://localhost:8000/api/settings';

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ t }: { t: ToastMsg }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-xl transition-all ${t.ok ? 'bg-green-600' : 'bg-red-600'}`}>
      {t.text}
    </div>
  );
}

// ── Toggle Switch ──────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${on ? 'bg-blue-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
const BLANK_MGR = { name: '', email: '', phone: '', badge_id: '', password: '' };

const Settings = () => {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_MGR);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<ToastMsg | null>(null);
  const token = useAuthStore(s => s.accessToken) ?? '';

  const toast = useCallback((text: string, ok: boolean) => {
    setToastMsg({ text, ok });
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const r = await fetch(`${BASE}/managers`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || `Server error ${r.status}`); }
      const data = await r.json();
      setManagers(Array.isArray(data) ? data : []);
    } catch (e: any) { toast(e.message || 'Failed to load managers', false); }
    finally { if (!isBackground) setLoading(false); }
  }, [token, toast]);

  usePolling(() => load(true), 10000);

  useEffect(() => { load(); }, [load]);

  const addManager = async () => {
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email are required', false); return; }
    if (!form.password.trim()) { toast('Password is required', false); return; }
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Error'); }
      toast('Manager added', true);
      setShowForm(false);
      setForm(BLANK_MGR);
      load();
    } catch (e: any) { toast(e.message || 'Failed to add manager', false); }
    finally { setSaving(false); }
  };

  const toggleActive = async (m: Manager) => {
    try {
      const r = await fetch(`${BASE}/managers/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !m.is_active }),
      });
      if (!r.ok) throw new Error();
      setManagers(prev => prev.map(x => x.id === m.id ? { ...x, is_active: !m.is_active } : x));
      toast(`Manager ${!m.is_active ? 'activated' : 'deactivated'}`, true);
    } catch { toast('Failed to update status', false); }
  };

  const del = async (id: number) => {
    if (!window.confirm('Delete this manager?')) return;
    try {
      const r = await fetch(`${BASE}/managers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      toast('Manager deleted', true);
      load();
    } catch { toast('Failed to delete manager', false); }
  };

  return (
    <div className="space-y-6 font-sans text-gray-900">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage platform managers</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm"
        >
          {showForm ? 'Cancel' : '+ Add Manager'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">New Manager</h3>
          <div className="grid grid-cols-2 gap-4">
            {([
              { key: 'name', label: 'Full Name *', placeholder: 'Jane Doe' },
              { key: 'email', label: 'Email *', placeholder: 'manager@site.com' },
              { key: 'phone', label: 'Phone', placeholder: '+91 99999 99999' },
              { key: 'badge_id', label: 'Badge ID', placeholder: 'MGR-001' },
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
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setForm(BLANK_MGR); }} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={addManager} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Manager'}
            </button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {managers.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No managers added yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Badge ID</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {managers.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{m.badge_id || '—'}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{m.name}</td>
                    <td className="px-5 py-3 text-gray-600">{m.email}</td>
                    <td className="px-5 py-3 text-gray-600">{m.phone || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => toggleActive(m)} className="mr-3 font-medium text-blue-600 hover:text-blue-800">
                        {m.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => del(m.id)} className="font-medium text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {toastMsg && <Toast t={toastMsg} />}
    </div>
  );
};

export default Settings;
