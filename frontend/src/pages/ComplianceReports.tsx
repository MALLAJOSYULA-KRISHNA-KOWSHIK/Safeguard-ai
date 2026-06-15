import { useState, useEffect, useCallback } from 'react';
import { Camera, Search, ShieldCheck, ShieldAlert, X, Check, Trash2, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../lib/api';
import { usePolling } from '../hooks/usePolling';

interface PpeScanRecord {
  id: string;
  worker_id: string;
  worker_name: string | null;
  scan_time: string | null;
  helmet: boolean;
  vest: boolean;
  gloves: boolean;
  boots: boolean;
  goggles: boolean;
  mask: boolean;
  is_compliant: boolean;
  image_url: string | null;
}

const API_BASE = 'http://localhost:8000';

const ComplianceReports = () => {
  const [records, setRecords] = useState<PpeScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchReports = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await api.get('/reports/ppe', { params: { page, per_page: 15 } });
      const d = res.data.data;
      setRecords(d.records ?? []);
      setTotalPages(d.pages ?? 1);
    } catch {
      setError('Failed to load PPE reports');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [page]);

  usePolling(() => fetchReports(true), 10000);
  useEffect(() => { fetchReports(); }, [fetchReports]);

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scan record? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.delete(`/reports/ppe/${id}`);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch {
      alert('Failed to delete record.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PPE Scan Reports \u2014 SafeGuard AI', 14, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 23);

    // Pass booleans for PPE cols so didDrawCell can render visual icons
    autoTable(doc, {
      startY: 28,
      head: [['#', 'Worker', 'Scan Time', 'Helmet', 'Vest', 'Gloves', 'Shoes', 'Goggles', 'Mask', 'Status']],
      body: records.map((r, i) => [
        i + 1,
        r.worker_name || r.worker_id,
        fmtDate(r.scan_time),
        r.helmet,
        r.vest,
        r.gloves,
        r.boots,
        r.goggles,
        r.mask,
        r.is_compliant ? 'Passed' : 'Failed',
      ]),
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'center', cellWidth: 20 },
        6: { halign: 'center', cellWidth: 18 },
        7: { halign: 'center', cellWidth: 22 },
        8: { halign: 'center', cellWidth: 18 },
        9: { halign: 'center', cellWidth: 22 },
      },
      // Override cell text for boolean PPE cols (so autoTable renders empty text)
      didParseCell: (data) => {
        const ppeCols = [3, 4, 5, 6, 7, 8];
        if (data.section === 'body' && ppeCols.includes(data.column.index)) {
          data.cell.text = []; // suppress default text — we draw manually
        }
        if (data.section === 'body' && data.column.index === 9) {
          data.cell.styles.textColor = data.cell.raw === 'Passed' ? [22, 163, 74] : [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      // Draw tick/cross icons using PDF drawing primitives (font-independent)
      didDrawCell: (data) => {
        const ppeCols = [3, 4, 5, 6, 7, 8];
        if (data.section !== 'body' || !ppeCols.includes(data.column.index)) return;

        const isDetected = data.cell.raw === true;
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        const r = 4;

        if (isDetected) {
          // Green filled circle
          doc.setFillColor(22, 163, 74);
          doc.circle(cx, cy, r, 'F');
          // White checkmark drawn as two lines (L-shape)
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.9);
          doc.line(cx - 2.2, cy, cx - 0.5, cy + 2);       // short left leg
          doc.line(cx - 0.5, cy + 2, cx + 2.5, cy - 1.8); // long right leg
        } else {
          // Red filled circle
          doc.setFillColor(220, 38, 38);
          doc.circle(cx, cy, r, 'F');
          // White X drawn as two diagonal lines
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.9);
          doc.line(cx - 2.2, cy - 2.2, cx + 2.2, cy + 2.2);
          doc.line(cx + 2.2, cy - 2.2, cx - 2.2, cy + 2.2);
        }
      },
    });

    doc.save(`ppe-scan-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const PpeStatusIcon = ({ detected }: { detected: boolean }) => (
    <div className="flex justify-center">
      {detected ? (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-50 border border-green-200 text-green-600 shadow-sm" title="Detected">
          <Check className="h-4 w-4 stroke-[2.5]" />
        </div>
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 border border-red-200 text-red-500 shadow-sm" title="Missing">
          <X className="h-4 w-4 stroke-[2.5]" />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 font-sans text-gray-900">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">PPE Scan Reports</h1>
          <p className="mt-1 text-sm font-medium text-gray-500">View recent PPE verifications from the Kiosk</p>
        </div>
        <button
          onClick={handleDownloadPDF}
          disabled={records.length === 0}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm font-medium text-gray-500">Loading reports…</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-gray-500">No PPE records found</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Photo</th>
                <th className="px-5 py-3">Scan Time</th>
                <th className="px-5 py-3">Worker Name</th>
                <th className="px-5 py-3 text-center">Helmet</th>
                <th className="px-5 py-3 text-center">Vest</th>
                <th className="px-5 py-3 text-center">Gloves</th>
                <th className="px-5 py-3 text-center">Shoes</th>
                <th className="px-5 py-3 text-center">Goggles</th>
                <th className="px-5 py-3 text-center">Mask</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    {r.image_url ? (
                      <button onClick={() => setPreviewUrl(`${API_BASE}${r.image_url}`)}
                        className="group relative block h-10 w-10 overflow-hidden rounded-full border border-gray-200 shadow-sm transition-transform hover:scale-105">
                        <img src={`${API_BASE}${r.image_url}`} alt="PPE Scan"
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
                  <td className="px-5 py-3 text-gray-600">{fmtDate(r.scan_time)}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{r.worker_name || r.worker_id}</td>

                  <td className="px-5 py-3"><PpeStatusIcon detected={r.helmet} /></td>
                  <td className="px-5 py-3"><PpeStatusIcon detected={r.vest} /></td>
                  <td className="px-5 py-3"><PpeStatusIcon detected={r.gloves} /></td>
                  <td className="px-5 py-3"><PpeStatusIcon detected={r.boots} /></td>
                  <td className="px-5 py-3"><PpeStatusIcon detected={r.goggles} /></td>
                  <td className="px-5 py-3"><PpeStatusIcon detected={r.mask} /></td>

                  <td className="px-5 py-3 text-center">
                    {r.is_compliant ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                        <ShieldCheck className="h-3 w-3" /> Passed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                        <ShieldAlert className="h-3 w-3" /> Failed
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      title="Delete record"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      {deletingId === r.id
                        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        : <Trash2 className="h-4 w-4" />
                      }
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
            <img src={previewUrl} alt="PPE photo"
              className="max-h-[80vh] rounded-lg object-contain" />
            <button onClick={() => setPreviewUrl(null)}
              className="absolute -right-4 -top-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplianceReports;
