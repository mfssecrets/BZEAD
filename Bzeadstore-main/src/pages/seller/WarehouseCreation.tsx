/**
 * WarehouseCreation — Standalone Pickup Location Registration Page
 * Accessible from the seller products page via "Pickup Location" button.
 * Uses standalone warehouse form with navigation and auth context.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getSellerKYCStatus } from '../../lib/kycService';
import WarehousePickupForm from './warehouse/WarehousePickupForm';
import { ChevronLeft, CheckCircle2, ShieldAlert } from 'lucide-react';
import { PageSkeleton } from '../../components/common/Skeleton';

const WarehouseCreation: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentAuthUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registered, setRegistered] = useState(false);
  const [warehouseCode, setWarehouseCode] = useState<string | null>(null);
  const [kycApproved, setKycApproved] = useState<boolean | null>(null);

  const sellerId = user?.id || currentAuthUser?.userId || '';
  const sellerEmail = user?.email || currentAuthUser?.email || '';
  const sellerPhone = user?.phone || currentAuthUser?.attributes?.phone_number || '';
  const sellerName = user?.full_name || currentAuthUser?.attributes?.name || 'Seller';

  const [prefill, setPrefill] = useState<{
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  }>({});

  useEffect(() => {
    if (!sellerId) { setLoading(false); return; }

    (async () => {
      try {
        // Check KYC status first
        const { kycData } = await getSellerKYCStatus(sellerId);
        const approved = kycData?.kyc_status === 'approved';
        setKycApproved(approved);

        if (!approved) {
          setLoading(false);
          return;
        }

        // Fetch ALL warehouse rows (not just is_verified=true) so we detect in-progress warehouses
        const { data: pickupRows } = await supabase
          .from('seller_pickup_locations')
          .select('pickup_location_name, warehouse_type, is_verified, shiprocket_synced, shippo_synced, provider, phone_verified')
          .eq('seller_id', sellerId);

        const rows = (pickupRows || []) as Array<{
          pickup_location_name?: string | null;
          warehouse_type?: string | null;
          is_verified?: boolean | null;
          shiprocket_synced?: boolean | null;
          shippo_synced?: boolean | null;
          provider?: string | null;
          phone_verified?: number | null;
        }>;

        const domesticRow = rows.find((row) => {
          const code = String(row.pickup_location_name || '').toUpperCase();
          const type = String(row.warehouse_type || '').toLowerCase();
          return type === 'domestic' || code.startsWith('BZDSRDOM') || code.startsWith('BZDSPDOM');
        });

        const intlRow = rows.find((row) => {
          const code = String(row.pickup_location_name || '').toUpperCase();
          const type = String(row.warehouse_type || '').toLowerCase();
          return type === 'international' || code.startsWith('BZDSRINT') || code.startsWith('BZDSPINT');
        });

        // "Fully registered" depends on provider:
        //   • Shiprocket: is_verified + shiprocket_synced + phone_verified
        //   • Shippo:     is_verified + shippo_synced  (no OTP)
        const isFullyVerified = (row?: typeof rows[number]) => {
          if (!row || row.is_verified !== true) return false;
          const prov = (row.provider || 'shiprocket') as string;
          if (prov === 'shippo') return row.shippo_synced === true;
          return row.shiprocket_synced === true && (row.phone_verified ?? 0) >= 1;
        };
        const domesticFullyVerified = isFullyVerified(domesticRow);
        const intlFullyVerified = isFullyVerified(intlRow);

        // Only show "Already Registered" when domestic is fully verified
        // (international is optional — show as registered if domestic is done and intl either done or not started)
        if (domesticFullyVerified && (!intlRow || intlFullyVerified)) {
          setRegistered(true);
          setWarehouseCode(domesticRow?.pickup_location_name ?? null);
        } else {
          // Warehouse missing or not fully sync+OTP verified — let the form handle it
          setRegistered(false);
          setWarehouseCode(domesticRow?.pickup_location_name || null);
        }

        // Prefill from seller_kyc (where address data actually lives)
        const { data: kycData2 } = await supabase
          .from('seller_kyc')
          .select('business_city, business_state, business_country, business_postal_code, phone')
          .eq('seller_id', sellerId)
          .maybeSingle();

        const kyc = kycData2 as Record<string, string | null> | null;
        setPrefill({
          street: '',
          city: kyc?.business_city || '',
          state: kyc?.business_state || '',
          postalCode: kyc?.business_postal_code || '',
          country: kyc?.business_country || '',
          phone: sellerPhone,
        });
      } catch (err) {
        console.error('WarehouseCreation: load error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sellerId, sellerPhone]);

  if (loading) {
    return <PageSkeleton variant="form" />;
  }

  if (!sellerId) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-500">Please log in to register a pickup location.</p>
      </div>
    );
  }

  // KYC not approved — block warehouse registration
  if (kycApproved === false) {
    return (
      <div className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate('/seller/dashboard')}
            className="mb-6 text-gray-500 hover:text-gray-900 text-sm font-medium flex items-center gap-2"
          >
            <ChevronLeft size={16} /> Back to Dashboard
          </button>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert size={32} className="text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">KYC Verification Required</h2>
            <p className="text-gray-500 mb-2">
              You must complete KYC verification before setting up your warehouse pickup location.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Warehouse registration is mandatory after KYC approval to start selling on Bzead.
            </p>
            <button
              onClick={() => navigate('/seller/verify')}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
            >
              Complete KYC Verification
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Already registered
  if (registered) {
    return (
      <div className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate('/seller/dashboard')}
            className="mb-6 text-gray-500 hover:text-gray-900 text-sm font-medium flex items-center gap-2"
          >
            <ChevronLeft size={16} /> Back to Dashboard
          </button>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Pickup Location Active</h2>
            <p className="text-gray-500 mb-4">Your warehouse / pickup location is already registered and active.</p>
            {warehouseCode && (
              <p className="text-sm text-green-600 font-mono font-semibold mb-6">{warehouseCode}</p>
            )}
            <button
              onClick={() => navigate('/seller/dashboard')}
              className="px-6 py-2.5 bg-blue-800 hover:bg-blue-900 text-white font-medium rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 sm:py-12 px-2 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/seller/dashboard')}
          className="mb-3 sm:mb-6 text-gray-500 hover:text-gray-900 text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2"
        >
          <ChevronLeft size={16} /> Back to Dashboard
        </button>
        <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-6">
          <WarehousePickupForm
            sellerId={sellerId}
            sellerName={sellerName}
            sellerPhone={sellerPhone}
            sellerEmail={sellerEmail}
            sellerCountry={prefill.country || ''}
            prefillAddress={prefill}
            onComplete={(code) => {
              const normalized = String(code || '').trim();
              if (normalized) {
                setRegistered(true);
                setWarehouseCode(normalized);
                return;
              }
              navigate('/seller/dashboard');
            }}
            onCancel={() => navigate('/seller/dashboard')}
          />
        </div>
      </div>
    </div>
  );
};

export default WarehouseCreation;
