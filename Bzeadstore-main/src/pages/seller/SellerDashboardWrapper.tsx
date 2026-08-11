import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SellerDashboard from './SellerDashboard';
import SellerLayout from './SellerLayout';
import { logger } from '../../utils/logger';
import { PageSkeleton } from '../../components/common/Skeleton';
import { getSellerKYCStatus } from '../../lib/kycService';
import { supabase } from '../../lib/supabase';

interface SellerDashboardProfileData {
  name: string;
  email: string;
  mobile: string;
  brandName: string;
  businessType: string;
  businessAddress: string;
  country: string;
}

// Module-level cache keyed by sellerId — survives unmounts so revisits render instantly
// while a silent background refresh updates the cache.
interface DashboardCacheEntry {
  verificationStatus: 'unverified' | 'pending' | 'verified';
  profileData: SellerDashboardProfileData;
}
const sellerDashboardWrapperCache: Record<string, DashboardCacheEntry> = {};

export const SellerDashboardWrapper: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, currentAuthUser } = useAuth();

  const sellerIdEarly = user?.id || currentAuthUser?.userId || '';
  const cachedEntry = sellerIdEarly ? sellerDashboardWrapperCache[sellerIdEarly] : undefined;

  const [verificationStatus, setVerificationStatus] = useState<'unverified' | 'pending' | 'verified'>(() => cachedEntry?.verificationStatus || 'unverified');
  const [loading, setLoading] = useState(() => !cachedEntry);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<SellerDashboardProfileData>(() => cachedEntry?.profileData || {
    name: '',
    email: '',
    mobile: '',
    brandName: '',
    businessType: '',
    businessAddress: '',
    country: '',
  });

  const sellerId = user?.id || currentAuthUser?.userId;
  const sellerEmail = user?.email || currentAuthUser?.email || currentAuthUser?.attributes?.email || '';
  const sellerPhone = user?.phone || currentAuthUser?.attributes?.phone_number || '';
  const sellerFullName = user?.full_name || currentAuthUser?.attributes?.name || '';
  const sellerCountry = user?.country || currentAuthUser?.attributes?.country || '';

  // Fetch seller verification status
  useEffect(() => {
    if (sellerId) {
      fetchSellerStatus();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const fetchSellerStatus = async () => {
    try {
      const hasCache = !!sellerId && !!sellerDashboardWrapperCache[sellerId];
      if (!hasCache) setLoading(true);
      setError(null);

      const [{ kycData, error: kycError }, { data: profile, error: profileError }] = await Promise.all([
        getSellerKYCStatus(sellerId!),
        supabase
          .from('profiles')
          .select('full_name, email, phone, country_id, business_type_id')
          .eq('id', sellerId!)
          .maybeSingle(),
      ]);

      let countryName = sellerCountry || '';
      if (profile?.country_id) {
        const { data: countryData } = await supabase
          .from('countries')
          .select('country_name')
          .eq('id', profile.country_id)
          .maybeSingle();
        countryName = countryData?.country_name || countryName;
      }

      let businessTypeName = '';
      if (profile?.business_type_id) {
        const { data: businessTypeData } = await supabase
          .from('business_types')
          .select('type_name')
          .eq('id', profile.business_type_id)
          .maybeSingle();
        businessTypeName = businessTypeData?.type_name || '';
      }

      const addressParts = [
        (kycData as any)?.business_street_address_1,
        (kycData as any)?.business_street_address_2,
        (kycData as any)?.business_city,
        (kycData as any)?.business_state,
        (kycData as any)?.business_postal_code,
      ]
        .filter(Boolean)
        .map((v) => String(v).trim())
        .filter(Boolean);

      setProfileData({
        name: profile?.full_name || sellerFullName || '',
        email: profile?.email || sellerEmail || '',
        mobile: profile?.phone || sellerPhone || '',
        brandName: String((kycData as any)?.brand_name || (kycData as any)?.business_name || ''),
        businessType: String((kycData as any)?.business_type_name || businessTypeName || ''),
        businessAddress: addressParts.join(', '),
        country: String((kycData as any)?.business_country || countryName || sellerCountry || ''),
      });
      const builtProfile: SellerDashboardProfileData = {
        name: profile?.full_name || sellerFullName || '',
        email: profile?.email || sellerEmail || '',
        mobile: profile?.phone || sellerPhone || '',
        brandName: String((kycData as any)?.brand_name || (kycData as any)?.business_name || ''),
        businessType: String((kycData as any)?.business_type_name || businessTypeName || ''),
        businessAddress: addressParts.join(', '),
        country: String((kycData as any)?.business_country || countryName || sellerCountry || ''),
      };

      if (profileError) {
        logger.error(new Error(profileError.message), { context: 'SellerDashboardWrapper: profile load error' });
      }

      if (kycError) {
        // No KYC record yet — default to unverified
        setVerificationStatus('unverified');
        if (sellerId) sellerDashboardWrapperCache[sellerId] = { verificationStatus: 'unverified', profileData: builtProfile };
      } else if (kycData) {
        const status = kycData.kyc_status || 'unverified';
        // KYC approval alone grants 'verified' — warehouse is now a separate flow
        const mapped = status === 'approved' ? 'verified' : status === 'pending' ? 'pending' : 'unverified';
        setVerificationStatus(mapped as 'unverified' | 'pending' | 'verified');
        if (sellerId) sellerDashboardWrapperCache[sellerId] = { verificationStatus: mapped as any, profileData: builtProfile };
      }
    } catch (err) {
      console.error('Error fetching seller status:', err);
      setError('Failed to load seller information');
      setVerificationStatus('unverified');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (view: string) => {
    const targetPath =
      view === 'seller-dashboard' ? '/seller/dashboard' :
      view === 'seller-verify' ? '/seller/verify' :
      view === 'seller-product-listing' || view === 'seller-products' ? '/seller/products' :
      view === 'seller-warehouse' ? '/seller/warehouse' :
      view === 'seller-orders' ? '/seller/orders' :
      view === 'seller-wallet' ? '/seller/wallet' :
      view === 'seller-notifications' ? '/seller/notifications' :
      view === 'seller-tutorial' ? '/seller/tutorial' :
      view === 'seller-help' ? '/seller/help' :
      '';

    if (!targetPath || targetPath === location.pathname) {
      return;
    }

    navigate(targetPath);
  };

  // Show loading state while fetching seller data
  if (loading) {
    return <PageSkeleton variant="plain" />;
  }

  // Show error state if failed to fetch
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={fetchSellerStatus}
            className="text-yellow-500 hover:text-yellow-400 text-sm font-bold underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <SellerLayout isVerified={verificationStatus === 'verified'}>
      <SellerDashboard
        sellerEmail={sellerEmail}
        sellerPhone={sellerPhone}
        sellerFullName={sellerFullName}
        sellerCountry={sellerCountry}
        onNavigate={handleNavigate}
        verificationStatus={verificationStatus}
        profileData={profileData}
      />
    </SellerLayout>
  );
};
