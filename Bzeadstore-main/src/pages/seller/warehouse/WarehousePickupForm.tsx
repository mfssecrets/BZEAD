/**
 * WarehousePickupForm — Single Pickup Location per Seller
 * ─────────────────────────────────────────────────────────────────────────
 * Seller fills the form ONCE and SAVES to the database. Period.
 * No syncing, no Shiprocket calls, no errors shown to the seller.
 *
 * Admin handles the actual Shiprocket sync from /admin/seller-warehouses
 * (Edit / Reject / Sync). Per Shiprocket support: one pickup location
 * serves both domestic and international shipments, so we keep ONE row
 * per seller (unique constraint enforced in DB).
 *
 * Seller sees one of four states based on `status`:
 *   • no row yet              → blank form  ("Save Warehouse")
 *   • status='pending'        → "Warehouse Submitted — awaiting admin"
 *                                + Modify button
 *   • status='synced'         → "Warehouse Created" (admin pushed to Shiprocket)
 *   • status='rejected'       → RED card with rejection_reason
 *                                + "Modify & Resubmit" button (prefilled)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Warehouse, CheckCircle2, AlertCircle, MapPin, Pencil, XCircle, Clock,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../utils/logger';
import LocationMap from '../../../components/common/LocationMap';
import { FormSkeleton } from '../../../components/common/Skeleton';

interface AddressTypeOption { id: string; name: string; slug: string; }

interface AddressForm {
  contactPhone: string;
  contactEmail: string;
  address: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  lat: string;
  long: string;
  addressType: string;
  vendorName: string;
  gstin: string;
  isHyperlocal: boolean;
  workingDays: string[];
  usePickupAsReturn: boolean;
  returnAddress: string;
  returnCity: string;
  returnPin: string;
  returnState: string;
  returnCountry: string;
}

interface ExistingRow {
  id: string;
  pickup_location_name: string;
  status: 'pending' | 'synced' | 'rejected';
  rejection_reason: string | null;
  rejected_at: string | null;
  approved_at: string | null;
  updated_at: string;
  created_at: string;
}

// Kept for backward compat with any callers importing the old types.
export type CourierPartner = 'self' | 'shiprocket';
export interface WarehouseData {
  courierPartner: CourierPartner;
  warehouseName: string;
  pickupPostalCode: string;
  pickupAddressLine1: string;
  pickupCity: string;
  pickupState: string;
  pickupCountry: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  returnAddress: string;
  returnCity: string;
  returnPin: string;
  returnState: string;
  returnCountry: string;
}

interface Props {
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  /** Seller business country (used only for default form value). */
  sellerCountry?: string;
  prefillAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
  };
  /** Called once a warehouse exists (any status). */
  onComplete: (warehouseCode: string) => void;
  onCancel: () => void;
}

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const deriveFallbackSequence = (sellerId: string): number => {
  const hexTail = sellerId.replace(/-/g, '').slice(-8);
  const parsed = Number.parseInt(hexTail, 16);
  if (Number.isFinite(parsed) && parsed > 0) return (parsed % 9_999_999) + 1;
  return 1;
};

const buildFacilityCode = (sellerId: string): string =>
  `BZDWH${String(deriveFallbackSequence(sellerId)).padStart(7, '0')}`;

const emptyForm = (prefill?: Props['prefillAddress']): AddressForm => ({
  contactPhone: prefill?.phone || '',
  contactEmail: '',
  address: prefill?.street || '',
  address2: '',
  pincode: prefill?.postalCode || '',
  city: prefill?.city || '',
  state: prefill?.state || '',
  country: prefill?.country || 'India',
  lat: '',
  long: '',
  addressType: '',
  vendorName: '',
  gstin: '',
  isHyperlocal: false,
  workingDays: [...ALL_DAYS],
  usePickupAsReturn: true,
  returnAddress: '',
  returnCity: '',
  returnPin: '',
  returnState: '',
  returnCountry: prefill?.country || 'India',
});

type Phase = 'loading' | 'view' | 'form' | 'saving';

const fmt = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
};

