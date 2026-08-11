/**
 * SellerKYCMultiStep — Main 4-step KYC orchestrator
 *
 * Step 1 — Personal Information
 * Step 2 — Business Details
 * Step 3 — Bank Details
 * Step 4 — Document Upload & Submit
 *
 * Features:
 *  - Step indicator with progress
 *  - Save & Next auto-saves draft to DB per step
 *  - Resume from last completed step
 *  - Only ONE active KYC per seller
 *  - Generates KYC Form ID (step 1) and Reference Number (final submit)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { PageSkeleton } from '../../../components/common/Skeleton';
import { supabase } from '../../../lib/supabase';
import { uploadKYCDocument } from '../../../lib/kycService';
import { logger } from '../../../utils/logger';
import { formatFrontend12DigitId } from '../../../utils/idFormatter';
import KYCStep1Personal from './KYCStep1Personal';
import KYCStep2Business from './KYCStep2Business';
import KYCStep3Bank from './KYCStep3Bank';
import KYCStep4Documents from './KYCStep4Documents';
import type { DocumentsData } from './KYCStep4Documents';

/* ─── Types ───────────────────────────────────────────────────── */

interface KYCDraft {
  id?: string;
  kyc_form_id?: string;
  current_step: number;
  completed_steps: number[];
  // Step 1
  full_name?: string;
  email?: string;
  phone?: string;
  country?: string;
  country_id?: string;
  street_address_1?: string;
  street_address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  landmark?: string;
  // Step 2
  business_type_id?: string;
  business_name?: string;
  business_registration_number?: string;
  tax_type?: string;
  tax_id_number?: string;
  brand_name?: string;
  business_street_address_1?: string;
  business_street_address_2?: string;
  business_city?: string;
  business_state?: string;
  business_postal_code?: string;
  business_country?: string;
  declaration_accepted?: boolean;
  // Step 3
  bank_holder_name?: string;
  bank_name?: string;
  branch_name?: string;
  account_number?: string;
  swift_routing_code?: string;
  account_type?: 'checking' | 'savings' | 'current';
  bank_authorization?: boolean;
  ifsc_code?: string;
  // Step 4
  id_type?: string;
  id_document_url?: string;
  id_back_url?: string;
  business_reg_url?: string;
  tax_doc_url?: string;
  bank_statement_url?: string;
  pep_declaration?: boolean;
  sanctions_check?: boolean;
  terms_accepted?: boolean;
}

interface Props {
  sellerId: string;
  sellerEmail: string;
  sellerPhone?: string;
  sellerName?: string;
  sellerCountry: string;
  onComplete: () => void;
  onCancel: () => void;
}

const STEPS = [
  { num: 1, label: 'Personal Info' },
  { num: 2, label: 'Business Details' },
  { num: 3, label: 'Bank Details' },
  { num: 4, label: 'Documents' },
];

/* ─── Helpers ──────────────────────────────────────────────────── */

const generateFormId = () => `KYC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
const generateRefNumber = () => `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

/* ─── Component ────────────────────────────────────────────────── */

