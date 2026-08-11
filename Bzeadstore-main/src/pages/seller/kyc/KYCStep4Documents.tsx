/**
 * KYCStep4Documents — Step 4: Document Upload & Compliance
 *
 * Uploads:
 *  1. Identity Document (front + back)
 *  2. Business Registration Certificate (optional)
 *  3. Tax Document (optional for individuals)
 *  4. Bank Account Proof (cancelled cheque / bank statement / bank letter)
 *
 * Compliance: 3 checkboxes — KYC consent, document authenticity, T&C agreement
 * Submit: locks form, generates Reference Number, sets status to "Pending Review"
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Loader2, Upload, X, FileText, Check } from 'lucide-react';

/* ──────────────────────── Country → ID types mapping ──────────── */
// IMPORTANT: Must match the DB check constraint `seller_kyc_id_type_check`
// and the shared TS types in `src/types`.
const normalizeIdType = (value: string): string => {
  const v = (value || '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    aadhaar: 'aadhar',
    aadhar: 'aadhar',
    passport: 'passport',
    voter: 'voter',
    voter_id: 'voter',
    voterid: 'voter',
    driving_license: 'driver_license',
    driving_licence: 'driver_license',
    drivers_license: 'driver_license',
    drivers_licence: 'driver_license',
    driver_license: 'driver_license',
    driver_licence: 'driver_license',
  };
  return aliases[v] || value;
};

const ID_TYPES_BY_COUNTRY: Record<string, { value: string; label: string }[]> = {
  India: [
    { value: 'aadhar', label: 'Aadhaar Card' },
    { value: 'passport', label: 'Passport' },
    { value: 'voter', label: 'Voter ID' },
    { value: 'driver_license', label: 'Driving Licence' },
  ],
  'United States': [
    { value: 'passport', label: 'Passport' },
    { value: 'driver_license', label: "Driver's License" },
  ],
  'United Kingdom': [
    { value: 'passport', label: 'Passport' },
    { value: 'driver_license', label: "Driver's Licence" },
  ],
  'United Arab Emirates': [
    { value: 'passport', label: 'Passport' },
    { value: 'driver_license', label: 'Driving Licence' },
  ],
  Canada: [
    { value: 'passport', label: 'Passport' },
    { value: 'driver_license', label: "Driver's License" },
  ],
  Australia: [
    { value: 'passport', label: 'Passport' },
    { value: 'driver_license', label: "Driver's Licence" },
  ],
};
const DEFAULT_ID_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'driver_license', label: "Driver's License" },
];

/* ──────────────────────── Types ───────────────────────────────── */
interface DocSlot {
  file: File | null;
  preview: string;
  name: string;
}

export interface DocumentsData {
  id_type: string;
  id_front_file: File | null;
  id_back_file: File | null;
  id_front_url: string;
  id_back_url: string;
  business_reg_file: File | null;
  business_reg_url: string;
  tax_doc_file: File | null;
  tax_doc_url: string;
  bank_proof_file: File | null;
  bank_proof_url: string;
  pep_declaration: boolean;
  sanctions_check: boolean;
  terms_accepted: boolean;
}

