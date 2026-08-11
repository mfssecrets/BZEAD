/**
 * KYCStep2Business — Step 2: Business Details
 * Fetches business_type from profile, tax types dynamic by country.
 */
import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { FormSkeleton } from '../../../components/common/Skeleton';

interface BusinessData {
  business_type_id: string;
  business_name: string;
  business_registration_number: string;
  tax_type: string;
  tax_id_number: string;
  brand_name: string;
  // Registered business address
  business_street_address_1: string;
  business_street_address_2: string;
  business_city: string;
  business_state: string;
  business_postal_code: string;
  business_country: string;
  declaration_accepted: boolean;
}

interface Props {
  sellerId: string;
  sellerCountry: string;
  initialData?: Partial<BusinessData>;
  onSaveNext: (data: BusinessData) => Promise<void>;
  onCancel: () => void;
}

interface BusinessTypeOption {
  id: string;
  type_name: string;
}

// Dynamic tax types by country
const TAX_TYPES_BY_COUNTRY: Record<string, { label: string; value: string }[]> = {
  India: [
    { label: 'PAN (Permanent Account Number)', value: 'PAN' },
    { label: 'GSTIN (Goods & Services Tax ID)', value: 'GSTIN' },
    { label: 'TAN (Tax Deduction Account)', value: 'TAN' },
  ],
  'United States': [
    { label: 'EIN (Employer Identification Number)', value: 'EIN' },
    { label: 'SSN (Social Security Number)', value: 'SSN' },
    { label: 'ITIN (Individual Taxpayer ID)', value: 'ITIN' },
  ],
  'United Kingdom': [
    { label: 'UTR (Unique Tax Reference)', value: 'UTR' },
    { label: 'VAT Number', value: 'VAT' },
    { label: 'NINO (National Insurance Number)', value: 'NINO' },
  ],
  'United Arab Emirates': [
    { label: 'TRN (Tax Registration Number)', value: 'TRN' },
    { label: 'Commercial License Number', value: 'COMMERCIAL_LICENSE' },
  ],
  'Saudi Arabia': [
    { label: 'VAT Registration Number', value: 'VAT' },
    { label: 'Commercial Registration (CR)', value: 'CR' },
  ],
  Australia: [
    { label: 'TFN (Tax File Number)', value: 'TFN' },
    { label: 'ABN (Australian Business Number)', value: 'ABN' },
    { label: 'GST Registration', value: 'GST' },
  ],
  Canada: [
    { label: 'SIN (Social Insurance Number)', value: 'SIN' },
    { label: 'BN (Business Number)', value: 'BN' },
    { label: 'GST/HST Number', value: 'GST_HST' },
  ],
  Germany: [
    { label: 'Steuernummer (Tax Number)', value: 'STEUERNUMMER' },
    { label: 'USt-IdNr. (VAT ID)', value: 'UST_ID' },
  ],
  Singapore: [
    { label: 'NRIC/FIN', value: 'NRIC' },
    { label: 'UEN (Unique Entity Number)', value: 'UEN' },
    { label: 'GST Registration', value: 'GST' },
  ],
};

// Fallback for any country not listed
const DEFAULT_TAX_TYPES = [
  { label: 'Tax Identification Number (TIN)', value: 'TIN' },
  { label: 'VAT Number', value: 'VAT' },
  { label: 'Business Registration Number', value: 'BRN' },
];

