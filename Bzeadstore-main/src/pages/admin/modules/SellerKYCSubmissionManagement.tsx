import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { COMPANY_ADDRESS_LINES } from '../../../constants/companyContact';
import {
  fetchAllKYCSubmissions,
  approveKYC,
  rejectKYC,
  deleteKYC,
  updateKYC,
  getKYCDocumentSignedUrl,
  collectSellerKYCDocuments,
  downloadKYCDocument,
  kycDocumentDownloadFilename,
  type KYCDocumentRef,
} from '../../../lib/kycService';
import {
  CheckCircle2, XCircle, Trash2, Eye, Edit3, X,
  Loader2, AlertCircle, Search, RefreshCw, Save, Download,
  FileText, ExternalLink, ImageIcon, File,
} from 'lucide-react';
import { confirmOnce } from '../../../utils/confirmOnce';
import { Skeleton, TableSkeleton } from '../../../components/common/Skeleton';

type KYCRow = Record<string, unknown>;
type Modal = { type: 'view' | 'edit' | 'reject'; row: KYCRow } | null;

const BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  draft:    'bg-gray-100 text-gray-600',
};

const BADGE_PRINT: Record<string, string> = {
  pending:  'color:#b45309;background:#fef3c7;',
  approved: 'color:#15803d;background:#dcfce7;',
  rejected: 'color:#dc2626;background:#fee2e2;',
  draft:    'color:#6b7280;background:#f3f4f6;',
};

const FIELDS = ['pan','gstin','id_type','id_number','bank_holder_name','account_number','account_type','ifsc_code'] as const;

