import { useState, useEffect, useCallback } from 'react';
import { Camera, Search, X } from 'lucide-react';
import api from '../lib/api';
import { usePolling } from '../hooks/usePolling';

interface AttendanceRecord {
  id: string;
  worker_id: string;
  worker_name: string | null;
  worker_code: string | null;
  department: string | null;
  check_in: string | null;
  check_out: string | null;
  image_url: string | null;
  created_at: string | null;
}

const API_BASE = 'http://localhost:8000';

const AttendanceLog = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);

  const fetchRecords = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const params: Record<string, string | number> = { page, per_page: 15 };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.get('/attendance', { params });
      const d = res.data.data;
      setRecords(d.records ?? []);
      setTotalPages(d.pages ?? 1);
    } catch {
      setError('Failed to load attendance records');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [page, dateFrom, dateTo]);

  usePolling(() => fetchRecords(true), 10000);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/attendance/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchRecords();
    } catch {
      setError('Failed to delete record');
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 font-sans text-gray-900">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Attendance Log</h1>
          <p className="mt-1 text-sm font-medium text-gray-500">View attendance records with verification photos</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">From</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">To</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
            <X className="h-4 w-4" /> Clear Filters
          </button>
        )}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm font-medium text-gray-500">Loading records…</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-gray-500">No attendance records found</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Photo</th>
                <th className="px-5 py-3">Worker ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Check In</th>
                <th className="px-5 py-3">Check Out</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    {r.image_url ? (
                      <button onClick={() => setPreviewUrl(`${API_BASE}${r.image_url}`)}
                        className="group relative block h-10 w-10 overflow-hidden rounded-full border border-gray-200 shadow-sm transition-transform hover:scale-105">
                        <img src={`${API_BASE}${r.image_url}`} alt="Attendance"
                          className="h-full w-full object-cover" loading="lazy" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 text-white text-xs font-bold">
                          <Search className="h-4 w-4" />
                        </span>
                      </button>
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400 text-sm shadow-sm">
                        <Camera className="h-4 w-4" />
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono font-medium text-blue-600">{r.worker_code || '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{r.worker_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{r.department || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{fmtDate(r.check_in)}</td>
                  <td className="px-5 py-3 text-gray-600">{fmtDate(r.check_out)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setDeleteTarget(r)}
                      className="font-medium text-red-600 hover:text-red-900">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            ← Previous
          </button>
          <span className="text-sm font-medium text-gray-600">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Next →
          </button>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4"
          onClick={() => setPreviewUrl(null)}>
          <div className="relative max-h-[85vh] max-w-3xl rounded-xl bg-white p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Attendance photo"
              className="max-h-[80vh] rounded-lg object-contain" />
            <button onClick={() => setPreviewUrl(null)}
              className="absolute -right-4 -top-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">Delete Record</h2>
            <p className="mb-6 text-sm text-gray-600">
              Are you sure you want to delete attendance record for{' '}
              <span className="font-bold text-gray-900">{deleteTarget.worker_name || deleteTarget.worker_code}</span>?
              The photo will also be permanently removed.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
                Cancel
              </button>
              <button onClick={handleDelete}
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

export default AttendanceLog;
