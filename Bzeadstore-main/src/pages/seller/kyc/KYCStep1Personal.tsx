/**
 * KYCStep1Personal — Step 1: Personal Information
 * Auto-populates from profile, syncs edits back.
 */
import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { FormSkeleton } from '../../../components/common/Skeleton';

interface PersonalData {
  full_name: string;
  email: string;
  phone: string;
  country: string;
  country_id: string;
  street_address_1: string;
  street_address_2: string;
  city: string;
  state: string;
  postal_code: string;
  landmark: string;
}

interface Props {
  sellerId: string;
  initialData?: Partial<PersonalData>;
  onSaveNext: (data: PersonalData) => Promise<void>;
  onCancel: () => void;
}

interface CountryOption {
  id: string;
  country_name: string;
  country_code: string;
}

const KYCStep1Personal: React.FC<Props> = ({ sellerId, initialData, onSaveNext, onCancel }) => {
  const [form, setForm] = useState<PersonalData>({
    full_name: initialData?.full_name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    country: initialData?.country || '',
    country_id: initialData?.country_id || '',
    street_address_1: initialData?.street_address_1 || '',
    street_address_2: initialData?.street_address_2 || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    postal_code: initialData?.postal_code || '',
    landmark: initialData?.landmark || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState<CountryOption[]>([]);

  // Load profile + countries
  useEffect(() => {
    (async () => {
      try {
        const [profileRes, countriesRes] = await Promise.all([
          supabase.from('profiles').select('full_name, email, phone, country_id').eq('id', sellerId).single(),
          supabase.from('countries').select('id, country_name, country_code').eq('is_active', true).order('country_name'),
        ]);

        const p = profileRes.data;
        const c = countriesRes.data || [];
        setCountries(c);

        if (p && !initialData?.full_name) {
          const matched = c.find((co: CountryOption) => co.id === p.country_id);
          setForm(prev => ({
            ...prev,
            full_name: p.full_name || prev.full_name,
            email: p.email || prev.email,
            phone: p.phone || prev.phone,
            country: matched?.country_name || prev.country,
            country_id: p.country_id || prev.country_id,
          }));
        }
      } catch {
        // Silently continue
      } finally {
        setLoading(false);
      }
    })();
  }, [sellerId, initialData]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = 'Full name is required';
    if (!form.phone.trim()) e.phone = 'Mobile number is required';
    if (!form.country_id) e.country = 'Country is required';
    if (!form.street_address_1.trim()) e.street_address_1 = 'Street address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.state.trim()) e.state = 'State is required';
    if (!form.postal_code.trim()) e.postal_code = 'Postal code is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSaveNext = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Sync editable fields back to profile
      await supabase.from('profiles').update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        country_id: form.country_id,
      }).eq('id', sellerId);

      await onSaveNext(form);
    } catch (err) {
      setErrors({ _general: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof PersonalData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const handleCountryChange = (countryId: string) => {
    const c = countries.find(co => co.id === countryId);
    setForm(prev => ({ ...prev, country_id: countryId, country: c?.country_name || '' }));
    if (errors.country) setErrors(prev => { const n = { ...prev }; delete n.country; return n; });
  };

  if (loading) {
    return <FormSkeleton fields={5} withSubmit={false} className="py-4" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Personal Information</h2>
        <p className="text-sm text-gray-500 mt-1">Your name, contact, and residential address.</p>
      </div>

      {errors._general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors._general}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Full Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.full_name}
            onChange={e => handleChange('full_name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.full_name ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Enter full name"
          />
          {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Email Address</label>
          <input
            type="email"
            value={form.email}
            readOnly
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Mobile Number <span className="text-red-500">*</span></label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => handleChange('phone', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.phone ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Enter mobile number"
          />
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
        </div>

        {/* Country */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Country of Residence <span className="text-red-500">*</span></label>
          <select
            value={form.country_id}
            onChange={e => handleCountryChange(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.country ? 'border-red-400' : 'border-gray-300'}`}
          >
            <option value="">Select country</option>
            {countries.map(c => (
              <option key={c.id} value={c.id}>{c.country_name}</option>
            ))}
          </select>
          {errors.country && <p className="text-xs text-red-500 mt-1">{errors.country}</p>}
        </div>
      </div>

      {/* Address Section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Current Residential Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-1">Street Address Line 1 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.street_address_1}
              onChange={e => handleChange('street_address_1', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.street_address_1 ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="House/Flat No., Street"
            />
            {errors.street_address_1 && <p className="text-xs text-red-500 mt-1">{errors.street_address_1}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900 mb-1">Street Address Line 2</label>
            <input
              type="text"
              value={form.street_address_2}
              onChange={e => handleChange('street_address_2', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Area, Locality (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">City / Town <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.city}
              onChange={e => handleChange('city', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.city ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="City"
            />
            {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">State / Province <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.state}
              onChange={e => handleChange('state', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.state ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="State"
            />
            {errors.state && <p className="text-xs text-red-500 mt-1">{errors.state}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Postal / ZIP Code <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.postal_code}
              onChange={e => handleChange('postal_code', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.postal_code ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="Postal code"
            />
            {errors.postal_code && <p className="text-xs text-red-500 mt-1">{errors.postal_code}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Landmark <span className="text-gray-400 text-xs">(optional)</span></label>
            <input
              type="text"
              value={form.landmark}
              onChange={e => handleChange('landmark', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Near landmark"
            />
          </div>
        </div>
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

export default KYCStep1Personal;