export const SellerKYCSubmissionManagement: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<KYCRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modal, setModal] = useState<Modal>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [loadingDocs, setLoadingDocs] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await fetchAllKYCSubmissions();
    if (e) setError(e); else setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Preload signed document URLs when view modal opens
  useEffect(() => {
    if (modal?.type !== 'view') { setDocUrls({}); return; }
    const row = modal.row;
    setLoadingDocs(true);
    const tasks: [string, string][] = [];
    const addTask = (key: string, url: unknown) => {
      if (url && typeof url === 'string') tasks.push([key, url]);
    };
    addTask('id_front',      row.id_document_url);
    addTask('id_back',       row.id_back_url);
    addTask('address_proof', row.address_proof_url);
    addTask('business_reg',  row.business_reg_url);
    addTask('tax_doc',       row.tax_doc_url);
    addTask('bank_proof',    row.bank_statement_url);
    // Legacy JSONB document paths
    const docs = (row.business_address as Record<string, unknown>)?.documents as Record<string, string> | undefined;
    if (docs) {
      if (!row.id_document_url) addTask('id_front', docs.id_front);
      if (!row.id_back_url)    addTask('id_back',   docs.id_back);
      if (!row.business_reg_url) addTask('business_reg', docs.business_reg);
      if (!row.tax_doc_url)    addTask('tax_doc',    docs.tax_doc);
      if (!row.bank_statement_url) addTask('bank_proof', docs.bank_proof);
    }
    const vdocs = (row.business_address as Record<string, unknown>)?.verification_documents as Record<string, string> | undefined;
    if (vdocs) {
      Object.entries(vdocs).forEach(([k, v]) => { if (v && typeof v === 'string' && !tasks.find(t => t[1] === v)) addTask(`v_${k}`, v); });
    }
    Promise.all(tasks.map(async ([key, url]) => {
      const signed = await getKYCDocumentSignedUrl(url, 600);
      return [key, signed] as [string, string | null];
    })).then(results => {
      const map: Record<string, string> = {};
      results.forEach(([k, v]) => { if (v) map[k as string] = v as string; });
      setDocUrls(map);
      setLoadingDocs(false);
    });
  }, [modal]);

  const handlePrintPDF = useCallback(async () => {
    if (!printRef.current) return;
    const row = (modal as { type: 'view'; row: KYCRow } | null)?.row;
    const status = String(row?.kyc_status || 'draft');
    const badgeStyle = BADGE_PRINT[status] || BADGE_PRINT.draft;
    const content = printRef.current.innerHTML;

    // Load logo as data URL (same approach as invoicePdf.ts)
    let logoHtml = '<span style="font-size:22px;font-weight:700;color:#141824;letter-spacing:1px;">BZEAD</span>';
    try {
      const res = await fetch('/images/logo/invoice-logo.png', { cache: 'no-cache' });
      if (res.ok) {
        const blob = await res.blob();
        const logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        logoHtml = `<img src="${logoDataUrl}" style="height:52px;width:auto;display:block;" alt="BZEAD" />`;
      }
    } catch { /* fallback to text logo */ }

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>KYC Verification Form</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #111; background: #fff; }
  .pdf-page { padding: 0; }
  /* ?? Header ?? */
  .pdf-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 8px; border-bottom: 1.2px solid #dce0e8; margin-bottom: 10px; }
  .header-logo { display: flex; align-items: center; }
  .header-company { text-align: right; }
  .header-company .co-name { font-size: 11px; font-weight: 700; color: #141824; letter-spacing: 0.5px; }
  .header-company .co-sub  { font-size: 8px; color: #5a606e; margin-top: 1px; }
  .header-company .co-addr { font-size: 8px; color: #5a606e; margin-top: 1px; }
  /* ?? Header logo size ?? */
  .header-logo img { height: 36px !important; }
  /* ?? Content ?? */
  h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 20px; font-size: 9px; font-weight: 700; text-transform: uppercase; ${badgeStyle} }
  .meta { font-size: 9px; color: #555; margin: 4px 0 8px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 7px 0; }
  .section-title { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 5px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 16px; }
  .field-label { font-size: 8px; color: #9ca3af; text-transform: uppercase; margin-bottom: 1px; }
  .field-value { font-size: 9.5px; color: #111; }
  .doc-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .doc-thumb { border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; text-align: center; padding: 4px; }
  .doc-thumb img { width: 100%; height: 58px; object-fit: cover; border-radius: 3px; }
  .doc-label { font-size: 7.5px; color: #6b7280; margin-top: 3px; }
  .declaration { font-size: 8.5px; color: #374151; font-style: italic; line-height: 1.45; border-left: 3px solid #f97316; padding: 5px 8px; background: #fff7ed; border-radius: 0 4px 4px 0; margin: 4px 0; }
  .check-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 9px; }
  .check-box { width: 11px; height: 11px; background: #22c55e; border-radius: 2px; display: inline-block; flex-shrink: 0; }
  .approval { margin-top: 8px; font-size: 9.5px; color: #374151; }
  /* ?? Footer ?? */
  .pdf-footer { border-top: 1.2px solid #dce0e8; margin-top: 12px; padding-top: 7px; font-size: 7.5px; color: #5a606e; line-height: 1.4; text-align: justify; }
</style></head><body>
<div class="pdf-page">
  <div class="pdf-header">
    <div class="header-logo">${logoHtml}</div>
    <div class="header-company">
      <div class="co-name">BZEAD MARKETPLACE</div>
      <div class="co-sub">POWERED BY BEAUZEAD INDIA</div>
      <div class="co-addr">${COMPANY_ADDRESS_LINES[0]}<br>${COMPANY_ADDRESS_LINES[1]}</div>
    </div>
  </div>`);
    win.document.write(content);
    win.document.write(`
  <div class="pdf-footer">
    BZEAD is an online marketplace platform operated by BEAUZEAD INDIA, a limited company registered in India.
    This KYC Verification Form contains seller-submitted identity, business, and banking information collected for
    seller onboarding and regulatory compliance purposes. This document is confidential and intended solely for
    authorized BZEAD administrators. Unauthorized use, disclosure, or reproduction is strictly prohibited.
  </div>
</div>
</body></html>`);
    win.document.close();
    const formSlug = String(row?.full_name || 'seller')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'seller';
    win.document.title = `kyc-verification-${formSlug}.pdf`;
    win.onload = () => { win.focus(); win.print(); };
  }, [modal, printRef]);


  const filtered = rows.filter(r => {
    const s = statusFilter === 'all' || r.kyc_status === statusFilter;
    const q = !search || [r.full_name, r.email, r.country, r.pan].some(
      v => String(v || '').toLowerCase().includes(search.toLowerCase())
    );
    return s && q;
  });

  const handleApprove = async (row: KYCRow) => {
    if (!confirmOnce('Approve this seller KYC?')) return;
    setActionLoading(true);
    const res = await approveKYC(row.id as string, row.seller_id as string, user?.id || '');
    if (res.success) await load(); else setError(res.error || 'Failed');
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!modal || modal.type !== 'reject' || !rejectReason.trim()) return;
    setActionLoading(true);
    const res = await rejectKYC(modal.row.id as string, modal.row.seller_id as string, rejectReason);
    if (res.success) { setModal(null); setRejectReason(''); await load(); }
    else setError(res.error || 'Failed');
    setActionLoading(false);
  };

  const handleDelete = async (row: KYCRow) => {
    if (!confirmOnce('Delete this KYC record permanently?')) return;
    setActionLoading(true);
    const res = await deleteKYC(row.id as string);
    if (res.success) await load(); else setError(res.error || 'Failed');
    setActionLoading(false);
  };

  const handleSaveEdit = async () => {
    if (!modal || modal.type !== 'edit') return;
    setActionLoading(true);
    const res = await updateKYC(modal.row.id as string, editData);
    if (res.success) { setModal(null); await load(); }
    else setError(res.error || 'Failed');
    setActionLoading(false);
  };

  const openEdit = (row: KYCRow) => {
    const data: Record<string, string> = {};
    FIELDS.forEach(f => { data[f] = String(row[f] || ''); });
    setEditData(data);
    setModal({ type: 'edit', row });
  };

  const counts = {
    all: rows.length,
    pending: rows.filter(r => r.kyc_status === 'pending').length,
    approved: rows.filter(r => r.kyc_status === 'approved').length,
    rejected: rows.filter(r => r.kyc_status === 'rejected').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Seller KYC Management</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 shrink-0">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
        Seller verification requests appear here after sellers submit Identity Verification from their dashboard. Use the <strong>Pending</strong> tab and click <strong>Approve</strong> or <strong>Reject</strong> in Actions.
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {(['all','pending','approved','rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${statusFilter === s ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto w-full sm:w-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, PAN..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:border-amber-400" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading KYC submissions...</span>
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No KYC submissions found. Ask sellers to open Seller Dashboard ? Verification and submit Identity documents.
        </div>
      ) : (
        <>
          {/* Desktop table (md+) */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 text-left">Seller</th>
                  <th className="px-3 py-3 text-left">Country</th>
                  <th className="px-3 py-3 text-left">PAN</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Submitted</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(row => (
                  <tr key={row.id as string} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-3">
                      <p className="font-medium text-gray-900">{String(row.full_name || '?')}</p>
                      <p className="text-gray-400 text-xs">{String(row.email || '')}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-gray-600">{String(row.country || '?')}</td>
                    <td className="px-2 sm:px-4 py-3 font-mono text-gray-600">{String(row.pan || '?')}</td>
                    <td className="px-2 sm:px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${BADGE[row.kyc_status as string] || BADGE.draft}`}>
                        {String(row.kyc_status || 'draft')}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-gray-500 text-xs">
                      {row.submitted_at ? new Date(row.submitted_at as string).toLocaleDateString() : '?'}
                    </td>
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Btn icon={<Eye size={15} />} title="View" onClick={() => setModal({ type: 'view', row })} />
                        <Btn icon={<Edit3 size={15} />} title="Edit" onClick={() => openEdit(row)} />
                        {row.kyc_status === 'pending' && (
                          <>
                            <Btn icon={<CheckCircle2 size={15} />} title="Approve" cls="text-green-600 hover:bg-green-50" onClick={() => handleApprove(row)} />
                            <Btn icon={<XCircle size={15} />} title="Reject" cls="text-red-600 hover:bg-red-50" onClick={() => { setRejectReason(''); setModal({ type: 'reject', row }); }} />
                          </>
                        )}
                        <Btn icon={<Trash2 size={15} />} title="Delete" cls="text-red-600 hover:bg-red-50" onClick={() => handleDelete(row)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (<md) */}
          <div className="md:hidden space-y-3">
            {filtered.map(row => (
              <div key={String(row.id)} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">{String(row.full_name || '?')}</p>
                    <p className="text-[11px] text-gray-400 truncate">{String(row.email || '')}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${BADGE[row.kyc_status as string] || BADGE.draft}`}>
                    {String(row.kyc_status || 'draft')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-3 min-w-0">
                  <div className="truncate"><span className="text-gray-400">Country:</span> <span className="text-gray-700">{String(row.country || '?')}</span></div>
                  <div className="truncate"><span className="text-gray-400">PAN:</span> <span className="font-mono text-gray-700">{String(row.pan || '?')}</span></div>
                  <div className="col-span-2 truncate">
                    <span className="text-gray-400">Submitted:</span>{' '}
                    <span className="text-gray-700">{row.submitted_at ? new Date(row.submitted_at as string).toLocaleDateString() : '?'}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1 pt-2 border-t border-gray-100">
                  <Btn icon={<Eye size={15} />} title="View" onClick={() => setModal({ type: 'view', row })} />
                  <Btn icon={<Edit3 size={15} />} title="Edit" onClick={() => openEdit(row)} />
                  {row.kyc_status === 'pending' && (
                    <>
                      <Btn icon={<CheckCircle2 size={15} />} title="Approve" cls="text-green-600 hover:bg-green-50" onClick={() => handleApprove(row)} />
                      <Btn icon={<XCircle size={15} />} title="Reject" cls="text-red-600 hover:bg-red-50" onClick={() => { setRejectReason(''); setModal({ type: 'reject', row }); }} />
                    </>
                  )}
                  <Btn icon={<Trash2 size={15} />} title="Delete" cls="text-red-600 hover:bg-red-50" onClick={() => handleDelete(row)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Overlay */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {modal.type === 'view' ? 'KYC Verification Form' : modal.type === 'edit' ? 'Edit KYC' : 'Reject KYC'}
              </h2>
              <div className="flex items-center gap-2">
                {modal.type === 'view' && (
                  <button
                    onClick={handlePrintPDF}
                    title="Opens print dialog ? choose Save as PDF to download the full KYC form"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    <Download size={13} /> Save form as PDF
                  </button>
                )}
                <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {/* ?? VIEW ?? */}
              {modal.type === 'view' && (() => {
                const row = modal.row;
                const status = String(row.kyc_status || 'draft');
                const submittedFmt = row.submitted_at
                  ? new Date(row.submitted_at as string).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '?';
                const verifiedFmt = row.verified_at
                  ? new Date(row.verified_at as string).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : null;
                const kycRef = String(row.reference_number || row.kyc_form_id || String(row.id || '').slice(0, 13).toUpperCase() || '?');
                const bizAddr = [
                  row.business_street_address_1,
                  row.business_street_address_2,
                  row.business_city,
                  row.business_state,
                  row.business_postal_code,
                  row.business_country,
                ].filter(Boolean).join(', ') || '?';
                const taxDisplay = row.tax_type
                  ? `${row.tax_type}: ${String(row.tax_id_number || row.pan || 'Not provided')}`
                  : (row.pan ? `PAN: ${row.pan}` : (row.gstin ? `GSTIN: ${row.gstin}` : 'Not provided'));

                const docSlots: { key: string; label: string }[] = [
                  { key: 'id_front',      label: 'ID Document (Front)' },
                  { key: 'id_back',       label: 'ID Document (Back)' },
                  { key: 'address_proof', label: 'Address Proof' },
                  { key: 'business_reg',  label: 'Business Registration' },
                  { key: 'tax_doc',       label: 'Tax Document' },
                  { key: 'bank_proof',    label: 'Bank Proof' },
                ];
                // add verification doc slots (prefixed v_)
                const extraSlots = Object.keys(docUrls)
                  .filter(k => k.startsWith('v_') && !docSlots.find(s => s.key === k))
                  .map(k => ({ key: k, label: k.replace('v_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }));
                const allDocSlots = [...docSlots, ...extraSlots].filter(s => docUrls[s.key]);

                const isPdf = (url: string) => url.includes('.pdf') || url.includes('%2Fpdf') || url.includes('application%2Fpdf');

                return (
                  <div>
                    {/* Printable content ? serialized to new window for PDF */}
                    <div ref={printRef} style={{ display: 'none' }}>
                      <h1>KYC VERIFICATION FORM</h1>
                      <span className="badge">{status.toUpperCase()}</span>
                      <div className="meta">
                        KYC ID: {kycRef} &nbsp;|&nbsp; Date &amp; Time: {submittedFmt}
                      </div>
                      <hr />
                      <div className="section-title">Personal Details</div>
                      <div className="grid2">
                        <div><div className="field-label">Full Name</div><div className="field-value">{String(row.full_name || '?')}</div></div>
                        <div><div className="field-label">Email</div><div className="field-value">{String(row.email || '?')}</div></div>
                        <div><div className="field-label">Mobile No.</div><div className="field-value">{String(row.phone || '?')}</div></div>
                        <div><div className="field-label">Country</div><div className="field-value">{String(row.country || '?')}</div></div>
                        <div className="grid2" style={{ gridColumn: '1/-1' }}>
                          <div><div className="field-label">Personal Address</div><div className="field-value">{[row.landmark, row.business_street_address_1, row.business_city, row.country].filter(Boolean).join(', ') || '?'}</div></div>
                        </div>
                      </div>
                      <hr />
                      <div className="section-title">Business Details</div>
                      <div className="grid2">
                        <div><div className="field-label">Business Name</div><div className="field-value">{String(row.business_name || '?')}</div></div>
                        <div><div className="field-label">Business Type</div><div className="field-value">{String(row.brand_name || row.business_registration_number ? 'Registered Business' : 'Individual')}</div></div>
                        <div><div className="field-label">Business Address</div><div className="field-value">{bizAddr}</div></div>
                        <div><div className="field-label">Tax ID / GST</div><div className="field-value">{taxDisplay}</div></div>
                        {!!row.business_registration_number && <div><div className="field-label">Registration No.</div><div className="field-value">{String(row.business_registration_number)}</div></div>}
                        {!!row.brand_name && <div><div className="field-label">Brand Name</div><div className="field-value">{String(row.brand_name)}</div></div>}
                      </div>
                      <hr />
                      <div className="section-title">Account Details</div>
                      <div className="grid2">
                        <div><div className="field-label">Account Holder Name</div><div className="field-value">{String(row.bank_holder_name || '?')}</div></div>
                        <div><div className="field-label">Bank Name</div><div className="field-value">{String(row.bank_name || 'FEDERAL BANK')}</div></div>
                        <div><div className="field-label">Account Number</div><div className="field-value">{String(row.account_number || '?')}</div></div>
                        <div><div className="field-label">IFSC / SWIFT</div><div className="field-value">{String(row.swift_routing_code || row.ifsc_code || '?')}</div></div>
                        {!!row.account_type && <div><div className="field-label">Account Type</div><div className="field-value">{String(row.account_type)}</div></div>}
                        {!!row.branch_name && <div><div className="field-label">Branch</div><div className="field-value">{String(row.branch_name)}</div></div>}
                      </div>
                      {allDocSlots.length > 0 && (<>
                        <hr />
                        <div className="section-title">Uploaded KYC Documents</div>
                        <div className="doc-grid">
                          {allDocSlots.map(s => (
                            <div key={s.key} className="doc-thumb">
                              {isPdf(docUrls[s.key]) ? <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', borderRadius: 4 }}>PDF</div> : <img src={docUrls[s.key]} alt={s.label} crossOrigin="anonymous" />}
                              <div className="doc-label">{s.label}</div>
                            </div>
                          ))}
                        </div>
                      </>)}
                      <hr />
                      <div className="declaration">I, {String(row.full_name || row.email || 'the Seller')}, hereby confirm that all information, documents, business details, bank account information, tax details, and KYC documents submitted to BZEAD are true, accurate, valid, and belong to me/my business. I understand that any false, misleading, forged, or incomplete information may result in the suspension, rejection, or permanent termination of my seller account. I agree to comply with all BZEAD Seller Policies, Terms of Service, Privacy Policy, applicable laws, and marketplace regulations. I further authorize BZEAD to verify the submitted information and documents as required for seller onboarding and compliance purposes.</div>
                      {!!row.terms_accepted && <div className="check-row"><span className="check-box" /><span>I have accepted the BZEAD Terms of Service and Privacy Policy.</span><span style={{ marginLeft: 'auto', color: '#6b7280' }}>{submittedFmt}</span></div>}
                      {!!row.declaration_accepted && <div className="check-row"><span className="check-box" /><span>I have accepted the BZEAD Seller Agreement.</span><span style={{ marginLeft: 'auto', color: '#6b7280' }}>{submittedFmt}</span></div>}
                      {!!row.pep_declaration && <div className="check-row"><span className="check-box" /><span>PEP Declaration accepted.</span><span style={{ marginLeft: 'auto', color: '#6b7280' }}>{submittedFmt}</span></div>}
                      {!!row.sanctions_check && <div className="check-row"><span className="check-box" /><span>Sanctions &amp; compliance check accepted.</span><span style={{ marginLeft: 'auto', color: '#6b7280' }}>{submittedFmt}</span></div>}
                      <hr />
                      <div className="approval">
                        <strong>Approval status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{status}</span>
                        {verifiedFmt && <span> &nbsp;|&nbsp; Reviewed on: {verifiedFmt}</span>}
                      </div>
                    </div>

                    {/* ?? On-screen styled form ?? */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      {/* Header bar */}
                      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 bg-white border-b border-gray-100">
                        <div>
                          <h3 className="text-base font-bold tracking-widest uppercase text-gray-900">KYC Verification Form</h3>
                          <p className="text-xs text-gray-500 mt-1">
                            <span className="font-semibold text-gray-700">KYC ID:</span> {kycRef}
                            &ensp;|&ensp;
                            <span className="font-semibold text-gray-700">Date &amp; Time:</span> {submittedFmt}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${BADGE[status] || BADGE.draft}`}>{status}</span>
                      </div>

                      {/* ?? Personal Details ?? */}
                      <Section title="Personal Details">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                          <KF label="Full Name" value={row.full_name} />
                          <KF label="Email" value={row.email} />
                          <KF label="Mobile No." value={row.phone} />
                          <KF label="Country" value={row.country} />
                          <div className="sm:col-span-2">
                            <KF label="Personal Address" value={[row.landmark, row.business_street_address_1, row.business_city, row.country].filter(Boolean).join(', ') || null} />
                          </div>
                        </div>
                      </Section>

                      {/* ?? Business Details ?? */}
                      <Section title="Business Details">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                          <KF label="Business Name" value={row.business_name} />
                          <KF label="Business Type" value={row.brand_name || row.business_registration_number ? 'Registered Business' : 'Individual'} />
                          <div className="sm:col-span-2"><KF label="Business Address" value={bizAddr} /></div>
                          <KF label="Tax ID / GST" value={taxDisplay} />
                          {!!row.business_registration_number && <KF label="Registration No." value={row.business_registration_number} />}
                          {!!row.brand_name && <KF label="Brand Name" value={row.brand_name} />}
                        </div>
                      </Section>

                      {/* ?? Account Details ?? */}
                      <Section title="Account Details">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                          <KF label="Account Holder Name" value={row.bank_holder_name} />
                          <KF label="Bank Name" value={row.bank_name || 'FEDERAL BANK'} />
                          <KF label="Account Number" value={row.account_number} mono />
                          <KF label="IFSC / SWIFT" value={row.swift_routing_code || row.ifsc_code} mono />
                          {!!row.account_type && <KF label="Account Type" value={String(row.account_type).charAt(0).toUpperCase() + String(row.account_type).slice(1)} />}
                          {!!row.branch_name && <KF label="Branch" value={row.branch_name} />}
                        </div>
                      </Section>

                      {/* ?? Documents ?? */}
                      <Section title="Uploaded KYC Documents">
                        <p className="text-xs text-gray-500 mb-3">
                          View opens in a new tab. Use <strong>Download PDF</strong> on each file to save proofs locally with a proper filename.
                        </p>
                        {loadingDocs ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="status" aria-live="polite">
                            <span className="sr-only">Loading documents...</span>
                            {Array.from({ length: 4 }).map((_, i) => (
                              <Skeleton key={i} rounded="lg" className="h-24 w-full" />
                            ))}
                          </div>
                        ) : (() => {
                          const documents = collectSellerKYCDocuments(row);
                          const sellerName = String(row.full_name || 'seller');
                          if (documents.length === 0) {
                            return <p className="text-sm text-gray-400">No documents uploaded.</p>;
                          }
                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {documents.map(doc => (
                                <KYCDocumentCard
                                  key={doc.storagePath}
                                  doc={doc}
                                  sellerName={sellerName}
                                  previewUrl={
                                    doc.kind === 'image'
                                      ? Object.values(docUrls).find(url => url.includes(encodeURIComponent(doc.fileName)) || url.includes(doc.fileName))
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          );
                        })()}
                      </Section>

                      {/* ?? Policy Acceptances ?? */}
                      <Section declaration title={`I, ${String(row.full_name || row.email || 'the Seller')}, hereby confirm that all information, documents, business details, bank account information, tax details, and KYC documents submitted to BZEAD are true, accurate, valid, and belong to me/my business. I understand that any false, misleading, forged, or incomplete information may result in the suspension, rejection, or permanent termination of my seller account. I agree to comply with all BZEAD Seller Policies, Terms of Service, Privacy Policy, applicable laws, and marketplace regulations. I further authorize BZEAD to verify the submitted information and documents as required for seller onboarding and compliance purposes.`}>
                        <div className="space-y-2">
                          {!!row.terms_accepted && <PolicyCheck label="I have accepted the BZEAD Terms of Service and Privacy Policy." date={submittedFmt} />}
                          {!!row.declaration_accepted && <PolicyCheck label="I have accepted the BZEAD Seller Agreement." date={submittedFmt} />}
                          {!!row.aml_compliance && <PolicyCheck label="I have accepted the BZEAD Tax &amp; Policy Rules." date={submittedFmt} />}
                          {!!row.pep_declaration && <PolicyCheck label="PEP Declaration accepted." date={submittedFmt} />}
                          {!!row.sanctions_check && <PolicyCheck label="Sanctions &amp; compliance check accepted." date={submittedFmt} />}
                          {!row.terms_accepted && !row.declaration_accepted && !row.pep_declaration && !row.sanctions_check && (
                            <p className="text-sm text-gray-400">No policy acceptances recorded.</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-100">
                          <p className="text-xs text-gray-500">
                            Approval status: <span className={`font-bold uppercase ${BADGE[status] || BADGE.draft} px-2 py-0.5 rounded-full`}>{status}</span>
                          </p>
                          {verifiedFmt && <p className="text-xs text-gray-500">Reviewed on: {verifiedFmt}</p>}
                        </div>
                      </Section>

                      {/* ?? Rejection reason ?? */}
                      {!!row.rejection_reason && (
                        <div className="mx-5 mb-5">
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="font-semibold text-red-700 text-xs mb-1 uppercase tracking-wide">Rejection Reason</p>
                            <p className="text-sm text-red-600">{String(row.rejection_reason)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    {row.kyc_status === 'pending' && (
                      <div className="flex justify-end gap-3 mt-4">
                        <button onClick={() => { setRejectReason(''); setModal({ type: 'reject', row }); }}
                          className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500">
                          <XCircle size={14} /> Reject
                        </button>
                        <button onClick={() => handleApprove(row)} disabled={actionLoading}
                          className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50">
                          {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* EDIT */}
              {modal.type === 'edit' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {FIELDS.map(f => (
                    <div key={f}>
                      <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{f.replace(/_/g, ' ')}</label>
                      <input value={editData[f] || ''} onChange={e => setEditData({ ...editData, [f]: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                    </div>
                  ))}
                  <div className="col-span-1 sm:col-span-2 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
                    <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSaveEdit} disabled={actionLoading}
                      className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-400 flex items-center gap-2 disabled:opacity-50">
                      {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                    </button>
                  </div>
                </div>
              )}

              {/* REJECT */}
              {modal.type === 'reject' && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">Provide a reason so the seller knows what to fix:</p>
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} placeholder="e.g. PAN number doesn't match the uploaded document..."
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-400 mb-4" />
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 flex items-center gap-2 disabled:opacity-50">
                      {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const KYCDocumentCard: React.FC<{
  doc: KYCDocumentRef;
  sellerName: string;
  previewUrl?: string;
}> = ({ doc, sellerName, previewUrl }) => {
  const [viewLoading, setViewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [docError, setDocError] = useState('');

  const Icon = doc.kind === 'pdf' ? FileText : doc.kind === 'image' ? ImageIcon : File;
  const kindLabel = doc.kind === 'pdf' ? 'PDF' : doc.kind === 'image' ? 'Image' : 'File';

  const handleView = async () => {
    setDocError('');
    setViewLoading(true);
    try {
      const signedUrl = previewUrl || await getKYCDocumentSignedUrl(doc.storagePath, 600);
      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        setDocError('Could not open this document.');
      }
    } catch {
      setDocError('Failed to open document.');
    } finally {
      setViewLoading(false);
    }
  };

  const handleDownload = async () => {
    setDocError('');
    setDownloadLoading(true);
    try {
      const filename = kycDocumentDownloadFilename(sellerName, doc.id, doc.storagePath, doc.kind);
      const result = await downloadKYCDocument(doc.storagePath, filename, doc.kind);
      if (!result.success) {
        setDocError(result.error || 'Download failed.');
      }
    } catch {
      setDocError('Download failed.');
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col min-w-0">
      <div className="bg-gray-50 h-28 flex items-center justify-center overflow-hidden border-b border-gray-100">
        {doc.kind === 'image' && previewUrl ? (
          <img src={previewUrl} alt={doc.label} className="w-full h-full object-cover" />
        ) : doc.kind === 'pdf' ? (
          <div className="flex flex-col items-center gap-1 text-amber-700">
            <FileText size={32} />
            <span className="text-[10px] font-semibold uppercase tracking-wide">PDF document</span>
          </div>
        ) : (
          <Icon size={28} className="text-gray-400" />
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm">{doc.label}</p>
            <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {kindLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5" title={doc.fileName}>{doc.fileName}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-auto">
          <button
            type="button"
            onClick={() => void handleView()}
            disabled={viewLoading || downloadLoading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {viewLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            View
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={viewLoading || downloadLoading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {downloadLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {doc.kind === 'pdf' ? 'Download PDF' : 'Download'}
          </button>
        </div>
        {docError && <p className="text-xs text-red-600">{docError}</p>}
      </div>
    </div>
  );
};

const Btn: React.FC<{ icon: React.ReactNode; title: string; cls?: string; onClick: () => void }> = ({ icon, title, cls = 'text-gray-500 hover:bg-gray-100', onClick }) => (
  <button onClick={onClick} title={title} className={`p-1.5 rounded-lg transition-colors ${cls}`}>{icon}</button>
);

/** Section wrapper with a titled divider */
const Section: React.FC<{ title: string; declaration?: boolean; children: React.ReactNode }> = ({ title, declaration, children }) => (
  <div className="px-5 py-4 border-b border-gray-100 last:border-b-0">
    {declaration
      ? <p className="text-xs text-gray-600 italic leading-relaxed mb-3 border-l-4 border-orange-400 pl-3 bg-orange-50 py-2 rounded-r">{title}</p>
      : <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">{title}</p>
    }
    {children}
  </div>
);

/** Key-value field inside the form */
const KF: React.FC<{ label: string; value: unknown; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
    <p className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value ? String(value) : '?'}</p>
  </div>
);

/** Policy acceptance row */
const PolicyCheck: React.FC<{ label: string; date: string }> = ({ label, date }) => (
  <div className="flex items-start gap-2 text-sm">
    <span className="mt-0.5 shrink-0 w-4 h-4 rounded bg-green-500 flex items-center justify-center">
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </span>
    <span className="text-gray-700 flex-1" dangerouslySetInnerHTML={{ __html: label }} />
    <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">{date}</span>
  </div>
);


