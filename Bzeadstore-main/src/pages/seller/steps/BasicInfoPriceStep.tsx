import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchCountries } from '../../../lib/shippingDataService';
import { fetchCategoriesFlat } from '../../../lib/productService';
import type { Country } from '../../../lib/shippingDataService';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

import type { ItemCondition } from '../../../types';

export interface BasicInfoPriceData {
  itemCondition: ItemCondition;
  name: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  subCategoryId: string;
  subCategoryName: string;
  subCategorySlug: string;
  productTypeId: string;
  productTypeName: string;
  productTypeSlug: string;
  hsnCode: string;
  brand_name: string;
  sku: string;
  manufacturer_address: string;
  shortDescription: string;
  description: string;
  originCountryId: string;
  originCountryCurrency: string;
  mrp: string;
  price: string;
  stock: string;
  isCodAvailable: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  level: number;
}

interface HsnMapping {
  category_slug: string;
  hsn_code: string;
}

interface Props {
  data: BasicInfoPriceData;
  onChange: (data: BasicInfoPriceData) => void;
  disabled?: boolean;
  lockOriginCountry?: boolean;
}

const BasicInfoPriceStep: React.FC<Props> = ({ data, onChange, disabled }) => {
  const { user } = useAuth();
  const [countries, setCountries] = useState<Country[]>([]);
  const [, setLoadingCountries] = useState(true);
  const [allCategories, setAllCategories] = useState<CategoryItem[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [serverDate, setServerDate] = useState<string>('');
  const [hsnMap, setHsnMap] = useState<Map<string, string>>(new Map());
  const [sellerKycLoaded, setSellerKycLoaded] = useState(false);

  useEffect(() => {
    fetchCountries().then(({ data: c }) => {
      setCountries(c);
      setLoadingCountries(false);
    });
    fetchCategoriesFlat(true).then(({ data: cats }) => {
      setAllCategories((cats || []) as CategoryItem[]);
      setLoadingCategories(false);
    });
    supabase.from('category_hsn_codes').select('category_slug, hsn_code').then(({ data: rows }) => {
      const map = new Map<string, string>();
      for (const r of (rows || []) as HsnMapping[]) map.set(r.category_slug, r.hsn_code);
      setHsnMap(map);
    });

    (async () => {
      try {
        const { data } = await supabase.rpc('get_server_date');
        if (data) {
          setServerDate(new Date(String(data)).toLocaleDateString());
          return;
        }
        setServerDate(new Date().toLocaleDateString());
      } catch {
        setServerDate(new Date().toLocaleDateString());
      }
    })();
  }, []);

  // Auto-fetch seller business name & address from KYC
  useEffect(() => {
    if (!user?.id || sellerKycLoaded) return;
    (async () => {
      const { data: kyc } = await supabase
        .from('seller_kyc')
        .select('business_street_address_1, business_street_address_2, business_city, business_state, business_postal_code, business_country')
        .eq('seller_id', user.id)
        .maybeSingle();
      if (kyc) {
        const addrParts = [
          kyc.business_street_address_1,
          kyc.business_street_address_2,
          kyc.business_city,
          kyc.business_state,
          kyc.business_postal_code,
          kyc.business_country,
        ].filter(Boolean);
        onChange({
          ...data,
          manufacturer_address: addrParts.join(', '),
        });
      }
      setSellerKycLoaded(true);
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mainCategories = allCategories.filter((c) => c.level === 1);
  const subCategories = data.categoryId
    ? allCategories.filter((c) => c.parent_id === data.categoryId && c.level === 2)
    : [];
  const productTypes = data.subCategoryId
    ? allCategories.filter((c) => c.parent_id === data.subCategoryId && c.level === 3)
    : [];

  // Pick the most specific 8-digit HSN, falling back through the hierarchy
  const resolveHsn = (catSlug?: string, subSlug?: string, ptSlug?: string): string => {
    const ptHsn = ptSlug ? hsnMap.get(ptSlug) : '';
    if (ptHsn && ptHsn.length === 8) return ptHsn;
    const subHsn = subSlug ? hsnMap.get(subSlug) : '';
    if (subHsn && subHsn.length === 8) return subHsn;
    const catHsn = catSlug ? hsnMap.get(catSlug) : '';
    if (catHsn && catHsn.length === 8) return catHsn;
    // Return best available even if not 8-digit
    return ptHsn || subHsn || catHsn || '';
  };

  const handleChange = (field: keyof BasicInfoPriceData, value: string) => {
    const updated = { ...data, [field]: value };

    if (field === 'categoryId') {
      const cat = mainCategories.find((c) => c.id === value);
      updated.categoryName = cat?.name || '';
      updated.categorySlug = cat?.slug || '';
      updated.subCategoryId = '';
      updated.subCategoryName = '';
      updated.subCategorySlug = '';
      updated.productTypeId = '';
      updated.productTypeName = '';
      updated.productTypeSlug = '';
      updated.hsnCode = resolveHsn(cat?.slug);
    }

    if (field === 'subCategoryId') {
      const sub = subCategories.find((c) => c.id === value);
      updated.subCategoryName = sub?.name || '';
      updated.subCategorySlug = sub?.slug || '';
      updated.productTypeId = '';
      updated.productTypeName = '';
      updated.productTypeSlug = '';
      const mainCat = mainCategories.find((c) => c.id === updated.categoryId);
      updated.hsnCode = resolveHsn(mainCat?.slug, sub?.slug);
    }

    if (field === 'productTypeId') {
      const pt = productTypes.find((c) => c.id === value);
      updated.productTypeName = pt?.name || '';
      updated.productTypeSlug = pt?.slug || '';
      const mainCat = mainCategories.find((c) => c.id === updated.categoryId);
      const sub = subCategories.find((c) => c.id === updated.subCategoryId);
      updated.hsnCode = resolveHsn(mainCat?.slug, sub?.slug, pt?.slug);
    }

    if (field === 'originCountryId') {
      const country = countries.find((c) => c.id === value);
      updated.originCountryCurrency = country?.currency_code || '';
    }

    onChange(updated);
  };

  // Shared compact styles (~30% smaller fonts/padding for mobile-first wizard)
  const labelCls = 'block text-[11px] font-semibold text-gray-900 mb-1';
  const inputCls =
    'w-full bg-white border border-gray-200 rounded-md px-2.5 py-2 text-[12px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors';
  const selectCls =
    'w-full bg-white border border-gray-200 rounded-md px-2.5 py-2 text-[12px] text-gray-900 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer';

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <div className="bg-blue-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-sm">Product Details & Pricing</div>
      </div>
      <div className="text-[10px] text-gray-500 text-center">Date: {serverDate || 'Loading...'}</div>

      {/* Item Condition */}
      <div>
        <label className={labelCls}>
          Item Condition <span className="text-red-500">*</span>
        </label>
        <select
          value={data.itemCondition}
          onChange={(e) => handleChange('itemCondition', e.target.value as ItemCondition)}
          className={selectCls}
          disabled={disabled}
        >
          <option value="brand_new">Brand New (Sealed)</option>
          <option value="used_open_box">Used - Open Box</option>
          <option value="used_like_new">Used - Like New</option>
          <option value="used_very_good">Used - Very Good</option>
          <option value="used_good">Used - Good</option>
          <option value="used_acceptable">Used - Acceptable</option>
          <option value="refurbished">Refurbished</option>
        </select>
        {data.itemCondition !== 'brand_new' && (
          <p className="mt-1 text-[10px] text-blue-600">
            Used/refurbished items require additional condition details and return policy steps.
          </p>
        )}
      </div>

      {/* Product Name */}
      <div>
        <label className={labelCls}>
          Product Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g., Premium Wireless Headphones"
          className={inputCls}
          disabled={disabled}
        />
      </div>

      {/* Main Category */}
      <div>
        <label className={labelCls}>
          Category <span className="text-red-500">*</span>
        </label>
        {loadingCategories ? (
          <div className="flex items-center gap-2 text-[11px] text-gray-500 py-2">
            <Loader2 size={14} className="animate-spin" /> Loading categories...
          </div>
        ) : (
          <select
            value={data.categoryId}
            onChange={(e) => handleChange('categoryId', e.target.value)}
            className={selectCls}
            disabled={disabled}
          >
            <option value="">Select Category</option>
            {mainCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Sub-Category */}
      {data.categoryId && subCategories.length > 0 && (
        <div>
          <label className={labelCls}>
            Sub-Category <span className="text-red-500">*</span>
          </label>
          <select
            value={data.subCategoryId}
            onChange={(e) => handleChange('subCategoryId', e.target.value)}
            className={selectCls}
            disabled={disabled}
          >
            <option value="">Select Sub-Category</option>
            {subCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Product Type (Level 3) */}
      {data.subCategoryId && productTypes.length > 0 && (
        <div>
          <label className={labelCls}>
            Product Type <span className="text-red-500">*</span>
          </label>
          <select
            value={data.productTypeId}
            onChange={(e) => handleChange('productTypeId', e.target.value)}
            className={selectCls}
            disabled={disabled}
          >
            <option value="">Select Product Type</option>
            {productTypes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* HSN Code (auto-filled, non-editable) */}
      {data.hsnCode && (
        <div>
          <label className={labelCls}>HSN Code</label>
          <input
            type="text"
            value={data.hsnCode}
            readOnly
            className={`${inputCls} bg-gray-100 text-gray-700 cursor-not-allowed`}
            placeholder="Auto-filled from category"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">Auto-set based on category selection.</p>
        </div>
      )}

      {/* Brand Name */}
      <div>
        <label className={labelCls}>Brand Name <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={data.brand_name}
          onChange={(e) => handleChange('brand_name', e.target.value)}
          placeholder="e.g., Sony, Apple, Nike"
          className={inputCls}
          disabled={disabled}
        />
      </div>

      {/* SKU (auto-generated, hidden from UI but value preserved in state) */}
      <div className="hidden" aria-hidden="true">
        <input type="text" value={data.sku} readOnly />
      </div>

      {/* Seller Address (auto-fetched from KYC, hidden from UI but value preserved in state) */}
      <div className="hidden" aria-hidden="true">
        <input type="text" value={data.manufacturer_address} readOnly />
      </div>

      {/* Short Description */}
      <div>
        <label className={labelCls}>
          Short Description <span className="text-red-500">*</span>{' '}
          <span className="text-gray-500 text-[10px]">(Max 350 chars)</span>
        </label>
        <textarea
          value={data.shortDescription}
          onChange={(e) => handleChange('shortDescription', e.target.value)}
          placeholder="Brief product summary for search results..."
          maxLength={350}
          rows={2}
          className={`${inputCls} resize-none`}
          disabled={disabled}
        />
        <p className="text-[10px] text-gray-500 mt-0.5">{data.shortDescription.length}/350 characters</p>
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>About Product <span className="text-red-500">*</span></label>
        <textarea
          value={data.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Describe your product features, specifications, and benefits..."
          rows={3}
          className={`${inputCls} resize-none`}
          disabled={disabled}
        />
        <p className="text-[10px] text-gray-500 mt-0.5">Minimum 30 characters required.</p>
      </div>

      {/* Origin Country (auto-fetched / locked, hidden from UI but value preserved in state) */}
      <div className="hidden" aria-hidden="true">
        <select value={data.originCountryId} onChange={(e) => handleChange('originCountryId', e.target.value)}>
          <option value="">Select Origin Country</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c.country_name}</option>
          ))}
        </select>
      </div>

      {/* MRP / Selling Price / Stock are now managed in the Variant Combinations section
          (Product Details step). The base columns on `products` (mrp/price/stock) are
          derived from the variant rows on save. */}
      <p className="text-[11px] text-gray-500 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
        <strong>MRP, Selling Price, and Stock</strong> are entered in the next step under
        <em> Product Variants &rarr; Variant Rows</em>. The product&apos;s base price is automatically
        derived from the lowest-priced variant.
      </p>

      <div className="border border-gray-200 rounded-md px-2.5 py-2">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.isCodAvailable}
            onChange={(e) => onChange({ ...data, isCodAvailable: e.target.checked })}
            disabled={disabled}
            className="mt-0.5 w-3.5 h-3.5"
          />
          <div>
            <p className="text-[11px] font-semibold text-gray-900">Cash on Delivery (COD) Available</p>
            <p className="text-[10px] text-gray-500">When enabled, COD appears in checkout for eligible destination and cart combinations.</p>
          </div>
        </label>
      </div>
    </div>
  );
};

export default BasicInfoPriceStep;