const WarehousePickupForm: React.FC<Props> = ({
  sellerId,
  sellerName,
  sellerPhone: _sellerPhone,
  sellerEmail,
  sellerCountry,
  prefillAddress,
  onComplete,
  onCancel,
}) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [form, setForm] = useState<AddressForm>(emptyForm(prefillAddress));
  const [existing, setExisting] = useState<ExistingRow | null>(null);
  const [error, setError] = useState('');
  const [addressTypes, setAddressTypes] = useState<AddressTypeOption[]>([]);

  const facilityCode = useMemo(
    () => existing?.pickup_location_name || buildFacilityCode(sellerId),
    [existing, sellerId],
  );

  // Load address types (for dropdown)
  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('address_types')
          .select('id, name, slug');
        if (!err && data) setAddressTypes(data as AddressTypeOption[]);
      } catch { /* ignore */ }
    })();
  }, []);

  // Load the seller's single warehouse row (if any)
  useEffect(() => {
    if (!sellerId) return;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('seller_pickup_locations')
          .select(
            'id, pickup_location_name, status, rejection_reason, rejected_at, approved_at, ' +
            'updated_at, created_at, ' +
            'contact_phone, contact_email, address, address_2, pin_code, city, state, country, ' +
            'lat, long, address_type, vendor_name, gstin, is_hyperlocal, working_days, ' +
            'use_pickup_as_return, return_address, return_city, return_pin, return_state, return_country',
          )
          .eq('seller_id', sellerId)
          .maybeSingle();

        if (err && err.code !== 'PGRST116') throw new Error(err.message);

        const row = data as Record<string, unknown> | null;
        if (row) {
          setExisting({
            id: row.id as string,
            pickup_location_name: row.pickup_location_name as string,
            status: (row.status as ExistingRow['status']) || 'pending',
            rejection_reason: (row.rejection_reason as string) || null,
            rejected_at: (row.rejected_at as string) || null,
            approved_at: (row.approved_at as string) || null,
            updated_at: row.updated_at as string,
            created_at: row.created_at as string,
          });

          // Prefill the form with the stored values so Modify works.
          setForm({
            contactPhone: (row.contact_phone as string) || prefillAddress?.phone || '',
            contactEmail: (row.contact_email as string) || '',
            address: (row.address as string) || prefillAddress?.street || '',
            address2: (row.address_2 as string) || '',
            pincode: (row.pin_code as string) || prefillAddress?.postalCode || '',
            city: (row.city as string) || prefillAddress?.city || '',
            state: (row.state as string) || prefillAddress?.state || '',
            country: (row.country as string) || prefillAddress?.country || 'India',
            lat: row.lat != null ? String(row.lat) : '',
            long: row.long != null ? String(row.long) : '',
            addressType: (row.address_type as string) || '',
            vendorName: (row.vendor_name as string) || '',
            gstin: (row.gstin as string) || '',
            isHyperlocal: Boolean(row.is_hyperlocal),
            workingDays: Array.isArray(row.working_days) && (row.working_days as unknown[]).length > 0
              ? (row.working_days as string[])
              : [...ALL_DAYS],
            usePickupAsReturn: row.use_pickup_as_return !== false,
            returnAddress: (row.return_address as string) || '',
            returnCity: (row.return_city as string) || '',
            returnPin: (row.return_pin as string) || '',
            returnState: (row.return_state as string) || '',
            returnCountry: (row.return_country as string) || prefillAddress?.country || 'India',
          });

          setPhase('view');
          return;
        }

        // No row yet — show blank form
        setPhase('form');
      } catch (e) {
        logger.error(e as Error, { context: 'WarehousePickupForm.load' });
        setPhase('form');
      }
    })();
  }, [sellerId, prefillAddress]);

  const updateField = useCallback(
    (field: keyof AddressForm, value: string | string[] | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setError('');
    },
    [],
  );

  const toggleDay = useCallback((day: string) => {
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day],
    }));
  }, []);

  const normalizePin = (v: string) =>
    sellerCountry && !['in', 'ind', 'india'].includes(sellerCountry.toLowerCase())
      ? v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
      : v.replace(/\D/g, '').slice(0, 6);

  const validate = (): string | null => {
    const f = form;
    if (!f.addressType) return 'Please select an address type.';
    if (!f.contactPhone.trim()) return 'Contact phone is required.';
    if (!/^[0-9+\-() ]{6,20}$/.test(f.contactPhone.trim())) return 'Invalid phone number format.';
    if (!f.address.trim() || f.address.trim().length < 10)
      return 'Address must be at least 10 characters.';
    if (!/\d/.test(f.address.trim()))
      return 'Address must include a house/flat/road number.';
    if (!f.pincode.trim()) return 'Pincode / postal code is required.';
    if (!f.city.trim()) return 'City is required.';
    if (!f.state.trim()) return 'State is required.';
    if (!f.country.trim()) return 'Country is required.';
    if (f.isHyperlocal) {
      if (!f.lat.trim() || !f.long.trim())
        return 'Latitude & longitude are required for hyperlocal delivery.';
    }
    if (f.workingDays.length === 0) return 'Select at least one working day.';
    if (!f.usePickupAsReturn) {
      if (!f.returnAddress.trim()) return 'Return address is required.';
      if (!f.returnCity.trim()) return 'Return city is required.';
      if (!f.returnPin.trim()) return 'Return pincode is required.';
      if (!f.returnState.trim()) return 'Return state is required.';
      if (!f.returnCountry.trim()) return 'Return country is required.';
    }
    return null;
  };

  const handleSave = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setPhase('saving');
    setError('');

    try {
      const code = existing?.pickup_location_name || buildFacilityCode(sellerId);

      const payload = {
        seller_id: sellerId,
        pickup_location_name: code,
        address: form.address.trim(),
        address_2: form.address2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pin_code: form.pincode.trim(),
        country: form.country.trim() || 'India',
        contact_name: sellerName,
        contact_phone: form.contactPhone.trim(),
        contact_email: form.contactEmail.trim() || sellerEmail,
        warehouse_type: 'domestic',
        lat: form.lat ? parseFloat(form.lat) : null,
        long: form.long ? parseFloat(form.long) : null,
        address_type: form.addressType || null,
        vendor_name: form.vendorName || null,
        gstin: form.gstin || null,
        is_hyperlocal: form.isHyperlocal,
        working_days: form.workingDays,
        use_pickup_as_return: form.usePickupAsReturn,
        return_address: form.usePickupAsReturn ? form.address.trim() : form.returnAddress.trim(),
        return_city: form.usePickupAsReturn ? form.city.trim() : form.returnCity.trim(),
        return_pin: form.usePickupAsReturn ? form.pincode.trim() : form.returnPin.trim(),
        return_state: form.usePickupAsReturn ? form.state.trim() : form.returnState.trim(),
        return_country: form.usePickupAsReturn
          ? (form.country.trim() || 'India')
          : (form.returnCountry.trim() || form.country.trim() || 'India'),
        status: 'pending',
        rejection_reason: null,
        rejected_at: null,
        is_verified: false,
        shiprocket_synced: false,
        shippo_synced: false,
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from('seller_pickup_locations')
        .upsert(payload, { onConflict: 'seller_id' });

      if (upErr) throw new Error(upErr.message);

      // Reload to grab the fresh status row
      const { data } = await supabase
        .from('seller_pickup_locations')
        .select(
          'id, pickup_location_name, status, rejection_reason, rejected_at, approved_at, updated_at, created_at',
        )
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (data) {
        const row = data as Record<string, unknown>;
        setExisting({
          id: row.id as string,
          pickup_location_name: row.pickup_location_name as string,
          status: (row.status as ExistingRow['status']) || 'pending',
          rejection_reason: (row.rejection_reason as string) || null,
          rejected_at: (row.rejected_at as string) || null,
          approved_at: (row.approved_at as string) || null,
          updated_at: row.updated_at as string,
          created_at: row.created_at as string,
        });
      }
      setPhase('view');
    } catch (e) {
      logger.error(e as Error, { context: 'WarehousePickupForm.handleSave' });
      setError('Could not save warehouse. Please try again.');
      setPhase('form');
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // RENDER — status views
  // ────────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return <FormSkeleton fields={6} className="py-4" />;
  }

  if (phase === 'view' && existing) {
    const status = existing.status;
    return (
      <div className="py-6">
        {status === 'synced' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Warehouse Created</h3>
            <p className="text-gray-500 text-sm mb-1">
              Your pickup location <span className="font-mono font-semibold text-gray-800">{existing.pickup_location_name}</span> is active.
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Approved {fmt(existing.approved_at || existing.updated_at)}. You can start fulfilling orders.
            </p>
            <button
              onClick={() => onComplete(existing.pickup_location_name)}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {status === 'pending' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={32} className="text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Warehouse Submitted</h3>
            <p className="text-gray-500 text-sm mb-1">
              Pickup location <span className="font-mono font-semibold text-gray-800">{existing.pickup_location_name}</span> is awaiting admin approval.
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Submitted {fmt(existing.created_at)}. You'll be notified once it's active.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => { setError(''); setPhase('form'); }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                <Pencil size={14} /> Modify
              </button>
              <button
                onClick={() => onComplete(existing.pickup_location_name)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {status === 'rejected' && (
          <div>
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 mb-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <XCircle size={22} className="text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-red-900 mb-1">Warehouse Rejected</h3>
                  <p className="text-sm text-red-700 mb-2">
                    Admin rejected your pickup location on {fmt(existing.rejected_at)}. Please fix the issue below and resubmit.
                  </p>
                  <div className="bg-white border border-red-200 rounded-lg p-3 mt-2">
                    <p className="text-xs font-semibold text-red-800 uppercase mb-1">Reason from admin</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {existing.rejection_reason || 'No reason provided.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => { setError(''); setPhase('form'); }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors"
            >
              <Pencil size={16} /> Modify & Resubmit
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Form ───────────────────────────────────────────────────────────
  const saving = phase === 'saving';

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <Warehouse size={20} className="text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {existing ? 'Modify Pickup Location' : 'Add Pickup Location'}
          </h3>
          <p className="text-xs text-gray-500">
            Fill in your warehouse pickup details. Admin will review and activate it.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
          <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="space-y-5">
        {/* Facility Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Facility Code</label>
          <input
            type="text"
            value={facilityCode}
            readOnly
            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 font-mono text-sm cursor-not-allowed"
          />
          <p className="text-[11px] text-gray-400 mt-1">Auto-generated. Cannot be changed.</p>
        </div>

        {/* Address Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            This address is: <span className="text-red-500">*</span>
          </label>
          <select
            value={form.addressType}
            onChange={(e) => updateField('addressType', e.target.value)}
            disabled={saving || addressTypes.length === 0}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 text-sm"
          >
            <option value="">Select address type</option>
            {addressTypes.map((at) => <option key={at.id} value={at.slug}>{at.name}</option>)}
          </select>
        </div>

        {/* Address Details */}
        <div className="border border-gray-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={16} className="text-blue-500" />
            <h4 className="text-sm font-semibold text-gray-800">Address Details</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Contact Phone <span className="text-red-500">*</span></label>
              <input
                type="tel" value={form.contactPhone}
                onChange={(e) => updateField('contactPhone', e.target.value.replace(/[^0-9+\-() ]/g, ''))}
                placeholder="+91 9876543210"
                disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Email (Optional)</label>
              <input
                type="email" value={form.contactEmail}
                onChange={(e) => updateField('contactEmail', e.target.value)}
                placeholder="warehouse@example.com"
                disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
              <input
                type="text" value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="House no, Street, Landmark"
                maxLength={80} disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">Min 10 chars. Must include house/flat/road number.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">Address Line 2</label>
              <input
                type="text" value={form.address2}
                onChange={(e) => updateField('address2', e.target.value)}
                placeholder="Additional details (optional)"
                disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Pincode <span className="text-red-500">*</span></label>
              <input
                type="text" value={form.pincode}
                onChange={(e) => updateField('pincode', normalizePin(e.target.value))}
                placeholder="6-digit pincode"
                disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">City <span className="text-red-500">*</span></label>
              <input
                type="text" value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                placeholder="City"
                disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">State <span className="text-red-500">*</span></label>
              <input
                type="text" value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
                placeholder="State / Province"
                disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Country <span className="text-red-500">*</span></label>
              <input
                type="text" value={form.country}
                onChange={(e) => updateField('country', e.target.value)}
                placeholder="India"
                disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Location Map + Vendor Details */}
        <div className="border border-gray-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-purple-500" />
            <h4 className="text-sm font-semibold text-gray-800">Location & Additional Details</h4>
          </div>

          <LocationMap
            lat={form.lat}
            lng={form.long}
            onLocationChange={(la, ln) => {
              setForm((prev) => ({ ...prev, lat: la, long: ln }));
              setError('');
            }}
            disabled={saving}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Latitude</label>
              <input type="text" inputMode="decimal" value={form.lat}
                onChange={(e) => updateField('lat', e.target.value.replace(/[^0-9.\-]/g, ''))}
                placeholder="e.g. 22.4064" disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Longitude</label>
              <input type="text" inputMode="decimal" value={form.long}
                onChange={(e) => updateField('long', e.target.value.replace(/[^0-9.\-]/g, ''))}
                placeholder="e.g. 69.0747" disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Vendor Name</label>
              <input type="text" value={form.vendorName}
                onChange={(e) => updateField('vendorName', e.target.value)}
                placeholder="Vendor name (optional)" disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">GSTIN</label>
              <input type="text" value={form.gstin}
                onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                placeholder="e.g. 29ABCDE1234F1Z5" maxLength={15} disabled={saving}
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer py-2">
            <input type="checkbox" checked={form.isHyperlocal}
              onChange={(e) => updateField('isHyperlocal', e.target.checked)}
              disabled={saving}
              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 w-4 h-4" />
            <div>
              <span className="text-sm font-medium text-gray-700">Hyperlocal Delivery</span>
              <p className="text-[11px] text-gray-400">If enabled, lat/long become mandatory.</p>
            </div>
          </label>
        </div>

        {/* Working Days */}
        <div className="border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Warehouse size={16} className="text-blue-500" />
            <h4 className="text-sm font-semibold text-gray-800">Working Days</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_DAYS.map((day) => (
              <button key={day} type="button" onClick={() => toggleDay(day)} disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  form.workingDays.includes(day)
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}>
                {form.workingDays.includes(day) && <CheckCircle2 size={14} className="text-blue-500" />}
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Return Address */}
        <div className="border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-blue-500" />
            <h4 className="text-sm font-semibold text-gray-800">Return Details</h4>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.usePickupAsReturn}
              onChange={(e) => updateField('usePickupAsReturn', e.target.checked)}
              disabled={saving}
              className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 w-4 h-4" />
            Return address is the same as pickup address
          </label>

          {!form.usePickupAsReturn && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-1">Return Address <span className="text-red-500">*</span></label>
                <input type="text" value={form.returnAddress}
                  onChange={(e) => updateField('returnAddress', e.target.value)}
                  placeholder="Return street address" disabled={saving}
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Return City <span className="text-red-500">*</span></label>
                <input type="text" value={form.returnCity}
                  onChange={(e) => updateField('returnCity', e.target.value)}
                  placeholder="City" disabled={saving}
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Return Postal Code <span className="text-red-500">*</span></label>
                <input type="text" value={form.returnPin}
                  onChange={(e) => updateField('returnPin', normalizePin(e.target.value))}
                  placeholder="Postal code" disabled={saving}
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Return State <span className="text-red-500">*</span></label>
                <input type="text" value={form.returnState}
                  onChange={(e) => updateField('returnState', e.target.value)}
                  placeholder="State" disabled={saving}
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Return Country <span className="text-red-500">*</span></label>
                <input type="text" value={form.returnCountry}
                  onChange={(e) => updateField('returnCountry', e.target.value)}
                  placeholder="India" disabled={saving}
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between mt-8 pt-6 border-t border-gray-100 gap-3">
        <button
          onClick={() => { if (existing) setPhase('view'); else onCancel(); }}
          disabled={saving}
          className="text-gray-500 hover:text-gray-900 text-sm font-medium disabled:opacity-50"
        >
          {existing ? 'Cancel' : 'Back'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <>Save Warehouse</>}
        </button>
      </div>
    </div>
  );
};

export default WarehousePickupForm;
