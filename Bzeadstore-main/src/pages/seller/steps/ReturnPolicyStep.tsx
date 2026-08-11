import React from 'react';
import type { ProductReturnPolicy } from '../../../types';

export type ReturnPolicyData = Omit<ProductReturnPolicy, 'id' | 'product_id'>;

interface Props {
  data: ReturnPolicyData;
  onChange: (data: ReturnPolicyData) => void;
  disabled?: boolean;
}

const RETURN_WINDOW_OPTIONS = [
  { value: '24_hours', label: '24 Hours' },
  { value: '48_hours', label: '48 Hours' },
  { value: '3_days', label: '3 Days' },
  { value: '5_days', label: '5 Days' },
];

const RETURN_REASON_OPTIONS = [
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'damaged', label: 'Arrived damaged' },
  { value: 'not_working', label: 'Not working / defective' },
  { value: 'missing_parts', label: 'Missing parts or accessories' },
];

const ReturnPolicyStep: React.FC<Props> = ({ data, onChange, disabled }) => {
  const handleChange = <K extends keyof ReturnPolicyData>(field: K, value: ReturnPolicyData[K]) => {
    const updated = { ...data, [field]: value };
    // Clear conditional fields when returns toggled off
    if (field === 'accepts_returns' && !value) {
      updated.return_window = null;
      updated.accepted_return_reasons = [];
      updated.return_shipping_by = null;
      updated.refund_type = null;
      updated.proof_requirement = null;
    }
    onChange(updated);
  };

  const toggleReturnReason = (reason: string) => {
    const current = data.accepted_return_reasons || [];
    const updated = current.includes(reason)
      ? current.filter((r) => r !== reason)
      : [...current, reason];
    handleChange('accepted_return_reasons', updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="bg-purple-600 text-white text-sm font-semibold px-5 py-2 rounded-sm">Return & Refund Policy</div>
      </div>
      <p className="text-xs text-gray-500 text-center">
        Define your return policy for this used/refurbished product. Clear policies build buyer confidence.
      </p>

      {/* 1. Accepts Returns */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Do you accept returns for this product? <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => handleChange('accepts_returns', val)}
              disabled={disabled}
              className={`px-5 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                data.accepts_returns === val
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
              }`}
            >
              {val ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
        {!data.accepts_returns && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No-return policies may reduce buyer trust. Consider offering at least a 24-hour return window.
          </p>
        )}
      </div>

      {data.accepts_returns && (
        <>
          {/* 2. Return Window */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Return Window <span className="text-red-500">*</span>
            </label>
            <select
              value={data.return_window || ''}
              onChange={(e) => handleChange('return_window', (e.target.value || null) as ReturnPolicyData['return_window'])}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
              disabled={disabled}
            >
              <option value="">Select return window</option>
              {RETURN_WINDOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 3. Accepted Return Reasons */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Accepted return reasons <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {RETURN_REASON_OPTIONS.map((reason) => (
                <label key={reason.value} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(data.accepted_return_reasons || []).includes(reason.value)}
                    onChange={() => toggleReturnReason(reason.value)}
                    disabled={disabled}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{reason.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 4. Return Shipping By */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Who pays for return shipping? <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {(['seller', 'buyer'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleChange('return_shipping_by', val)}
                  disabled={disabled}
                  className={`px-5 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                    data.return_shipping_by === val
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {val === 'seller' ? 'Seller Pays' : 'Buyer Pays'}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Refund Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Refund type <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {(['full_refund', 'partial_refund', 'replacement'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleChange('refund_type', val)}
                  disabled={disabled}
                  className={`px-4 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                    data.refund_type === val
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {val === 'full_refund' ? 'Full Refund' : val === 'partial_refund' ? 'Partial Refund' : 'Replacement'}
                </button>
              ))}
            </div>
          </div>

          {/* 6. Proof Requirement */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              What proof do you require from buyer for returns? <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {(['unboxing_video', 'photos', 'none'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleChange('proof_requirement', val)}
                  disabled={disabled}
                  className={`px-4 py-2.5 text-[13px] font-bold rounded border transition-colors ${
                    data.proof_requirement === val
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {val === 'unboxing_video' ? 'Unboxing Video' : val === 'photos' ? 'Photos' : 'No Proof Needed'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 7. Return Condition Agreement */}
      <div className="border-t border-gray-200 pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.return_condition_agreed}
            onChange={(e) => handleChange('return_condition_agreed', e.target.checked)}
            disabled={disabled}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Item must be returned in the same condition it was sold in, with all accessories included. <span className="text-red-500">*</span>
          </span>
        </label>
      </div>

      {/* 8. Seller Responsibility Agreement */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.seller_responsibility_agreed}
            onChange={(e) => handleChange('seller_responsibility_agreed', e.target.checked)}
            disabled={disabled}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            I agree to handle returns and refunds based on this policy. I understand that BZEAD may mediate disputes if the buyer raises a complaint. <span className="text-red-500">*</span>
          </span>
        </label>
      </div>
    </div>
  );
};

export default ReturnPolicyStep;
