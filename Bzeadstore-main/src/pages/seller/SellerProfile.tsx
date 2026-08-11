import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '../../utils/logger';
import { useAuth } from '../../contexts/AuthContext';
import { Edit2, Save, X, Upload, Loader2, AlertCircle, CheckCircle2, Mail, Phone, MapPin, Building2, Globe, Shield, ChevronLeft } from 'lucide-react';
import { FormSkeleton } from '../../components/common/Skeleton';
import { fetchSellerProfile, updateSellerProfile, uploadSellerLogo, fetchSellerBankDetails } from '../../lib/orderService';

interface SellerProfileFormData {
  business_name: string;
  description: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  bank_details: {
    bankName: string;
    accountNumber: string;
    ifscCode: string;
  };
}

// Module-level cache keyed by sellerId — survives unmounts so revisits render instantly
// while a silent background refresh updates the cache.
interface SellerProfileCacheEntry {
  formData: SellerProfileFormData;
  shopLogo: string;
  agreementAccepted: boolean;
  agreementAcceptedAt: string | null;
  isVerifiedSeller: boolean;
}
const sellerProfileCache: Record<string, SellerProfileCacheEntry> = {};

const emptyProfileFormData: SellerProfileFormData = {
  business_name: '',
  description: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  bank_details: {
    bankName: '',
    accountNumber: '',
    ifscCode: ''
  }
};