interface Props {
  sellerCountry: string;
  initialData?: Partial<DocumentsData>;
  onSubmit: (data: DocumentsData) => Promise<void>;
  onCancel: () => void;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ACCEPTED = '.jpg,.jpeg,.png,.pdf';

/* ──────────────────────── Component ──────────────────────────── */
const KYCStep4Documents: React.FC<Props> = ({ sellerCountry, initialData, onSubmit, onCancel }) => {
  const idTypes = useMemo(
    () => ID_TYPES_BY_COUNTRY[sellerCountry] || DEFAULT_ID_TYPES,
    [sellerCountry],
  );

  const [idType, setIdType] = useState(normalizeIdType(initialData?.id_type || ''));

  const [idFront, setIdFront] = useState<DocSlot>({ file: null, preview: initialData?.id_front_url || '', name: '' });
  const [idBack, setIdBack] = useState<DocSlot>({ file: null, preview: initialData?.id_back_url || '', name: '' });
  const [businessReg, setBusinessReg] = useState<DocSlot>({ file: null, preview: initialData?.business_reg_url || '', name: '' });
  const [taxDoc, setTaxDoc] = useState<DocSlot>({ file: null, preview: initialData?.tax_doc_url || '', name: '' });
  const [bankProof, setBankProof] = useState<DocSlot>({ file: null, preview: initialData?.bank_proof_url || '', name: '' });

  const [pep, setPep] = useState(initialData?.pep_declaration || false);
  const [sanctions, setSanctions] = useState(initialData?.sanctions_check || false);
  const [terms, setTerms] = useState(initialData?.terms_accepted || false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  /* ── file picker helper ──────────────────────────────────────── */
  const pickFile = useCallback(
    (setter: React.Dispatch<React.SetStateAction<DocSlot>>, fieldKey: string) => () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPTED;
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
          setErrors(p => ({ ...p, [fieldKey]: `File exceeds 15 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` }));
          return;
        }
        setErrors(p => { const n = { ...p }; delete n[fieldKey]; return n; });
        setter({ file, preview: URL.createObjectURL(file), name: file.name });
      };
      input.click();
    },
    [],
  );

  const clearFile = useCallback(
    (setter: React.Dispatch<React.SetStateAction<DocSlot>>) => () => {
      setter({ file: null, preview: '', name: '' });
    },
    [],
  );

  /* ── validation ──────────────────────────────────────────────── */
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!idType) e.id_type = 'Select an identity document type';
    if (!idFront.file && !idFront.preview) e.id_front = 'Front image is required';
    // back is optional for some docs (passport) — soft skip
    if (!bankProof.file && !bankProof.preview) e.bank_proof = 'Bank account proof is required';
    if (!pep) e.pep = 'Required';
    if (!sanctions) e.sanctions = 'Required';
    if (!terms) e.terms = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── submit ──────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        id_type: idType,
        id_front_file: idFront.file,
        id_back_file: idBack.file,
        id_front_url: idFront.preview,
        id_back_url: idBack.preview,
        business_reg_file: businessReg.file,
        business_reg_url: businessReg.preview,
        tax_doc_file: taxDoc.file,
        tax_doc_url: taxDoc.preview,
        bank_proof_file: bankProof.file,
        bank_proof_url: bankProof.preview,
        pep_declaration: pep,
        sanctions_check: sanctions,
        terms_accepted: terms,
      });
    } catch (err) {
      setErrors({ _general: (err as Error).message });
    } finally {
      setSubmitting(false);
      setShowSubmitConfirm(false);
    }
  };

  /* ── render helpers ──────────────────────────────────────────── */
  const FileSlot: React.FC<{
    label: string;
    required?: boolean;
    slot: DocSlot;
    onPick: () => void;
    onClear: () => void;
    errorKey: string;
  }> = ({ label, required, slot, onPick, onClear, errorKey }) => (
    <div>
      <label className="block text-sm font-medium text-gray-900 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
        {!required && <span className="text-gray-400 text-xs">(optional)</span>}
      </label>
      {slot.file || slot.preview ? (
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg p-2 bg-gray-50">
          <FileText size={18} className="text-blue-700 shrink-0" />
          <span className="text-sm text-gray-700 truncate flex-1">{slot.name || 'Uploaded'}</span>
          <Check size={14} className="text-green-600 shrink-0" />
          <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-500">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className={`w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 text-sm transition-colors ${
            errors[errorKey] ? 'border-red-400 text-red-500' : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'
          }`}
        >
          <Upload size={16} />
          Upload {label}
        </button>
      )}
      {errors[errorKey] && <p className="text-xs text-red-500 mt-1">{errors[errorKey]}</p>}
      <p className="text-xs text-gray-400 mt-1">JPG, PNG or PDF — max 15 MB</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Document Upload</h2>
        <p className="text-sm text-gray-500 mt-1">Upload verification documents and accept compliance terms.</p>
      </div>

      {errors._general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors._general}</div>
      )}

      {/* ── 1. Identity Document ─────────────────────────────────── */}
      <fieldset className="border border-gray-200 rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-900 px-2">1. Identity Document</legend>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Document Type <span className="text-red-500">*</span></label>
          <select
            value={idType}
            onChange={e => { setIdType(e.target.value); if (errors.id_type) setErrors(p => { const n = { ...p }; delete n.id_type; return n; }); }}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.id_type ? 'border-red-400' : 'border-gray-300'}`}
          >
            <option value="">Select document type</option>
            {idTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {errors.id_type && <p className="text-xs text-red-500 mt-1">{errors.id_type}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileSlot label="Front Image" required slot={idFront} onPick={pickFile(setIdFront, 'id_front')} onClear={clearFile(setIdFront)} errorKey="id_front" />
          <FileSlot label="Back Image" slot={idBack} onPick={pickFile(setIdBack, 'id_back')} onClear={clearFile(setIdBack)} errorKey="id_back" />
        </div>
      </fieldset>

      {/* ── 2. Business Registration (optional) ──────────────────── */}
      <fieldset className="border border-gray-200 rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-900 px-2">2. Business Registration Certificate</legend>
        <FileSlot label="Registration Certificate" slot={businessReg} onPick={pickFile(setBusinessReg, 'business_reg')} onClear={clearFile(setBusinessReg)} errorKey="business_reg" />
      </fieldset>

      {/* ── 3. Tax Document (optional for individuals) ────────────── */}
      <fieldset className="border border-gray-200 rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-900 px-2">3. Tax Document</legend>
        <FileSlot label="Tax Proof" slot={taxDoc} onPick={pickFile(setTaxDoc, 'tax_doc')} onClear={clearFile(setTaxDoc)} errorKey="tax_doc" />
      </fieldset>

      {/* ── 4. Bank Account Proof ─────────────────────────────────── */}
      <fieldset className="border border-gray-200 rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-900 px-2">4. Bank Account Proof</legend>
        <FileSlot label="Cancelled Cheque / Bank Statement / Bank Letter" required slot={bankProof} onPick={pickFile(setBankProof, 'bank_proof')} onClear={clearFile(setBankProof)} errorKey="bank_proof" />
      </fieldset>

      {/* ── Compliance ─────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Compliance & Declarations</h3>

        <label className={`flex items-start gap-3 cursor-pointer ${errors.pep ? 'text-red-600' : ''}`}>
          <input type="checkbox" checked={pep} onChange={e => { setPep(e.target.checked); if (errors.pep) setErrors(p => { const n = { ...p }; delete n.pep; return n; }); }} className="mt-0.5 w-4 h-4 accent-blue-800" />
          <span className="text-sm text-gray-700">I consent to BzeadStore performing identity verification on my submitted information and documents.</span>
        </label>

        <label className={`flex items-start gap-3 cursor-pointer ${errors.sanctions ? 'text-red-600' : ''}`}>
          <input type="checkbox" checked={sanctions} onChange={e => { setSanctions(e.target.checked); if (errors.sanctions) setErrors(p => { const n = { ...p }; delete n.sanctions; return n; }); }} className="mt-0.5 w-4 h-4 accent-blue-800" />
          <span className="text-sm text-gray-700">I declare that all documents and information provided are authentic, accurate, and belong to me.</span>
        </label>

        <label className={`flex items-start gap-3 cursor-pointer ${errors.terms ? 'text-red-600' : ''}`}>
          <input type="checkbox" checked={terms} onChange={e => { setTerms(e.target.checked); if (errors.terms) setErrors(p => { const n = { ...p }; delete n.terms; return n; }); }} className="mt-0.5 w-4 h-4 accent-blue-800" />
          <span className="text-sm text-gray-700">I agree to BzeadStore's <a href="/terms" target="_blank" className="text-blue-700 underline">Terms of Service</a> and <a href="/privacy" target="_blank" className="text-blue-700 underline">Privacy Policy</a>.</span>
        </label>

        {(errors.pep || errors.sanctions || errors.terms) && (
          <p className="text-xs text-red-500">All compliance checkboxes are required.</p>
        )}
      </div>

      {/* ── Buttons ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => { if (validate()) setShowSubmitConfirm(true); }}
          disabled={submitting}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 className="animate-spin" size={14} />}
          Submit Identity
        </button>
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] p-4" onClick={() => !submitting && setShowSubmitConfirm(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Identity Submission</h3>
            <p className="text-sm text-gray-600 mb-6">
              Submit your identity documents now for review? You can update them later only if changes are requested.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                disabled={submitting}
                className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2.5 bg-blue-800 text-white rounded-lg hover:bg-blue-900 font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={14} /> : null}
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KYCStep4Documents;
