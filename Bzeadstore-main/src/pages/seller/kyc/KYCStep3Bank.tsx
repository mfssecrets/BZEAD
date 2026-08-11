/**
 * KYCStep3Bank — Step 3: Bank Details
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface BankData {
  bank_holder_name: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  swift_routing_code: string;
  account_type: 'checking' | 'savings' | 'current';
  bank_authorization: boolean;
}

interface Props {
  initialData?: Partial<BankData>;
  onSaveNext: (data: BankData) => Promise<void>;
  onCancel: () => void;
}

const KYCStep3Bank: React.FC<Props> = ({ initialData, onSaveNext, onCancel }) => {
  const [form, setForm] = useState<BankData>({
    bank_holder_name: initialData?.bank_holder_name || '',
    bank_name: initialData?.bank_name || '',
    branch_name: initialData?.branch_name || '',
    account_number: initialData?.account_number || '',
    swift_routing_code: initialData?.swift_routing_code || '',
    account_type: initialData?.account_type || 'savings',
    bank_authorization: initialData?.bank_authorization || false,
  });
  const [confirmAccount, setConfirmAccount] = useState(initialData?.account_number || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.bank_holder_name.trim()) e.bank_holder_name = 'Account holder name is required';
    if (!form.bank_name.trim()) e.bank_name = 'Bank name is required';
    if (!form.account_number.trim()) e.account_number = 'Account number is required';
    if (form.account_number !== confirmAccount) e.confirm_account = 'Account numbers do not match';
    if (!form.swift_routing_code.trim()) e.swift_routing_code = 'SWIFT / IFSC / Routing code is required';
    if (!form.bank_authorization) e.bank_authorization = 'You must authorize payouts';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSaveNext = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSaveNext(form);
    } catch (err) {
      setErrors({ _general: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof BankData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Bank Details</h2>
        <p className="text-sm text-gray-500 mt-1">Banking information for seller payouts.</p>
      </div>

      {errors._general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errors._general}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account Holder Name */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-900 mb-1">Account Holder Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.bank_holder_name}
            onChange={e => handleChange('bank_holder_name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.bank_holder_name ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Name as per bank records"
          />
          {errors.bank_holder_name && <p className="text-xs text-red-500 mt-1">{errors.bank_holder_name}</p>}
        </div>

        {/* Bank Name */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Bank Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.bank_name}
            onChange={e => handleChange('bank_name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.bank_name ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Enter bank name"
          />
          {errors.bank_name && <p className="text-xs text-red-500 mt-1">{errors.bank_name}</p>}
        </div>

        {/* Branch Name (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Branch Name <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            type="text"
            value={form.branch_name}
            onChange={e => handleChange('branch_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Branch name"
          />
        </div>

        {/* Account Number */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Account Number <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.account_number}
            onChange={e => handleChange('account_number', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.account_number ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Enter account number"
          />
          {errors.account_number && <p className="text-xs text-red-500 mt-1">{errors.account_number}</p>}
        </div>

        {/* Confirm Account Number */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">Confirm Account Number <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={confirmAccount}
            onChange={e => { setConfirmAccount(e.target.value); if (errors.confirm_account) setErrors(prev => { const n = { ...prev }; delete n.confirm_account; return n; }); }}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.confirm_account ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="Re-enter account number"
          />
          {errors.confirm_account && <p className="text-xs text-red-500 mt-1">{errors.confirm_account}</p>}
        </div>

        {/* SWIFT / IFSC / Routing Code */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">SWIFT / IFSC / Routing Code <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.swift_routing_code}
            onChange={e => handleChange('swift_routing_code', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.swift_routing_code ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="e.g., SBIN0001234"
          />
          {errors.swift_routing_code && <p className="text-xs text-red-500 mt-1">{errors.swift_routing_code}</p>}
        </div>

        {/* Account Type */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Account Type <span className="text-red-500">*</span></label>
          <div className="flex gap-4 flex-wrap">
            {([
              { value: 'checking', label: 'Checking' },
              { value: 'savings', label: 'Savings' },
              { value: 'current', label: 'Current / Business' },
            ] as const).map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="account_type"
                  value={opt.value}
                  checked={form.account_type === opt.value}
                  onChange={() => handleChange('account_type', opt.value)}
                  className="w-4 h-4 accent-blue-800"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Authorization */}
      <div className={`border rounded-lg p-4 ${errors.bank_authorization ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.bank_authorization}
            onChange={e => handleChange('bank_authorization', e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-blue-800"
          />
          <span className="text-sm text-gray-700">
            I confirm that I am the owner of this bank account and authorize BzeadStore to process payouts to this account.
          </span>
        </label>
        {errors.bank_authorization && <p className="text-xs text-red-500 mt-2 ml-7">{errors.bank_authorization}</p>}
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

export default KYCStep3Bank;
