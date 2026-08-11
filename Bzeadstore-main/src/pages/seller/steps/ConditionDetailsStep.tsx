import React, { useRef, useState } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import type { ProductConditionDetails, ItemCondition } from '../../../types';
import { supabase } from '../../../lib/supabase';

export type ConditionDetailsData = Omit<ProductConditionDetails, 'id' | 'product_id'>;

interface Props {
  data: ConditionDetailsData;
  onChange: (data: ConditionDetailsData) => void;
  itemCondition: ItemCondition;
  disabled?: boolean;
}

const USAGE_DURATION_OPTIONS = [
  { value: 'less_than_1_month', label: 'Less than 1 month' },
  { value: '1_6_months', label: '1 – 6 months' },
  { value: '6_12_months', label: '6 – 12 months' },
  { value: '1_2_years', label: '1 – 2 years' },
  { value: '2_plus_years', label: '2+ years' },
];

const WORKING_CONDITION_OPTIONS = [
  { value: 'works_perfectly', label: 'Works Perfectly — no issues at all' },
  { value: 'minor_issues', label: 'Minor Issues — small cosmetic or functional flaws' },
  { value: 'needs_repair', label: 'Needs Repair — requires fixing before normal use' },
];

const OWNERSHIP_OPTIONS = [
  { value: 'first_owner', label: 'First Owner' },
  { value: 'second_owner', label: 'Second Owner' },
  { value: 'multiple_owners', label: 'Multiple Owners' },
];

const REFURBISHED_BY_OPTIONS = [
  { value: 'brand_authorized', label: 'Brand Authorized Service Center' },
  { value: 'local_technician', label: 'Local Technician' },
  { value: 'self_refurbished', label: 'Self-Refurbished' },
];

const ConditionDetailsStep: React.FC<Props> = ({ data, onChange, itemCondition, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const isRefurbished = itemCondition === 'refurbished';

  const handleChange = <K extends keyof ConditionDetailsData>(field: K, value: ConditionDetailsData[K]) => {
    const updated = { ...data, [field]: value };
    // Clear conditional fields when toggled off
    if (field === 'has_scratches' && !value) {
      updated.scratch_description = '';
      updated.scratch_images = [];
    }
    if (field === 'working_condition' && value === 'works_perfectly') {
      updated.working_condition_notes = '';
    }
    onChange(updated);
  };

  const handleScratchImageUpload = async (files: FileList) => {
    if (data.scratch_images.length + files.length > 5) {
      alert('Maximum 5 scratch/damage photos allowed.');
      return;
    }
    setUploading(true);
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `scratch-photos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
        newUrls.push(urlData.publicUrl);
      }
    }
    setUploading(false);
    if (newUrls.length > 0) {
      handleChange('scratch_images', [...data.scratch_images, ...newUrls]);
    }
  };

  const removeScratchImage = (idx: number) => {
    handleChange('scratch_images', data.scratch_images.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-sm">Condition Details</div>
      </div>
      <p className="text-xs text-gray-500 text-center">
        Help buyers understand the exact condition of your product. Honest answers build trust and reduce returns.
      </p>

      {/* 1. Usage Duration */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          How long has this product been used? <span className="text-red-500">*</span>
        </label>
        <select
          value={data.usage_duration}
          onChange={(e) => handleChange('usage_duration', e.target.value as ConditionDetailsData['usage_duration'])}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
          disabled={disabled}
        >
          <option value="">Select duration</option>
          {USAGE_DURATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 2. Working Condition */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Working Condition <span className="text-red-500">*</span>
        </label>
        <select
          value={data.working_condition}
          onChange={(e) => handleChange('working_condition', e.target.value as ConditionDetailsData['working_condition'])}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
          disabled={disabled}
        >
          <option value="">Select condition</option>
          {WORKING_CONDITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 2a. Working Condition Notes (conditional) */}
      {data.working_condition && data.working_condition !== 'works_perfectly' && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Describe the issue(s) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={data.working_condition_notes}
            onChange={(e) => handleChange('working_condition_notes', e.target.value)}
            placeholder="e.g., Battery lasts only 3 hours instead of 5"
            rows={3}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
            disabled={disabled}
          />
        </div>
      )}

      {/* 3. Original Packaging */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Original packaging included? <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => handleChange('original_packaging', val)}
              disabled={disabled}
              className={`px-5 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                data.original_packaging === val
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
              }`}
            >
              {val ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Original Invoice */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Original purchase invoice available? <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => handleChange('original_invoice', val)}
              disabled={disabled}
              className={`px-5 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                data.original_invoice === val
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
              }`}
            >
              {val ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Accessories Included */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Accessories included (optional)
        </label>
        <input
          type="text"
          value={data.accessories_included}
          onChange={(e) => handleChange('accessories_included', e.target.value)}
          placeholder="e.g., Charger, USB cable, earbuds"
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
          disabled={disabled}
        />
      </div>

      {/* 6. Ownership Type */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Ownership <span className="text-red-500">*</span>
        </label>
        <select
          value={data.ownership_type}
          onChange={(e) => handleChange('ownership_type', e.target.value as ConditionDetailsData['ownership_type'])}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
          disabled={disabled}
        >
          <option value="">Select ownership</option>
          {OWNERSHIP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 7. Scratches / Damage */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Any visible scratches or damage? <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => handleChange('has_scratches', val)}
              disabled={disabled}
              className={`px-5 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                data.has_scratches === val
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
              }`}
            >
              {val ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>

      {/* 7a. Scratch Description (conditional) */}
      {data.has_scratches && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Describe the scratches/damage <span className="text-red-500">*</span>
          </label>
          <textarea
            value={data.scratch_description}
            onChange={(e) => handleChange('scratch_description', e.target.value)}
            placeholder="e.g., Small scratch on the back panel near the camera"
            rows={3}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
            disabled={disabled}
          />
        </div>
      )}

      {/* 7b. Scratch Photos (conditional) */}
      {data.has_scratches && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Upload close-up photos of scratches/damage (1–5) <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-3">
            {data.scratch_images.map((url, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                <img src={url} alt={`Scratch ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeScratchImage(idx)}
                  className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full p-0.5"
                  disabled={disabled}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {data.scratch_images.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
                className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                <span className="text-[10px] mt-1">{uploading ? 'Uploading' : 'Add'}</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleScratchImageUpload(e.target.files)}
          />
        </div>
      )}

      {/* 8. Refurbished By (conditional — only for refurbished) */}
      {isRefurbished && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Refurbished by <span className="text-red-500">*</span>
          </label>
          <select
            value={data.refurbished_by || ''}
            onChange={(e) => handleChange('refurbished_by', (e.target.value || null) as ConditionDetailsData['refurbished_by'])}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
            disabled={disabled}
          >
            <option value="">Select who refurbished</option>
            {REFURBISHED_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* 9. Repair Details (conditional — only for refurbished) */}
      {isRefurbished && (
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            What was repaired or replaced? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={data.repair_details || ''}
            onChange={(e) => handleChange('repair_details', e.target.value)}
            placeholder="e.g., Battery replaced, screen repaired, new charging port installed"
            rows={3}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
};

export default ConditionDetailsStep;
