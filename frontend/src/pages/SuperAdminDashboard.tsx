import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

interface Admin {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface ToastMsg { text: string; ok: boolean }

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

const BLANK_ADMIN = { email: '', password: '' };

const SuperAdminDashboard = () => {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_ADMIN);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<ToastMsg | null>(null);

  const toast = useCallback((text: string, ok: boolean) => {
    setToastMsg({ text, ok });
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/superadmin/admins');
      setAdmins(res.data.data ?? []);
    } catch {
      toast('Failed to load admins', false);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const addAdmin = async () => {
    if (!form.email.trim()) { toast('Email is required', false); return; }
    if (!form.password.trim()) { toast('Password is required', false); return; }
    setSaving(true);
    try {
      await api.post('/superadmin/admins', { email: form.email, password: form.password });
      toast('Admin added successfully', true);
      setShowForm(false);
      setForm(BLANK_ADMIN);
      load();
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to add admin', false);
    } finally {
      setSaving(false);
    }
  };

  const del = async (admin: Admin) => {
    if (!window.confirm(`Delete admin ${admin.email}?`)) return;
    try {
      await api.delete(`/superadmin/admins/${admin.id}`);
      toast('Admin deleted', true);
      load();
    } catch {
      toast('Failed to delete admin', false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-gray-900">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Super Admin Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage platform administrators</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm"
        >
          {showForm ? 'Cancel' : '+ Add Admin'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">New Admin</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@safeguard.com"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setForm(BLANK_ADMIN); }} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={addAdmin} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Admin'}
            </button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {admins.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No admins added yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-semibold text-gray-900">{a.email}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-semibold">
                        {a.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => del(a)} className="font-medium text-red-600 hover:text-red-800">Delete</button>
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

export default SuperAdminDashboard;