const KYCStep2Business: React.FC<Props> = ({ sellerId, sellerCountry, initialData, onSaveNext, onCancel }) => {
  const [form, setForm] = useState<BusinessData>({
    business_type_id: initialData?.business_type_id || '',
    business_name: initialData?.business_name || '',
    business_registration_number: initialData?.business_registration_number || '',
    tax_type: initialData?.tax_type || '',
    tax_id_number: initialData?.tax_id_number || '',
    brand_name: initialData?.brand_name || '',
    business_street_address_1: initialData?.business_street_address_1 || '',
    business_street_address_2: initialData?.business_street_address_2 || '',
    business_city: initialData?.business_city || '',
    business_state: initialData?.business_state || '',
    business_postal_code: initialData?.business_postal_code || '',
    business_country: initialData?.business_country || sellerCountry || '',
    declaration_accepted: initialData?.declaration_accepted || false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeOption[]>([]);
  const [taxTypes, setTaxTypes] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [btRes, profileRes] = await Promise.all([
          supabase.from('business_types').select('id, type_name').eq('is_active', true).order('type_name'),
          supabase.from('profiles').select('business_type_id').eq('id', sellerId).single(),
        ]);
        setBusinessTypes(btRes.data || []);

        if (profileRes.data?.business_type_id && !initialData?.business_type_id) {
          setForm(prev => ({ ...prev, business_type_id: profileRes.data.business_type_id }));
        }
      } catch {
        // Continue
      } finally {
        setLoading(false);
      }
    })();
  }, [sellerId, initialData]);

  // Update tax types when country changes
  useEffect(() => {
    const country = sellerCountry || form.business_country;
    setTaxTypes(TAX_TYPES_BY_COUNTRY[country] || DEFAULT_TAX_TYPES);
  }, [sellerCountry, form.business_country]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.business_type_id) e.business_type_id = 'Business type is required';
    if (!form.business_name.trim()) e.business_name = 'Business name is required';
    if (!form.tax_type) e.tax_type = 'Tax type is required';
    if (!form.tax_id_number.trim()) e.tax_id_number = 'Tax ID number is required';
    if (!form.business_street_address_1.trim()) e.business_street_address_1 = 'Street address is required';
    if (!form.business_city.trim()) e.business_city = 'City is required';
    if (!form.business_state.trim()) e.business_state = 'State is required';
    if (!form.business_postal_code.trim()) e.business_postal_code = 'Postal code is required';
    if (!form.declaration_accepted) e.declaration_accepted = 'You must accept the declaration';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSaveNext = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Sync business type back to profile
      await supabase.from('profiles').update({
        business_type_id: form.business_type_id,
      }).eq('id', sellerId);

      await onSaveNext(form);
    } catch (err) {
      setErrors({ _general: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof BusinessData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  if (loading) {
    return <FormSkeleton fields={5} withSubmit={false} className="py-4" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Business Details</h2>
        <p className="text-sm text-gray-500 mt-1">Your business type, tax details, and registered address.</p>
      </div>

      {errors._general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors._general}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Business Type */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Business Type <span className="text-red-500">*</span></label>
          <select
            value={form.business_type_id}
            onChange={e => handleChange('business_type_id', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.business_type_id ? 'border-red-400' : 'border-gray-300'}`}
          >
            <option value="">Select business type</option>
            {businessTypes.map(bt => (
              <option key={bt.id} value={bt.id}>{bt.type_name}</option>
            ))}
          </select>
          {errors.business_type_id && <p className="text-xs text-red-500 mt-1">{errors.business_type_id}</p>}
        </div>

        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Business Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.business_name}
            onChange={e => handleChange('business_name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.business_name ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Shop / Registered / Freelancer name"
          />
          {errors.business_name && <p className="text-xs text-red-500 mt-1">{errors.business_name}</p>}
        </div>

        {/* Business Registration Number (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Business Registration Number <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            type="text"
            value={form.business_registration_number}
            onChange={e => handleChange('business_registration_number', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Registration number"
          />
        </div>

        {/* Brand Name */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Brand Name <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            type="text"
            value={form.brand_name}
            onChange={e => handleChange('brand_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Your brand name"
          />
        </div>

        {/* Tax Type */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Tax Type <span className="text-red-500">*</span></label>
          <select
            value={form.tax_type}
            onChange={e => handleChange('tax_type', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.tax_type ? 'border-red-400' : 'border-gray-300'}`}
          >
            <option value="">Select tax type</option>
            {taxTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {errors.tax_type && <p className="text-xs text-red-500 mt-1">{errors.tax_type}</p>}
        </div>

        {/* Tax ID Number */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Tax ID Number <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.tax_id_number}
            onChange={e => handleChange('tax_id_number', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.tax_id_number ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Enter tax ID"
          />
          {errors.tax_id_number && <p className="text-xs text-red-500 mt-1">{errors.tax_id_number}</p>}
        </div>
      </div>

      {/* Registered Business Address */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Registered Business Address</h3>
        <p className="text-xs text-gray-400 mb-3">Individuals may use the same address as personal.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-1">Street Address Line 1 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.business_street_address_1}
              onChange={e => handleChange('business_street_address_1', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.business_street_address_1 ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="Building, Street"
            />
            {errors.business_street_address_1 && <p className="text-xs text-red-500 mt-1">{errors.business_street_address_1}</p>}
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-1">Street Address Line 2</label>
            <input
              type="text"
              value={form.business_street_address_2}
              onChange={e => handleChange('business_street_address_2', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Area, Locality (optional)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">City / Town <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.business_city}
              onChange={e => handleChange('business_city', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.business_city ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="City"
            />
            {errors.business_city && <p className="text-xs text-red-500 mt-1">{errors.business_city}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">State / Province <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.business_state}
              onChange={e => handleChange('business_state', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.business_state ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="State"
            />
            {errors.business_state && <p className="text-xs text-red-500 mt-1">{errors.business_state}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Postal / ZIP Code <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.business_postal_code}
              onChange={e => handleChange('business_postal_code', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.business_postal_code ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="Postal code"
            />
            {errors.business_postal_code && <p className="text-xs text-red-500 mt-1">{errors.business_postal_code}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Country</label>
            <input
              type="text"
              value={form.business_country}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Declaration */}
      <div className={`border rounded-lg p-4 ${errors.declaration_accepted ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.declaration_accepted}
            onChange={e => handleChange('declaration_accepted', e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-blue-800"
          />
          <span className="text-sm text-gray-700">
            I declare that the information provided is true and accurate to the best of my knowledge.
            False information may result in rejection or suspension of seller privileges.
          </span>
        </label>
        {errors.declaration_accepted && <p className="text-xs text-red-500 mt-2 ml-7">{errors.declaration_accepted}</p>}
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveNext}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="animate-spin" size={14} />}
          Save & Next
        </button>
      </div>
    </div>
  );
};

export default KYCStep2Business;