export const SellerProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentAuthUser } = useAuth();
  const sellerIdEarly = user?.id || currentAuthUser?.userId || '';
  const cachedEntry = sellerIdEarly ? sellerProfileCache[sellerIdEarly] : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(() => !cachedEntry);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(() => cachedEntry?.agreementAccepted || false);
  const [agreementAcceptedAt, setAgreementAcceptedAt] = useState<string | null>(() => cachedEntry?.agreementAcceptedAt || null);
  const [isVerifiedSeller, setIsVerifiedSeller] = useState(() => cachedEntry?.isVerifiedSeller || false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<SellerProfileFormData>(() => cachedEntry?.formData || emptyProfileFormData);

  const [shopLogo, setShopLogo] = useState(() => cachedEntry?.shopLogo || '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const sellerId = sellerIdEarly;

  // Fetch seller data on component mount
  useEffect(() => {
    if (sellerId) {
      fetchSellerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  const fetchSellerData = async () => {
    try {
      const hasCache = !!sellerId && !!sellerProfileCache[sellerId];
      if (!hasCache) setLoading(true);
      setError(null);

      const [profileRes, bankRes] = await Promise.all([
        fetchSellerProfile(sellerId),
        fetchSellerBankDetails(sellerId),
      ]);

      if (profileRes.error) {
        setError('Failed to load seller profile');
      } else if (profileRes.data) {
        const seller = profileRes.data;
        const savedBank = seller.bank_details as Record<string, string> | null;
        const kycBank = bankRes.data;

        const verified = Boolean(seller.is_verified) || String(seller.kyc_status || '').toLowerCase() === 'approved';
        setIsVerifiedSeller(verified);
        setAgreementAccepted(Boolean(seller.seller_agreement_accepted));
        setAgreementAcceptedAt(seller.seller_agreement_accepted_at || null);

        const nextFormData: SellerProfileFormData = {
          business_name: seller.full_name || '',
          description: seller.shop_description || '',
          email: seller.email || '',
          phone: seller.phone || '',
          website: seller.website || '',
          address: seller.shop_address || '',
          bank_details: {
            bankName: savedBank?.bankName || kycBank?.bank_holder_name || '',
            accountNumber: savedBank?.accountNumber || kycBank?.account_number || '',
            ifscCode: savedBank?.ifscCode || kycBank?.ifsc_code || '',
          }
        };
        const nextLogo = seller.logo_url || '';
        setFormData(nextFormData);
        setShopLogo(nextLogo);
        if (sellerId) {
          sellerProfileCache[sellerId] = {
            formData: nextFormData,
            shopLogo: nextLogo,
            agreementAccepted: Boolean(seller.seller_agreement_accepted),
            agreementAcceptedAt: seller.seller_agreement_accepted_at || null,
            isVerifiedSeller: verified,
          };
        }
      }
    } catch (err) {
      console.error('Error fetching seller data:', err);
      setError('Failed to load seller profile');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setShopLogo(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      let logoUrl = shopLogo;

      // Upload logo to Supabase Storage if a new file was selected
      if (logoFile) {
        const { url, error: uploadError } = await uploadSellerLogo(sellerId, logoFile);
        if (uploadError) {
          setError('Failed to upload logo: ' + uploadError);
          setSaving(false);
          setShowSaveConfirm(false);
          return;
        }
        if (url) logoUrl = url;
      }

      const { data: updatedProfile, error: saveError } = await updateSellerProfile(
        sellerId,
        {
          full_name: formData.business_name,
          email: formData.email,
          phone: formData.phone,
          shop_description: formData.description,
          website: formData.website,
          shop_address: formData.address,
          logo_url: logoUrl,
          bank_details: formData.bank_details,
        }
      );

      if (saveError || !updatedProfile) {
        setError('Failed to save profile. Please try again.');
      } else {
        logger.log('Profile saved successfully', updatedProfile);
        setLogoFile(null);
        setIsEditing(false);


      }
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
      setShowSaveConfirm(false);
    }
  };

  const handleAcceptAgreement = async () => {
    try {
      setSaving(true);
      setError(null);

      const acceptedAt = new Date().toISOString();
      const { data, error: updateError } = await updateSellerProfile(sellerId, {
        seller_agreement_accepted: true,
        seller_agreement_accepted_at: acceptedAt,
      });

      if (updateError || !data) {
        throw new Error(updateError || 'Failed to accept seller agreement');
      }

      setAgreementAccepted(true);
      setAgreementAcceptedAt(acceptedAt);
      setSuccessMessage('Seller agreement accepted successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Error accepting seller agreement:', err);
      setError('Failed to accept seller agreement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile back bar */}
      <div className="lg:hidden flex items-center gap-2 mb-3">
        <button
          onClick={() => navigate('/seller/dashboard')}
          className="p-1.5 sm:p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
          aria-label="Back to dashboard"
        >
          <ChevronLeft size={16} />
        </button>
        <h1 className="text-base font-bold text-gray-900">Seller Profile</h1>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <FormSkeleton fields={6} />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 border-l-4 border-l-red-500">
          <div className="flex items-center gap-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-800">{error}</h3>
              <button onClick={fetchSellerData} className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium">
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm font-semibold text-green-800">{successMessage}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {/* Profile Card with Avatar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 text-center">
            <div className="relative inline-block">
              {shopLogo ? (
                <img
                  src={shopLogo}
                  alt="Shop Logo"
                  className="w-20 h-20 object-cover rounded-2xl mx-auto mb-3 shadow-lg border-2 border-gray-100"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)' }}>
                  <span className="text-2xl font-bold text-white">
                    {(formData.business_name || 'S').slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900">{formData.business_name || 'Your Shop'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{formData.description ? formData.description.slice(0, 60) : 'Seller on BZEAD'}</p>
            <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
              {isVerifiedSeller && (
                <span className="bg-green-50 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full border border-green-200 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Verified Seller
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-4 justify-center">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
                disabled={saving}
              >
                {isEditing ? (
                  <><X className="w-3.5 h-3.5" /> Cancel</>
                ) : (
                  <><Edit2 className="w-3.5 h-3.5" /> Edit Profile</>
                )}
              </button>
              {isEditing && (
                <label className="inline-block">
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-blue-700 transition cursor-pointer"
                    style={{ opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}
                  >
                    <Upload className="w-3.5 h-3.5" /> Change Logo
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Shop Information */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-gray-400" /> Shop Information
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-1">Business Name</label>
                <input type="text" name="business_name" value={formData.business_name} onChange={handleInputChange} disabled={!isEditing || saving}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-700" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-1">Shop Description</label>
                <textarea name="description" value={formData.description} onChange={handleInputChange} disabled={!isEditing || saving} rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-700" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 font-bold uppercase tracking-widest mb-1">Website</label>
                <input type="url" name="website" value={formData.website} onChange={handleInputChange} disabled={!isEditing || saving}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-700" />
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-gray-400" /> Contact Details
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                  <Mail className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-400 font-bold uppercase tracking-widest">Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} disabled={!isEditing || saving}
                    className="w-full px-0 py-0.5 border-0 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0 disabled:bg-transparent" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                  <Phone className="w-3.5 h-3.5 text-green-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-400 font-bold uppercase tracking-widest">Phone</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} disabled={!isEditing || saving}
                    className="w-full px-0 py-0.5 border-0 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0 disabled:bg-transparent" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-400 font-bold uppercase tracking-widest">Address</label>
                  <input type="text" name="address" value={formData.address} onChange={handleInputChange} disabled={!isEditing || saving}
                    className="w-full px-0 py-0.5 border-0 text-sm font-medium text-gray-900 focus:outline-none focus:ring-0 disabled:bg-transparent" />
                </div>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-gray-400" /> Bank Details
              </h3>
            </div>
            <div className="p-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-start gap-2 mb-4">
                <Shield className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-blue-700 font-medium leading-relaxed">Bank details are encrypted and only used for payouts.</p>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400 font-bold uppercase">Bank Name</span>
                  {isEditing ? (
                    <input type="text" value={formData.bank_details.bankName}
                      onChange={(e) => setFormData(prev => ({ ...prev, bank_details: { ...prev.bank_details, bankName: e.target.value } }))}
                      disabled={saving} className="text-xs font-semibold text-gray-900 text-right border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  ) : (
                    <span className="text-xs font-semibold text-gray-900">{formData.bank_details.bankName || '—'}</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400 font-bold uppercase">Account</span>
                  {isEditing ? (
                    <input type="password" value={formData.bank_details.accountNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, bank_details: { ...prev.bank_details, accountNumber: e.target.value } }))}
                      disabled={saving} className="text-xs font-semibold text-gray-900 text-right border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  ) : (
                    <span className="text-xs font-semibold text-gray-900">
                      {formData.bank_details.accountNumber ? `••••••${formData.bank_details.accountNumber.slice(-4)}` : '—'}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-gray-400 font-bold uppercase">IFSC</span>
                  {isEditing ? (
                    <input type="text" value={formData.bank_details.ifscCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, bank_details: { ...prev.bank_details, ifscCode: e.target.value } }))}
                      disabled={saving} className="text-xs font-semibold text-gray-900 text-right border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  ) : (
                    <span className="text-xs font-semibold text-gray-900">{formData.bank_details.ifscCode || '—'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          {isEditing && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveConfirm(true)}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {!saving && <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setIsEditing(false); setShowSaveConfirm(false); }}
                disabled={saving}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl hover:bg-gray-200 transition font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Seller Agreement */}
          {isVerifiedSeller && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Seller Agreement</h3>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-600 leading-relaxed">
                  By accepting this agreement, you confirm compliance with BZEAD seller policies, listing standards,
                  delivery commitments, and applicable marketplace terms.
                </p>
                {agreementAccepted ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <p className="text-sm font-medium text-green-700">Agreement accepted</p>
                    {agreementAcceptedAt && (
                      <p className="text-xs text-green-600 mt-1">Accepted on {new Date(agreementAcceptedAt).toLocaleString()}</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-amber-700">Agreement is pending. Please accept to activate.</p>
                    <button type="button" onClick={handleAcceptAgreement} disabled={saving}
                      className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Accept Agreement'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Save Confirm Modal */}
          {showSaveConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] p-4" onClick={() => !saving && setShowSaveConfirm(false)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Save Changes</h3>
                <p className="text-sm text-gray-600 mb-6">Save your updated seller profile details now?</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowSaveConfirm(false)} disabled={saving}
                    className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-semibold text-sm disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm flex items-center gap-2 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Confirm Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SellerProfile;