const SellerKYCMultiStep: React.FC<Props> = ({ sellerId, sellerEmail, sellerPhone: _sellerPhone, sellerName: _sellerName, sellerCountry, onComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [draft, setDraft] = useState<KYCDraft>({ current_step: 1, completed_steps: [] });
  const [kycFormId, setKycFormId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [refNumber, setRefNumber] = useState('');

  /* ── Load existing draft ─────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('seller_kyc')
          .select('*')
          .eq('seller_id', sellerId)
          .in('kyc_status', ['draft'])
          .maybeSingle();

        if (data) {
          // Hydrate UI-only draft fields from JSONB blobs stored in the DB
          const draft = data as Record<string, unknown>;
          const businessAddress = draft.business_address;
          if (businessAddress && typeof businessAddress === 'object') {
            const ba = businessAddress as Record<string, unknown>;
            const residential = ba.residential;
            if (residential && typeof residential === 'object') {
              const r = residential as Record<string, unknown>;
              draft.street_address_1 = draft.street_address_1 || (r.street_address_1 as string) || '';
              draft.street_address_2 = draft.street_address_2 || (r.street_address_2 as string) || '';
              draft.city = draft.city || (r.city as string) || '';
              draft.state = draft.state || (r.state as string) || '';
              draft.postal_code = draft.postal_code || (r.postal_code as string) || '';
              draft.landmark = draft.landmark || (r.landmark as string) || '';
            }

            const documents = ba.documents;
            if (documents && typeof documents === 'object') {
              const d = documents as Record<string, unknown>;
              draft.id_document_url = draft.id_document_url || (d.id_front as string) || '';
              draft.id_back_url = draft.id_back_url || (d.id_back as string) || '';
              draft.business_reg_url = draft.business_reg_url || (d.business_reg as string) || '';
              draft.tax_doc_url = draft.tax_doc_url || (d.tax_doc as string) || '';
              draft.bank_statement_url = draft.bank_statement_url || (d.bank_proof as string) || '';
            }
          }

          const steps = data.completed_steps || [];
          const step = data.current_step || (steps.length > 0 ? Math.max(...steps) + 1 : 1);
          setDraft({
            ...data,
            current_step: step,
            completed_steps: steps,
          });
          setCompletedSteps(steps);
          setCurrentStep(Math.min(step, 4));
          setKycFormId(data.kyc_form_id || generateFormId());
        } else {
          setKycFormId(generateFormId());
        }
      } catch (err) {
        logger.error(err as Error, { context: 'KYCMultiStep: load draft' });
        setKycFormId(generateFormId());
      } finally {
        setLoading(false);
      }
    })();
  }, [sellerId]);

  /* ── Save draft helper (upsert per step) ─────────────────────── */
  const saveDraft = useCallback(async (stepData: Partial<KYCDraft>, stepNum: number) => {
    const newCompleted = Array.from(new Set([...completedSteps, stepNum])).sort();
    const nextStep = Math.min(stepNum + 1, 4);

    // Split out Step-1 residential fields (these are not DB columns; they are stored in JSONB)
    const {
      street_address_1,
      street_address_2,
      city,
      state,
      postal_code,
      landmark,
      ...safeStepData
    } = stepData as Partial<KYCDraft> & Record<string, unknown>;

    // Build the address JSONB from step-1 residential fields
    const addressJsonb = street_address_1
      ? {
          street_address_1: street_address_1 as string,
          street_address_2: (street_address_2 as string) || '',
          city: (city as string) || '',
          state: (state as string) || '',
          postal_code: (postal_code as string) || '',
          landmark: (landmark as string) || '',
        }
      : undefined;

    const row: Record<string, unknown> = {
      seller_id: sellerId,
      email: draft.email || sellerEmail,
      kyc_form_id: kycFormId,
      kyc_status: 'draft',
      current_step: nextStep,
      completed_steps: newCompleted,
      ...safeStepData,
    };

    if (addressJsonb) {
      row.business_address = {
        ...((draft as unknown as Record<string, unknown>).business_address || {}),
        residential: addressJsonb,
      };
    }

    // Remove non-DB fields
    delete row.country_id;

    const { error } = await supabase
      .from('seller_kyc')
      .upsert(row, { onConflict: 'seller_id' });

    if (error) throw new Error(error.message);

    setCompletedSteps(newCompleted);
    setDraft(prev => ({ ...prev, ...stepData, current_step: nextStep, completed_steps: newCompleted }));
    setCurrentStep(nextStep);
  }, [sellerId, sellerEmail, kycFormId, completedSteps, draft]);

  /* ── Step handlers ───────────────────────────────────────────── */

  const handleStep1Save = useCallback(async (data: {
    full_name: string; email: string; phone: string; country: string;
    country_id: string; street_address_1: string; street_address_2: string;
    city: string; state: string; postal_code: string; landmark: string;
  }) => {
    await saveDraft({
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      country: data.country,
      country_id: data.country_id,
      street_address_1: data.street_address_1,
      street_address_2: data.street_address_2,
      city: data.city,
      state: data.state,
      postal_code: data.postal_code,
      landmark: data.landmark,
    }, 1);
  }, [saveDraft]);

  const handleStep2Save = useCallback(async (data: {
    business_type_id: string; business_name: string; business_registration_number: string;
    tax_type: string; tax_id_number: string; brand_name: string;
    business_street_address_1: string; business_street_address_2: string;
    business_city: string; business_state: string; business_postal_code: string;
    business_country: string; declaration_accepted: boolean;
  }) => {
    await saveDraft({
      business_type_id: data.business_type_id,
      business_name: data.business_name,
      business_registration_number: data.business_registration_number,
      tax_type: data.tax_type,
      tax_id_number: data.tax_id_number,
      brand_name: data.brand_name,
      business_street_address_1: data.business_street_address_1,
      business_street_address_2: data.business_street_address_2,
      business_city: data.business_city,
      business_state: data.business_state,
      business_postal_code: data.business_postal_code,
      business_country: data.business_country,
      declaration_accepted: data.declaration_accepted,
    }, 2);
  }, [saveDraft]);

  const handleStep3Save = useCallback(async (data: {
    bank_holder_name: string; bank_name: string; branch_name: string;
    account_number: string; swift_routing_code: string;
    account_type: 'checking' | 'savings' | 'current'; bank_authorization: boolean;
  }) => {
    await saveDraft({
      bank_holder_name: data.bank_holder_name,
      bank_name: data.bank_name,
      branch_name: data.branch_name,
      account_number: data.account_number,
      swift_routing_code: data.swift_routing_code,
      ifsc_code: data.swift_routing_code,
      account_type: data.account_type,
      bank_authorization: data.bank_authorization,
    }, 3);
  }, [saveDraft]);

  const handleStep4Submit = useCallback(async (data: DocumentsData) => {
    // Upload files
    const uploads: { field: string; file: File | null; docType: string }[] = [
      { field: 'id_document_url', file: data.id_front_file, docType: 'id_front' },
      { field: 'id_back_url', file: data.id_back_file, docType: 'id_back' },
      { field: 'business_reg_url', file: data.business_reg_file, docType: 'business_reg' },
      { field: 'tax_doc_url', file: data.tax_doc_file, docType: 'tax_doc' },
      { field: 'bank_statement_url', file: data.bank_proof_file, docType: 'bank_proof' },
    ];

    const urls: Record<string, string> = {};
    for (const { field, file, docType } of uploads) {
      if (file) {
        const res = await uploadKYCDocument(sellerId, file, docType);
        if (!res.success) throw new Error(`${docType} upload failed: ${res.error}`);
        urls[field] = res.url || '';
      }
    }

    // Save doc uploads and submit KYC for review (final step)
    const docDraft: Partial<KYCDraft> = {
      id_type: data.id_type,
      id_document_url: urls.id_document_url || data.id_front_url || draft.id_document_url || '',
      id_back_url: urls.id_back_url || data.id_back_url || draft.id_back_url || '',
      business_reg_url: urls.business_reg_url || data.business_reg_url || draft.business_reg_url || '',
      tax_doc_url: urls.tax_doc_url || data.tax_doc_url || draft.tax_doc_url || '',
      bank_statement_url: urls.bank_statement_url || data.bank_proof_url || draft.bank_statement_url || '',
      pep_declaration: data.pep_declaration,
      sanctions_check: data.sanctions_check,
      terms_accepted: data.terms_accepted,
    };

    // Merge doc URLs into business_address JSONB
    const existingAddr = (draft as unknown as Record<string, unknown>).business_address || {};
    const updatedAddr = {
      ...(typeof existingAddr === 'object' ? existingAddr : {}),
      documents: {
        id_front: urls.id_document_url || data.id_front_url || '',
        id_back: urls.id_back_url || data.id_back_url || '',
        business_reg: urls.business_reg_url || data.business_reg_url || '',
        tax_doc: urls.tax_doc_url || data.tax_doc_url || '',
        bank_proof: urls.bank_statement_url || data.bank_proof_url || '',
      },
    };

    // Final submit — mark KYC as pending review
    const ref = generateRefNumber();
    const newCompleted = [1, 2, 3, 4];
    const row: Record<string, unknown> = {
      seller_id: sellerId,
      email: draft.email || sellerEmail,
      kyc_form_id: kycFormId,
      kyc_status: 'pending',
      reference_number: ref,
      current_step: 4,
      completed_steps: newCompleted,
      submitted_at: new Date().toISOString(),
      ...docDraft,
      business_address: updatedAddr,
    };
    delete row.country_id;

    const { error } = await supabase
      .from('seller_kyc')
      .upsert(row, { onConflict: 'seller_id' });
    if (error) throw new Error(error.message);

    setRefNumber(ref);
    setSubmitted(true);
  }, [sellerId, sellerEmail, kycFormId, completedSteps, draft]);

  /* ── Render ──────────────────────────────────────────────────── */

  if (loading) {
    return <PageSkeleton variant="form" />;
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Identity Submitted Successfully</h2>
        <p className="text-gray-500 mb-6">Your application is now under review. You'll be notified once verified.</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-500">Identity Form ID</span>
            <span className="font-medium text-gray-900 font-mono">{formatFrontend12DigitId(kycFormId)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Reference Number</span>
            <span className="font-medium text-gray-900">{refNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className="font-medium text-amber-600">Pending Review</span>
          </div>
        </div>
        <button
          onClick={onComplete}
          className="px-6 py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-medium rounded-lg transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* KYC Form ID */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Identity Verification</h1>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">Form ID: {formatFrontend12DigitId(kycFormId)}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const isCompleted = completedSteps.includes(s.num);
          const isCurrent = currentStep === s.num;
          return (
            <React.Fragment key={s.num}>
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isCompleted ? 'bg-green-500 text-white' :
                  isCurrent ? 'bg-blue-800 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {isCompleted ? <CheckCircle2 size={16} /> : s.num}
                </div>
                <span className={`text-xs mt-1 whitespace-nowrap ${isCurrent ? 'text-blue-800 font-semibold' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
        {currentStep === 1 && (
          <KYCStep1Personal
            sellerId={sellerId}
            initialData={draft}
            onSaveNext={handleStep1Save}
            onCancel={onCancel}
          />
        )}
        {currentStep === 2 && (
          <KYCStep2Business
            sellerId={sellerId}
            sellerCountry={draft.country || sellerCountry}
            initialData={draft}
            onSaveNext={handleStep2Save}
            onCancel={onCancel}
          />
        )}
        {currentStep === 3 && (
          <KYCStep3Bank
            initialData={draft}
            onSaveNext={handleStep3Save}
            onCancel={onCancel}
          />
        )}
        {currentStep === 4 && (
          <KYCStep4Documents
            sellerCountry={draft.country || sellerCountry}
            initialData={{
              id_type: draft.id_type,
              id_front_url: draft.id_document_url,
              id_back_url: draft.id_back_url,
              business_reg_url: draft.business_reg_url,
              tax_doc_url: draft.tax_doc_url,
              bank_proof_url: draft.bank_statement_url,
              pep_declaration: draft.pep_declaration,
              sanctions_check: draft.sanctions_check,
              terms_accepted: draft.terms_accepted,
            }}
            onSubmit={handleStep4Submit}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
};

export default SellerKYCMultiStep;
