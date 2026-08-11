/**
 * SellerVerificationWrapper — Standalone route wrapper for /seller/verify
 * Fetches seller KYC status and renders the SellerVerificationPage.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getSellerKYCStatus } from '../../lib/kycService';
import { SellerVerificationPage } from './SellerVerificationPage';
import { PageSkeleton } from '../../components/common/Skeleton';
import type { Seller } from '../../types';

// Module-level cache keyed by sellerId — survives unmounts so revisits skip the spinner
// while a silent background refresh updates the cache.
const sellerKycStatusCache: Record<string, string> = {};

export const SellerVerificationWrapper: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentAuthUser } = useAuth();
  const sellerId = user?.id || currentAuthUser?.userId || '';
  const cachedStatus = sellerId ? sellerKycStatusCache[sellerId] : undefined;
  const [loading, setLoading] = useState(() => !cachedStatus);
  const [kycStatus, setKycStatus] = useState<string>(() => cachedStatus || 'unverified');

  const sellerEmail = user?.email || currentAuthUser?.email || '';
  const sellerPhone = user?.phone || currentAuthUser?.attributes?.phone_number || '';
  const sellerFullName = user?.full_name || currentAuthUser?.attributes?.name || 'Seller';

  useEffect(() => {
    if (!sellerId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { kycData } = await getSellerKYCStatus(sellerId);
        if (kycData?.kyc_status) {
          setKycStatus(kycData.kyc_status);
          sellerKycStatusCache[sellerId] = kycData.kyc_status;
        }
      } catch (err) {
        console.error('Failed to fetch KYC status:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sellerId]);

  if (loading) {
    return <PageSkeleton variant="plain" />;
  }

  const kycStatusMap: Record<string, Seller['kyc_status']> = {
    approved: 'approved',
    pending: 'pending',
    rejected: 'rejected',
    draft: 'pending',
  };

  const seller: Seller = {
    id: sellerId,
    user_id: sellerId,
    shop_name: sellerFullName,
    email: sellerEmail,
    phone: sellerPhone,
    total_listings: 0,
    kyc_status: kycStatusMap[kycStatus] || 'pending',
    product_approval_status: 'pending',
    created_at: new Date().toISOString(),
    is_active: true,
  };

  return (
    <div className="py-12 px-4">
      <SellerVerificationPage
        seller={seller}
        onStatusUpdate={(updates) => {
          if (updates.kyc_status) {
            setKycStatus(updates.kyc_status);
          }
        }}
        onCancel={() => navigate('/seller/dashboard')}
      />
    </div>
  );
};

export default SellerVerificationWrapper;
