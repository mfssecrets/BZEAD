/**
 * Seller Verification Page — Admin-Approval Identity Flow
 * Seller submits documents → Admin reviews → Approved / Rejected
 */

import React, { useState, useEffect } from 'react';
import { Shield, FileText, CheckCircle2, Clock, XCircle, ChevronRight } from 'lucide-react';
import { PageSkeleton } from '../../components/common/Skeleton';
import SellerKYCMultiStep from './kyc/SellerKYCMultiStep';
import { getSellerKYCStatus } from '../../lib/kycService';
import type { Seller, SellerKYC } from '../../types';

interface Props {
  seller: Seller;
  onStatusUpdate?: (updates: Partial<Seller>) => void;
  onCancel?: () => void;
}

type KYCState = 'loading' | 'none' | 'draft' | 'pending' | 'approved' | 'rejected';

export const SellerVerificationPage: React.FC<Props> = ({ seller, onStatusUpdate, onCancel }) => {
  const [kycState, setKycState] = useState<KYCState>('loading');
  const [kycData, setKycData] = useState<Partial<SellerKYC> | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      const { kycData: data } = await getSellerKYCStatus(seller.id);

      if (!data) { setKycState('none'); }
      else {
        setKycData(data);
        const validStates: KYCState[] = ['none', 'draft', 'pending', 'approved', 'rejected'];
        const status = (data.kyc_status as string) || 'none';
        setKycState(validStates.includes(status as KYCState) ? (status as KYCState) : 'none');
      }
    })();
  }, [seller.id]);

  if (showForm) {
    return (
      <div>
        <button onClick={() => setShowForm(false)} className="mb-6 text-gray-500 hover:text-gray-900 text-sm font-medium flex items-center gap-2">
          ← Back to identity status
        </button>
        <SellerKYCMultiStep
          sellerId={seller.id}
          sellerEmail={seller.email}
          sellerPhone={seller.phone}
          sellerName={seller.shop_name}
          sellerCountry={seller.country || ''}
          onComplete={() => {
            onStatusUpdate?.({ kyc_status: 'pending' });
            setKycState('pending');
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  if (kycState === 'loading') {
    return <PageSkeleton variant="plain" />;
  }

  return (
    <div className="max-w-3xl mx-auto px-2 sm:px-0">
      <div className="text-center mb-6 sm:mb-10">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
          <Shield size={22} className="text-white sm:hidden" />
          <Shield size={28} className="text-white hidden sm:block" />
        </div>
        <h1 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">Seller Verification</h1>
        <p className="text-gray-500 text-xs sm:text-sm">Complete identity verification to start selling on Beauzead.</p>
      </div>

      {/* Identity Status Card */}
      <div className={`rounded-2xl border-2 p-4 sm:p-8 mb-4 sm:mb-6 ${STATUS[kycState].border}`}>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${STATUS[kycState].iconBg}`}>
            {STATUS[kycState].icon}
          </div>
          <div className="flex-1">
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-1">{STATUS[kycState].title}</h2>
            <p className="text-gray-500 text-xs sm:text-sm mb-3 sm:mb-4">{STATUS[kycState].desc}</p>
            {kycState === 'rejected' && kycData?.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-red-700 mb-1">Rejection Reason:</p>
                <p className="text-sm text-red-600">{kycData.rejection_reason}</p>
              </div>
            )}
            {kycState === 'approved' && kycData?.verified_at && (
              <p className="text-xs text-green-600">Approved on {new Date(kycData.verified_at).toLocaleDateString()}</p>
            )}
            {kycState === 'pending' && kycData?.submitted_at && (
              <p className="text-xs text-amber-600">Submitted on {new Date(kycData.submitted_at).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </div>

      {(kycState === 'none' || kycState === 'draft' || kycState === 'rejected') && (
        <button onClick={() => setShowForm(true)} className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 text-white font-semibold py-4 rounded-xl transition-colors">
          <FileText size={20} />
          {kycState === 'rejected' ? 'Resubmit Identity Documents' : 'Start Identity Verification'}
          <ChevronRight size={18} />
        </button>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h4 className="text-gray-900 font-semibold text-sm mb-2">How it works</h4>
        <ol className="text-gray-600 text-sm space-y-2 list-decimal list-inside">
          <li>Submit your tax, identity, address, and bank documents</li>
          <li>Admin reviews your submission (1-3 business days)</li>
          <li>Once approved, start listing products on Beauzead!</li>
        </ol>
      </div>

      {onCancel && (
        <div className="mt-6 text-center">
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-900 text-sm font-medium">Back to Dashboard</button>
        </div>
      )}
    </div>
  );
};

const STATUS: Record<Exclude<KYCState, 'loading'>, { border: string; iconBg: string; icon: React.ReactNode; title: string; desc: string }> = {
  none:     { border: 'border-gray-200',  iconBg: 'bg-gray-100',  icon: <FileText size={22} className="text-gray-400" />,     title: 'Not Started',      desc: 'You haven\'t submitted any verification documents yet.' },
  draft:    { border: 'border-gray-200',  iconBg: 'bg-gray-100',  icon: <FileText size={22} className="text-gray-400" />,     title: 'Draft',            desc: 'Your identity form is saved as a draft. Complete and submit for review.' },
  pending:  { border: 'border-amber-300', iconBg: 'bg-amber-100', icon: <Clock size={22} className="text-amber-500" />,       title: 'Under Review',     desc: 'Your documents are being reviewed by our admin team.' },
  approved: { border: 'border-green-300', iconBg: 'bg-green-100', icon: <CheckCircle2 size={22} className="text-green-500" />,title: 'Identity Verified',  desc: 'Your identity has been verified. You can now list products on Beauzead.' },
  rejected: { border: 'border-red-300',   iconBg: 'bg-red-100',   icon: <XCircle size={22} className="text-red-500" />,       title: 'Changes Required', desc: 'Your submission was returned. Please review the reason and resubmit.' },
};

export default SellerVerificationPage;
