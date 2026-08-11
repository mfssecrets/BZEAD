import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
import {
  Loader2,
  Mail,
  User,
  Lock,
  Globe,
  Briefcase,
  Phone,
  ChevronDown,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { validateEmail, validatePassword, validateFullName, validatePhone } from '../../utils/validation';
import { SellerAuthHeader } from './SellerAuthHeader';
import { isNativePlatform } from '../../mobile/nativePlatform';
import { AuthCardHeader } from '../../components/auth/AuthCardHeader';

interface DBCountry { id: string; country_name: string; short_code: string; currency_code: string; dialing_code: string; is_active?: boolean; }
interface DBBusinessType { id: string; business_type_name: string; description?: string; is_active?: boolean; }

// Map database types to component types
interface Country {
  id: string;
  countryName: string;
  shortCode: string;
  currency: string;
  dialCode?: string;
}

interface BusinessType {
  id: string;
  typeName: string;
  description?: string;
}

const SellerSignup: React.FC = () => {
  const existingEmailMessage = 'A user account already exists with this email address. Please use another email address.';
  const [isLoading, setIsLoading] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    countryId: '',
    businessTypeId: '',
    mobile: '',
    password: '',
  });
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const otpPurpose = 'seller-signup';

  const goToOtp = (
    targetEmail: string,
    opts?: { fullName?: string; phone?: string; countryId?: string; businessTypeId?: string }
  ) => {
    sessionStorage.setItem('sellerSignupEmail', targetEmail);
    sessionStorage.setItem('otpContext', JSON.stringify({ email: targetEmail, purpose: otpPurpose, role: 'seller' }));
    if (opts?.countryId) sessionStorage.setItem('signupCountryId', opts.countryId);
    if (opts?.businessTypeId) sessionStorage.setItem('signupBusinessTypeId', opts.businessTypeId);
    if (opts?.fullName) sessionStorage.setItem('signupFullName', opts.fullName);
    if (opts?.phone) sessionStorage.setItem('signupPhone', opts.phone);

    setIsLoading(false);
    navigate('/seller/otp-verification', {
      state: {
        email: targetEmail,
        purpose: otpPurpose,
        role: 'seller',
        notice: 'OTP sent successfully. Please check your inbox and spam folder.'
      }
    });
  };

  // Fetch countries and business types from Supabase
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [countriesResp, businessTypesResp] = await Promise.all([
          supabase
            .from('countries')
            .select('id, country_name, short_code, currency_code, dialing_code')
            .eq('is_active', true)
            .order('country_name'),
          supabase
            .from('business_types')
            .select('id, type_name, description')
            .eq('is_active', true)
            .order('type_name'),
        ]);

        const countriesData: DBCountry[] = countriesResp.data?.map((c: any) => ({
          id: c.id,
          country_name: c.country_name,
          short_code: c.short_code,
          currency_code: c.currency_code,
          dialing_code: c.dialing_code,
        })) || [];

        const businessTypesData: DBBusinessType[] = businessTypesResp.data?.map((b: any) => ({
          id: b.id,
          business_type_name: b.type_name,
          description: b.description,
        })) || [];

        const mappedCountries: Country[] = countriesData.map((c) => ({
          id: c.id,
          countryName: c.country_name,
          shortCode: c.short_code,
          currency: c.currency_code,
          dialCode: c.dialing_code,
        }));

        const mappedBusinessTypes: BusinessType[] = businessTypesData.map((b) => ({
          id: b.id,
          typeName: b.business_type_name,
          description: b.description,
        }));

        setCountries(mappedCountries);

        setBusinessTypes(mappedBusinessTypes);
      } catch (error) {
        logger.error(error as Error, { context: 'Error fetching data for signup' });
        setError('Failed to load required data. Please refresh the page and try again.');
        setCountries([]);
        setBusinessTypes([]);
      }
    };

    fetchData();
  }, []);

  const selectedCountry = countries.find((c) => c.id === formData.countryId);

  const handlePasswordChange = (value: string) => {
    setFormData({ ...formData, password: value });
    if (value) {
      setPasswordErrors(validatePassword(value));
    } else {
      setPasswordErrors([]);
    }
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = formData.email.trim().toLowerCase();
    const normalizedFullName = formData.fullName.trim();
    const sanitizedMobile = formData.mobile.replace(/\D/g, '');
    
    // Validate password
    const errors = validatePassword(formData.password);
    if (errors.length > 0) {
      setPasswordErrors(errors);
      return;
    }

    // Validate full name (first letter must be capital)
    const nameError = validateFullName(normalizedFullName);
    if (nameError) {
      setError(nameError);
      return;
    }

    // Validate email
    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    if (!formData.countryId || !formData.businessTypeId) {
      setError('Please select a country and business type');
      return;
    }

    // Validate phone (required for sellers)
    const phoneError = validatePhone(sanitizedMobile);
    if (phoneError) {
      setError(phoneError);
      return;
    }

    setIsLoading(true);

    let selectedCountry: Country | undefined;
    let phoneNumber = sanitizedMobile;

    try {
      selectedCountry = countries.find((c) => c.id === formData.countryId);
      phoneNumber = selectedCountry?.dialCode 
        ? `${selectedCountry.dialCode}${sanitizedMobile}` 
        : sanitizedMobile;

      const result = await signUp(
        normalizedEmail, 
        formData.password, 
        'seller', 
        normalizedFullName, 
        selectedCountry?.currency,
        phoneNumber, // Pass phone number for sellers
        formData.countryId,
        formData.businessTypeId
      );

      if (!result.success) {
        const msg = result.error?.message || 'Failed to sign up';
        const lowered = msg.toLowerCase();
        const looksLikeExisting = lowered.includes('already exists') || lowered.includes('already registered') || lowered.includes('already been registered') || lowered.includes('duplicate key');
        setError(looksLikeExisting ? existingEmailMessage : msg);
        setIsLoading(false);
        return;
      }

      if (result.success) {
        goToOtp(normalizedEmail, {
          fullName: normalizedFullName,
          phone: phoneNumber,
          countryId: formData.countryId,
          businessTypeId: formData.businessTypeId,
        });
      }
    } catch (err: any) {
      const msg = err.message || '';
      const lowered = msg.toLowerCase();
      const looksLikeExisting = lowered.includes('already exists') || lowered.includes('already registered') || lowered.includes('already been registered') || lowered.includes('duplicate key');
      setError(looksLikeExisting ? existingEmailMessage : (msg || 'An error occurred during signup'));
      setIsLoading(false);
    }
  };

  return (
    <div className="seller-auth-shell">
      <SellerAuthHeader />
      <div className="auth-card auth-card--seller">
        {!isNativePlatform && (
          <Link
            to="/"
            className="auth-top-link"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        )}

        <AuthCardHeader title="Create My Store" />

            <div className="bg-transparent p-0">
              <form onSubmit={handleDetailsSubmit} className="space-y-4">
                {error && (
                  <div className="auth-alert auth-alert--error">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="auth-label">Business Country</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <select
                      value={formData.countryId}
                      onChange={(e) => setFormData({ ...formData, countryId: e.target.value })}
                      className="auth-select"
                      disabled={countries.length === 0}
                    >
                      <option value="" disabled>Select your country</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.countryName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="auth-label">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                      type="text"
                      required
                      placeholder="Enter legal name"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="auth-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="auth-label">Business Type</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <select
                      value={formData.businessTypeId}
                      onChange={(e) => setFormData({ ...formData, businessTypeId: e.target.value })}
                      className="auth-select"
                      disabled={businessTypes.length === 0}
                    >
                      <option value="" disabled>Select business type</option>
                      {businessTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.typeName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="auth-label">Business Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="auth-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="auth-label">Mobile Number</label>
                  <div className="flex gap-2">
                    <div className="w-24 shrink-0 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-3 h-9 text-sm font-semibold flex items-center justify-center select-none">
                      {selectedCountry?.dialCode || '+0'}
                    </div>
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <input
                        type="tel"
                        required
                        placeholder="Mobile number"
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        className="auth-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="auth-label">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Create a strong password"
                      value={formData.password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      className={`auth-input auth-input--toggle ${
                        passwordErrors.length > 0 ? '!border-red-300 focus:!border-red-500 focus:!ring-red-500/15' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passwordErrors.length === 0 && (
                    <p className="auth-field-hint">
                      Use 8+ characters with a mix of letters, numbers &amp; symbols.
                    </p>
                  )}
                  
                  {passwordErrors.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {passwordErrors.map((error, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-red-600">
                          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || passwordErrors.length > 0}
                  className="auth-submit-btn-primary mt-2 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Create account'}
                </button>
                
                <div className="text-center">
                  <p className="text-slate-600 text-xs">
                    Already a seller?{' '}
                    <Link to="/seller/login" className="auth-footer-link">
                      Sign in
                    </Link>
                  </p>
                </div>
              </form>
            </div>
      </div>
    </div>
  );
};

export default SellerSignup;
