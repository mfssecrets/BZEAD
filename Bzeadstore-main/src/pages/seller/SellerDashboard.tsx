import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  ShoppingBag, BarChart2, 
  Package, Wallet,
  Clock, AlertTriangle, MapPin,
  ShieldCheck, Loader2,
  Download, Upload,
  User, Phone, Building2, Globe, CreditCard, Lock,
} from 'lucide-react';
import { fetchOrdersBySeller, fetchSellerProfile, updateSellerProfile, fetchSellerBankDetails } from '../../lib/orderService';
import { createProduct, saveConditionDetails, saveReturnPolicy, generateNextSku } from '../../lib/productService';
import { sumSellerOrderTotal } from '../../lib/orderPricingViews';
import { useSellerDisplayCurrency } from '../../hooks/useSellerDisplayCurrency';
import { Skeleton, FormSkeleton, ListSkeleton } from '../../components/common/Skeleton';

interface SellerDashboardProfileData {
  name: string;
  email: string;
  mobile: string;
  brandName: string;
  businessType: string;
  businessAddress: string;
  country: string;
}

interface SellerDashboardProps {
  sellerEmail: string;
  sellerPhone?: string;
  sellerFullName?: string;
  sellerCountry?: string;
  onNavigate: (view: any) => void;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  profileData: SellerDashboardProfileData;
}

type DashboardSection = 'overview' | 'settings' | 'profile';

type BulkCsvRow = {
  item_condition?: string;
  name: string;
  category_slug: string;
  sub_category_slug?: string;
  product_type_slug?: string;
  brand?: string;
  mrp: string;
  price: string;
  stock: string;
  description?: string;
  short_description?: string;
  sku?: string;
  image_urls_json?: string;
  video_urls_json?: string;
  packing_type_name?: string;
  package_weight?: string;
  package_weight_unit_code?: string;
  package_length?: string;
  package_length_unit_code?: string;
  package_width?: string;
  package_width_unit_code?: string;
  package_height?: string;
  package_height_unit_code?: string;
  highlights_json?: string;
  specifications_json?: string;
  size_variants_json?: string;
  color_variants_json?: string;
  variant_combinations_json?: string;
  manufacturer_name?: string;
  manufacturer_country?: string;
  ingredients_json?: string;
  directions?: string;
  important_note?: string;
  is_cod_available?: string;
  ships_internationally?: string;
  special_day_offers_json?: string;
  quantity_offers_json?: string;
  condition_details_json?: string;
  return_policy_json?: string;
};

const BULK_MIN_PRODUCTS = 25;

const BULK_CSV_HEADERS = [
  'item_condition',
  'name',
  'category_slug',
  'sub_category_slug',
  'product_type_slug',
  'brand',
  'mrp',
  'price',
  'stock',
  'description',
  'short_description',
  'sku',
  'image_urls_json',
  'video_urls_json',
  'packing_type_name',
  'package_weight',
  'package_weight_unit_code',
  'package_length',
  'package_length_unit_code',
  'package_width',
  'package_width_unit_code',
  'package_height',
  'package_height_unit_code',
  'highlights_json',
  'specifications_json',
  'size_variants_json',
  'color_variants_json',
  'variant_combinations_json',
  'manufacturer_name',
  'manufacturer_country',
  'ingredients_json',
  'directions',
  'important_note',
  'is_cod_available',
  'ships_internationally',
  'special_day_offers_json',
  'quantity_offers_json',
  'condition_details_json',
  'return_policy_json',
] as const;

const safeParseJson = <T,>(value: string, fallback: T): T => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const parseBooleanValue = (value: string, fallback = false) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['true', '1', 'yes', 'y'].includes(normalized);
};

const parseCsvLines = (text: string): string[][] => {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  }

  return rows;
};

const parseBulkCsv = (text: string): { rows: BulkCsvRow[]; error: string | null } => {
  const matrix = parseCsvLines(text);
  if (matrix.length === 0) return { rows: [], error: 'CSV is empty.' };

  const headerRow = matrix[0].map((cell) => cell.toLowerCase().trim());
  const requiredHeaders = ['name', 'category_slug', 'mrp', 'price', 'stock'];
  const missingHeaders = requiredHeaders.filter((req) => !headerRow.includes(req));
  if (missingHeaders.length > 0) {
    return { rows: [], error: `Missing required columns: ${missingHeaders.join(', ')}` };
  }

  const rows: BulkCsvRow[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const dataRow = matrix[i];
    const rowObject: Record<string, string> = {};
    headerRow.forEach((header, colIndex) => {
      rowObject[header] = String(dataRow[colIndex] || '').trim();
    });

    if (!Object.values(rowObject).some(Boolean)) continue;

    rows.push({
      item_condition: rowObject.item_condition || 'brand_new',
      name: rowObject.name || '',
      category_slug: rowObject.category_slug || '',
      sub_category_slug: rowObject.sub_category_slug || '',
      product_type_slug: rowObject.product_type_slug || '',
      brand: rowObject.brand || '',
      mrp: rowObject.mrp || '',
      price: rowObject.price || '',
      stock: rowObject.stock || '',
      description: rowObject.description || '',
      short_description: rowObject.short_description || '',
      sku: rowObject.sku || '',
      image_urls_json: rowObject.image_urls_json || '',
      video_urls_json: rowObject.video_urls_json || '',
      packing_type_name: rowObject.packing_type_name || '',
      package_weight: rowObject.package_weight || '',
      package_weight_unit_code: rowObject.package_weight_unit_code || '',
      package_length: rowObject.package_length || '',
      package_length_unit_code: rowObject.package_length_unit_code || '',
      package_width: rowObject.package_width || '',
      package_width_unit_code: rowObject.package_width_unit_code || '',
      package_height: rowObject.package_height || '',
      package_height_unit_code: rowObject.package_height_unit_code || '',
      highlights_json: rowObject.highlights_json || '',
      specifications_json: rowObject.specifications_json || '',
      size_variants_json: rowObject.size_variants_json || '',
      color_variants_json: rowObject.color_variants_json || '',
      variant_combinations_json: rowObject.variant_combinations_json || '',
      manufacturer_name: rowObject.manufacturer_name || '',
      manufacturer_country: rowObject.manufacturer_country || '',
      ingredients_json: rowObject.ingredients_json || '',
      directions: rowObject.directions || '',
      important_note: rowObject.important_note || '',
      is_cod_available: rowObject.is_cod_available || '',
      ships_internationally: rowObject.ships_internationally || '',
      special_day_offers_json: rowObject.special_day_offers_json || '',
      quantity_offers_json: rowObject.quantity_offers_json || '',
      condition_details_json: rowObject.condition_details_json || '',
      return_policy_json: rowObject.return_policy_json || '',
    });
  }

  return { rows, error: null };
};

const SellerDashboard: React.FC<SellerDashboardProps> = ({ 
  sellerEmail, 
  sellerPhone = '', 
  sellerFullName = 'Seller', 
  sellerCountry: _sellerCountry = 'India',
  onNavigate, 
  verificationStatus,
  profileData,
}) => {
  const location = useLocation();
  const { user, currentAuthUser } = useAuth();
  const sellerId = user?.id || currentAuthUser?.userId || '';
  const { formatSellerAmount } = useSellerDisplayCurrency(sellerId);

  // Derive active section from URL hash (SellerLayout navigates via hash)
  const hash = location.hash.replace('#', '');
  const activeSection: DashboardSection =
    hash === 'profile' ? 'profile' :
    hash === 'settings' ? 'settings' :
    'overview';

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    business_name: '',
    email: '',
    phone: '',
    description: '',
  });
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  
  const [bankDetails, setBankDetails] = useState<{ bank_holder_name: string; account_number: string; ifsc_code: string; account_type: string } | null>(null);
  const [bankLoading, setBankLoading] = useState(false);

  const isPending = verificationStatus === 'pending';
  const isVerified = verificationStatus === 'verified';

  // Fetch orders for dashboard stats
  useEffect(() => {
    if (sellerId && isVerified) {
      fetchOrders();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, isVerified]);

  // Realtime: refresh orders when any order_items row for this seller changes
  useEffect(() => {
    if (!sellerId || !isVerified) return;
    const channel = supabase
      .channel(`seller-orders-${sellerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `seller_id=eq.${sellerId}` },
        () => { fetchOrders(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => { fetchOrders(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, isVerified]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await fetchOrdersBySeller(sellerId!, { limit: 50 });

      if (fetchError) {
        console.warn('Order fetch error (non-blocking):', fetchError);
      }

      // Always set orders from whatever data we got — empty array is valid for new sellers
      setOrders(
        (data || []).map((o: any) => ({
          ...o,
          status: o?.status === 'pending' ? 'new' : o?.status,
        }))
      );
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate dashboard statistics
  const calculateStats = () => {
    let totalPayouts = 0;
    let activeOrders = 0;
    let deliveredOrders = 0;
    const recentOrders: any[] = [];

    orders.forEach(order => {
      // Calculate payouts (delivered orders only)
      if (order.status === 'delivered') {
        totalPayouts += resolveSellerDashboardOrderTotal(order);
        deliveredOrders++;
      }
      
      // Count active orders
      if (['new', 'accepted', 'packed', 'in_transit', 'out_for_delivery', 'processing', 'shipped'].includes(order.status)) {
        activeOrders++;
      }
      
      // Collect recent orders (last 5)
      if (recentOrders.length < 5) {
        recentOrders.push(order);
      }
    });

    const totalOrders = orders.length;
    const conversionRate = totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(1) : '0';

    return {
      totalPayouts,
      activeOrders,
      totalOrders,
      conversionRate: parseFloat(conversionRate),
      recentOrders
    };
  };

  const stats = isVerified ? calculateStats() : {
    totalPayouts: 0,
    activeOrders: 0,
    totalOrders: 0,
    conversionRate: 0,
    recentOrders: []
  };

  useEffect(() => {
    if (activeSection === 'settings' && sellerId && !settingsLoaded) {
      void fetchSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, sellerId, settingsLoaded]);

  useEffect(() => {
    if (activeSection === 'profile' && sellerId && isVerified && !bankDetails) {
      setBankLoading(true);
      fetchSellerBankDetails(sellerId).then(({ data }) => {
        if (data) setBankDetails(data as any);
      }).finally(() => setBankLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, sellerId, isVerified]);

  const fetchSettings = async () => {
    try {
      setSettingsLoading(true);
      setSettingsError(null);

      const { data, error: profileError } = await fetchSellerProfile(sellerId);
      if (profileError || !data) {
        setSettingsError('Failed to load store settings. Please try again.');
        return;
      }

      setSettingsForm({
        business_name: data.full_name || sellerFullName || '',
        email: data.email || sellerEmail || '',
        phone: data.phone || sellerPhone || '',
        description: data.shop_description || '',
      });
      setSettingsLoaded(true);
    } catch {
      setSettingsError('Failed to load store settings. Please try again.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSettingsSave = async () => {
    if (!sellerId) return;

    if (!settingsForm.business_name.trim() || !settingsForm.email.trim()) {
      setSettingsError('Business name and email are required.');
      return;
    }

    try {
      setSettingsSaving(true);
      setSettingsError(null);
      setSettingsMessage(null);

      const { error: saveError } = await updateSellerProfile(sellerId, {
        full_name: settingsForm.business_name.trim(),
        email: settingsForm.email.trim(),
        phone: settingsForm.phone.trim(),
        shop_description: settingsForm.description.trim(),
      });

      if (saveError) {
        setSettingsError('Failed to save store settings. Please try again.');
        return;
      }

      setSettingsMessage('Store settings updated successfully.');
    } catch {
      setSettingsError('Failed to save store settings. Please try again.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleRouteNavigation = (view: string) => {
    onNavigate(view);
  };

  const downloadBulkTemplate = () => {
    const sampleCondition = JSON.stringify({
      usage_duration: '1_6_months',
      working_condition: 'works_perfectly',
      working_condition_notes: '',
      original_packaging: true,
      original_invoice: true,
      accessories_included: 'Charger',
      ownership_type: 'first_owner',
      has_scratches: false,
      scratch_description: '',
      scratch_images: [],
      refurbished_by: null,
      repair_details: '',
    });
    const sampleReturn = JSON.stringify({
      accepts_returns: true,
      return_window: '3_days',
      accepted_return_reasons: ['damaged', 'not_as_described'],
      return_shipping_by: 'seller',
      refund_type: 'full_refund',
      proof_requirement: 'photos',
      return_condition_agreed: true,
      seller_responsibility_agreed: true,
    });
    const sampleRow = [
      'brand_new',
      'Sample Product',
      'beauty-personal-care',
      '',
      '',
      'Sample Brand',
      '999',
      '799',
      '25',
      'Sample long description',
      'Sample short description',
      '',
      '"[]"',
      '"[]"',
      'Box',
      '0.5',
      'KG',
      '20',
      'CM',
      '10',
      'CM',
      '5',
      'CM',
      '"[""Highlight 1"",""Highlight 2""]"',
      '"{""Skin Type"":""All"",""Finish"":""Matte""}"',
      '"[]"',
      '"[]"',
      '"[]"',
      'Sample Manufacturer',
      'India',
      '"[""Ingredient 1"",""Ingredient 2""]"',
      'Apply evenly twice a day',
      'Store in a cool dry place',
      'true',
      'false',
      '"[]"',
      '"[]"',
      `"${sampleCondition.replace(/"/g, '""')}"`,
      `"${sampleReturn.replace(/"/g, '""')}"`,
    ];

    const csv = [
      BULK_CSV_HEADERS.join(','),
      sampleRow.join(','),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-product-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkFileUpload = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setBulkCsvText(text);
  };

  const handleBulkCreate = async () => {
    if (!sellerId) {
      setBulkError('Seller session not found. Please re-login.');
      return;
    }

    setBulkError(null);
    setBulkMessage(null);

    const { rows, error: parseError } = parseBulkCsv(bulkCsvText);
    if (parseError) {
      setBulkError(parseError);
      return;
    }

    if (rows.length < BULK_MIN_PRODUCTS) {
      setBulkError(`Minimum ${BULK_MIN_PRODUCTS} products required per bulk upload. You provided ${rows.length}.`);
      return;
    }

    setBulkLoading(true);
    try {
      const { data: categoryRows, error: categoryError } = await supabase
        .from('categories')
        .select('id, slug');
      if (categoryError) {
        setBulkError('Failed to load categories for bulk validation.');
        return;
      }

      const { data: packingTypeRows, error: packingError } = await supabase
        .from('packing_types')
        .select('id, name');
      if (packingError) {
        setBulkError('Failed to load packing types for bulk validation.');
        return;
      }

      const { data: unitRows, error: unitError } = await supabase
        .from('measurement_units')
        .select('id, code, name');
      if (unitError) {
        setBulkError('Failed to load measurement units for bulk validation.');
        return;
      }

      const { data: sellerKyc } = await supabase
        .from('seller_kyc')
        .select('business_name, business_country, country, business_street_address_1, business_street_address_2, business_city, business_state, business_postal_code')
        .eq('seller_id', sellerId)
        .maybeSingle();

      let sellerOriginCountryId = '';
      let sellerOriginCountryName = '';
      let sellerCurrency = 'INR';

      const sellerCountryName = String(sellerKyc?.business_country || sellerKyc?.country || '').trim();
      if (sellerCountryName) {
        const { data: sellerCountryRow } = await supabase
          .from('countries')
          .select('id, country_name, currency_code')
          .ilike('country_name', sellerCountryName)
          .maybeSingle();
        sellerOriginCountryId = String(sellerCountryRow?.id || '');
        sellerOriginCountryName = String(sellerCountryRow?.country_name || sellerCountryName);
        sellerCurrency = String(sellerCountryRow?.currency_code || 'INR');
      }

      const manufacturerAddress = [
        sellerKyc?.business_street_address_1,
        sellerKyc?.business_street_address_2,
        sellerKyc?.business_city,
        sellerKyc?.business_state,
        sellerKyc?.business_postal_code,
        sellerOriginCountryName,
      ].filter(Boolean).join(', ');

      const slugSet = new Set<string>();
      rows.forEach((row) => {
        if (row.category_slug) slugSet.add(row.category_slug.trim().toLowerCase());
        if (row.sub_category_slug) slugSet.add(row.sub_category_slug.trim().toLowerCase());
        if (row.product_type_slug) slugSet.add(row.product_type_slug.trim().toLowerCase());
      });

      const slugToId = new Map<string, string>();
      (categoryRows || []).forEach((row: any) => {
        slugToId.set(String(row.slug || '').toLowerCase(), String(row.id || ''));
      });

      const packingNameToId = new Map<string, string>();
      (packingTypeRows || []).forEach((row: any) => {
        packingNameToId.set(String(row.name || '').trim().toLowerCase(), String(row.id || ''));
      });

      const unitCodeToId = new Map<string, string>();
      (unitRows || []).forEach((row: any) => {
        const code = String(row.code || row.name || '').trim().toUpperCase();
        if (code) unitCodeToId.set(code, String(row.id || ''));
      });

      let successCount = 0;
      const failures: string[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNumber = index + 2;

        const name = String(row.name || '').trim();
        const itemCondition = String(row.item_condition || 'brand_new').trim() || 'brand_new';
        const categorySlug = String(row.category_slug || '').trim().toLowerCase();
        const categoryId = slugToId.get(categorySlug) || '';
        const subCategoryId = slugToId.get(String(row.sub_category_slug || '').trim().toLowerCase()) || null;
        const productTypeId = slugToId.get(String(row.product_type_slug || '').trim().toLowerCase()) || null;
        const imageUrls = safeParseJson<string[]>(row.image_urls_json || '', []).filter(Boolean);
        const videoUrls = safeParseJson<string[]>(row.video_urls_json || '', []).filter(Boolean);
        const highlights = safeParseJson<string[]>(row.highlights_json || '', []).filter(Boolean);
        const specifications = safeParseJson<Record<string, string>>(row.specifications_json || '', {});
        const sizeVariants = safeParseJson<Record<string, unknown>[]>(row.size_variants_json || '', []);
        const colorVariants = safeParseJson<Record<string, unknown>[]>(row.color_variants_json || '', []);
        const variantCombinations = safeParseJson<Record<string, unknown>[]>(row.variant_combinations_json || '', []);
        const specialDayOffers = safeParseJson<Record<string, unknown>[]>(row.special_day_offers_json || '', []);
        const quantityOffers = safeParseJson<Record<string, unknown>[]>(row.quantity_offers_json || '', []);
        const ingredients = safeParseJson<string[]>(row.ingredients_json || '', []).filter(Boolean);
        const conditionDetails = safeParseJson<Record<string, unknown>>(row.condition_details_json || '', {});
        const returnPolicy = safeParseJson<Record<string, unknown>>(row.return_policy_json || '', {});
        const packingTypeId = packingNameToId.get(String(row.packing_type_name || '').trim().toLowerCase()) || '';
        const packageWeightUnitId = unitCodeToId.get(String(row.package_weight_unit_code || '').trim().toUpperCase()) || '';
        const packageLengthUnitId = unitCodeToId.get(String(row.package_length_unit_code || '').trim().toUpperCase()) || '';
        const packageWidthUnitId = unitCodeToId.get(String(row.package_width_unit_code || '').trim().toUpperCase()) || '';
        const packageHeightUnitId = unitCodeToId.get(String(row.package_height_unit_code || '').trim().toUpperCase()) || '';

        const mrp = Number(row.mrp || 0);
        const price = Number(row.price || 0);
        const stock = Number(row.stock || 0);
        const packageWeight = Number(row.package_weight || 0);
        const packageLength = Number(row.package_length || 0);
        const packageWidth = Number(row.package_width || 0);
        const packageHeight = Number(row.package_height || 0);

        if (!name || !categorySlug || !categoryId || !Number.isFinite(mrp) || !Number.isFinite(price) || !Number.isFinite(stock)) {
          failures.push(`Row ${rowNumber}: missing/invalid required fields or unknown category slug.`);
          continue;
        }

        if (imageUrls.length > 10) {
          failures.push(`Row ${rowNumber}: image_urls_json cannot contain more than 10 image URLs.`);
          continue;
        }

        if (!packingTypeId || !packageWeightUnitId || !packageLengthUnitId || !packageWidthUnitId || !packageHeightUnitId || packageWeight <= 0 || packageLength <= 0 || packageWidth <= 0 || packageHeight <= 0) {
          failures.push(`Row ${rowNumber}: packing type and all package dimensions/units are required.`);
          continue;
        }

        if (price > mrp) {
          failures.push(`Row ${rowNumber}: selling price cannot exceed MRP.`);
          continue;
        }

        if (itemCondition !== 'brand_new') {
          if (!conditionDetails.usage_duration || !conditionDetails.working_condition || !conditionDetails.ownership_type) {
            failures.push(`Row ${rowNumber}: used/refurbished product requires condition_details_json with usage_duration, working_condition, and ownership_type.`);
            continue;
          }
          if (!returnPolicy.return_condition_agreed || !returnPolicy.seller_responsibility_agreed) {
            failures.push(`Row ${rowNumber}: used/refurbished product requires return_policy_json agreements.`);
            continue;
          }
        }

        const skuRaw = String(row.sku || '').trim().toUpperCase();
        let sku = skuRaw;
        if (!sku) {
          try {
            sku = await generateNextSku();
          } catch (skuErr) {
            failures.push(`Row ${rowNumber}: failed to allocate product SKU.${skuErr instanceof Error ? ` ${skuErr.message}` : ''}`);
            continue;
          }
        }
        const shortDescription = String(row.short_description || '').trim();
        const description = String(row.description || '').trim();

        const offerRules = [
          ...specialDayOffers.map((offer) => ({
            type: 'special_day',
            specialDayName: offer.specialDayName || offer.special_day_name || '',
            discountPercent: Number(offer.discountPercent || offer.discount_percent || 0),
            startTime: offer.startDate || offer.start_time || null,
            endTime: offer.endDate || offer.end_time || null,
            isActive: true,
          })),
          ...quantityOffers.map((offer) => ({
            type: offer.offerType || offer.offer_type || 'buy_x_get_y',
            buyQuantity: offer.buyQuantity || offer.buy_quantity || null,
            getQuantity: offer.getQuantity || offer.get_quantity || null,
            discountPercent: offer.discountPercent || offer.discount_percent || null,
            bundleMinQty: offer.bundleMinQty || offer.bundle_min_qty || null,
            bundleDiscount: offer.bundleDiscount || offer.bundle_discount || null,
            isActive: true,
          })),
        ];

        const payload = {
          seller_id: sellerId,
          name,
          category: categoryId,
          sub_category: subCategoryId,
          product_type: productTypeId,
          brand: String(row.brand || '').trim() || name,
          sku,
          mrp,
          price,
          stock,
          currency: sellerCurrency,
          origin_country: sellerOriginCountryName,
          origin_country_id: sellerOriginCountryId || null,
          short_description: shortDescription,
          description: description || shortDescription || name,
          image_url: imageUrls[0] || '',
          images: imageUrls,
          videos: videoUrls,
          highlights,
          specifications,
          package_weight: packageWeight,
          package_weight_unit_id: packageWeightUnitId,
          package_length: packageLength,
          package_length_unit_id: packageLengthUnitId,
          package_width: packageWidth,
          package_width_unit_id: packageWidthUnitId,
          package_height: packageHeight,
          package_height_unit_id: packageHeightUnitId,
          packing_type_id: packingTypeId,
          manufacturer_name: String(row.manufacturer_name || sellerKyc?.business_name || '').trim(),
          manufacturer_country: String(row.manufacturer_country || sellerOriginCountryName || '').trim(),
          manufacturer_address: manufacturerAddress,
          ingredients: ingredients.join('\n'),
          directions: String(row.directions || '').trim(),
          important_note: String(row.important_note || '').trim(),
          is_cod_available: parseBooleanValue(row.is_cod_available || '', true),
          shipping_type: 'shiprocket',
          courier_partner: 'shiprocket',
          approval_status: 'pending',
          is_active: false,
          item_condition: itemCondition,
          sizeVariants: sizeVariants,
          colorVariants: colorVariants,
          variantCombinations: variantCombinations,
          offerRules,
        };

        const { data: createdProduct, error: createError } = await createProduct(payload);
        if (createError) {
          failures.push(`Row ${rowNumber}: ${createError}`);
          continue;
        }

        const productId = String(createdProduct?.id || '');
        if (!productId) {
          failures.push(`Row ${rowNumber}: product created without ID.`);
          continue;
        }

        const { error: productPatchError } = await supabase
          .from('products')
          .update({
            product_type: productTypeId,
            hsn_code: null,
            manufacturer_address: manufacturerAddress,
            ships_internationally: parseBooleanValue(row.ships_internationally || '', false),
          })
          .eq('id', productId);

        if (productPatchError) {
          failures.push(`Row ${rowNumber}: ${productPatchError.message}`);
          continue;
        }

        if (itemCondition !== 'brand_new') {
          const { error: conditionError } = await saveConditionDetails(productId, conditionDetails);
          if (conditionError) {
            failures.push(`Row ${rowNumber}: ${conditionError}`);
            continue;
          }

          const { error: returnError } = await saveReturnPolicy(productId, returnPolicy);
          if (returnError) {
            failures.push(`Row ${rowNumber}: ${returnError}`);
            continue;
          }
        }

        successCount += 1;
      }

      const failurePreview = failures.slice(0, 5).join(' | ');
      setBulkMessage(`Bulk listing completed. Created ${successCount}/${rows.length} products.${failures.length ? ` Failed ${failures.length}. ${failurePreview}` : ''}`);

      if (successCount > 0) {
        setBulkCsvText('');
      }
    } catch {
      setBulkError('Bulk upload failed unexpectedly. Please retry.');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <>
        {activeSection === 'overview' && renderOverview(verificationStatus, onNavigate, () => handleRouteNavigation('seller-verify'), stats, loading, error, fetchOrders, formatSellerAmount, handleRouteNavigation, orders)}
        
        {activeSection === 'profile' && (() => {
          const displayName = profileData.name || sellerFullName;
          const displayEmail = profileData.email || sellerEmail;
          const displayPhone = profileData.mobile || sellerPhone || '—';
          const displayBrand = isVerified ? (profileData.brandName || '—') : 'Available after verification';
          const displayBusinessType = isVerified ? (profileData.businessType || '—') : 'Available after verification';
          const displayBusinessAddress = isVerified ? (profileData.businessAddress || '—') : 'Available after verification';
          const displayCountry = isVerified ? (profileData.country || _sellerCountry || '—') : 'Available after verification';
          const profileInitial = displayName.trim().charAt(0).toUpperCase() || 'S';

          return (
          <div className="space-y-4 sm:space-y-5">
            {/* Profile hero */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="h-16 sm:h-20 bg-gradient-to-r from-blue-600 to-blue-500" />
              <div className="px-4 sm:px-6 pb-5 sm:pb-6 -mt-10 sm:-mt-12">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="relative flex-shrink-0 mx-auto sm:mx-0">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 border-4 border-white shadow-md flex items-center justify-center text-white text-2xl sm:text-3xl font-bold">
                      {profileInitial}
                    </div>
                    {isVerified && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                        <ShieldCheck size={14} className="text-white" />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-center sm:text-left pt-1">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{displayName}</h2>
                    <p className="text-sm text-gray-500 truncate mt-0.5">{displayEmail}</p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                      {isVerified && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 text-green-700 rounded-full text-xs font-semibold">
                          <ShieldCheck size={13} /> Verified Seller
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-semibold">
                          <Clock size={13} /> Under Review
                        </span>
                      )}
                      {verificationStatus === 'unverified' && (
                        <button
                          onClick={() => handleRouteNavigation('seller-verify')}
                          className="px-4 py-1.5 bg-gray-900 text-white rounded-full text-xs font-semibold hover:bg-gray-800 transition-colors"
                        >
                          Verify Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick info chips */}
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                  {displayPhone !== '—' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-700">
                      <Phone size={12} className="text-blue-600" /> {displayPhone}
                    </span>
                  )}
                  {isVerified && displayCountry !== '—' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-700">
                      <Globe size={12} className="text-blue-600" /> {displayCountry}
                    </span>
                  )}
                  {isVerified && displayBusinessType !== '—' && displayBusinessType !== 'Available after verification' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-700">
                      <Building2 size={12} className="text-amber-600" /> {displayBusinessType}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
              <div className="lg:col-span-2 space-y-4 sm:space-y-5">
                {/* Personal Information */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                      <User size={16} />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Personal Information</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <ProfileDetailRow label="Full Name" value={displayName} />
                    <ProfileDetailRow label="Email Address" value={displayEmail} />
                    <ProfileDetailRow label="Phone Number" value={displayPhone} />
                  </div>
                </div>

                {/* Business Information */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Business Information</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <ProfileDetailRow label="Brand Name" value={displayBrand} />
                    <ProfileDetailRow label="Business Type" value={displayBusinessType} />
                    <ProfileDetailRow label="Business Address" value={displayBusinessAddress} multiline />
                    <ProfileDetailRow label="Country" value={displayCountry} />
                  </div>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-5">
                {/* Verification status card (desktop sidebar) */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Verification Status</h3>
                      <p className="text-xs text-gray-500">Business identity verification</p>
                    </div>
                  </div>
                  {isVerified && (
                    <div className="rounded-xl bg-green-50 border border-green-100 p-4 text-center">
                      <ShieldCheck size={28} className="text-green-600 mx-auto mb-2" />
                      <p className="text-sm font-bold text-green-800">Verified</p>
                      <p className="text-xs text-green-700 mt-1">Your business identity is confirmed.</p>
                    </div>
                  )}
                  {isPending && (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
                      <Clock size={28} className="text-amber-600 mx-auto mb-2" />
                      <p className="text-sm font-bold text-amber-800">Under Review</p>
                      <p className="text-xs text-amber-700 mt-1">We are reviewing your KYC submission.</p>
                    </div>
                  )}
                  {verificationStatus === 'unverified' && (
                    <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-center">
                      <AlertTriangle size={28} className="text-gray-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-gray-800">Not Verified</p>
                      <p className="text-xs text-gray-600 mt-1 mb-3">Complete verification to unlock all seller features.</p>
                      <button
                        onClick={() => handleRouteNavigation('seller-verify')}
                        className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
                      >
                        Start KYC
                      </button>
                    </div>
                  )}
                </div>

                {/* Bank Account */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                      <CreditCard size={16} />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Bank Account</h3>
                  </div>
                  {bankLoading ? (
                    <FormSkeleton fields={4} withSubmit={false} />
                  ) : bankDetails?.account_number ? (
                    <>
                      <div className="divide-y divide-gray-100">
                        <ProfileDetailRow label="Account Holder" value={bankDetails.bank_holder_name || '—'} />
                        <ProfileDetailRow label="Account Number" value={`••••••${bankDetails.account_number.slice(-4)}`} />
                        <ProfileDetailRow label="IFSC / Routing Code" value={bankDetails.ifsc_code || '—'} />
                        <ProfileDetailRow label="Account Type" value={bankDetails.account_type ? bankDetails.account_type.charAt(0).toUpperCase() + bankDetails.account_type.slice(1) : '—'} />
                      </div>
                      <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 mt-4 pt-3 border-t border-gray-100">
                        <Lock size={12} /> Secured & encrypted
                      </p>
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <CreditCard size={32} className="text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 mb-3">{isVerified ? 'No bank account on file.' : 'Complete KYC verification to add bank details.'}</p>
                      {!isVerified && (
                        <button
                          onClick={() => handleRouteNavigation('seller-verify')}
                          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
                        >
                          Start KYC
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {activeSection === 'settings' && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Store Settings</h3>
              <p className="text-sm text-gray-500 mt-0.5">Manage your store information</p>
            </div>

            <div className="p-5 sm:p-6">
              {settingsError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {settingsError}
                </div>
              )}

              {settingsMessage && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-600">
                  {settingsMessage}
                </div>
              )}

              {settingsLoading ? (
                <FormSkeleton fields={5} />
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Business Name</label>
                      <input
                        type="text"
                        value={settingsForm.business_name}
                        onChange={(e) => setSettingsForm((prev) => ({ ...prev, business_name: e.target.value }))}
                        disabled={settingsSaving}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Email Address</label>
                      <input
                        type="email"
                        value={settingsForm.email}
                        onChange={(e) => setSettingsForm((prev) => ({ ...prev, email: e.target.value }))}
                        disabled={settingsSaving}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone Number</label>
                      <input
                        type="text"
                        value={settingsForm.phone}
                        onChange={(e) => setSettingsForm((prev) => ({ ...prev, phone: e.target.value }))}
                        disabled={settingsSaving}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Store Description</label>
                      <input
                        type="text"
                        value={settingsForm.description}
                        onChange={(e) => setSettingsForm((prev) => ({ ...prev, description: e.target.value }))}
                        disabled={settingsSaving}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={fetchSettings}
                      disabled={settingsSaving}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 mt-3 sm:mt-3"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleSettingsSave}
                      disabled={settingsSaving || settingsLoading}
                      className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2 mt-3 sm:mt-3"
                    >
                      {settingsSaving ? <Loader2 className="animate-spin" size={14} /> : null}
                      {settingsSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  <div id="bulk-listing" className="mt-6 pt-5 border-t border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Bulk Product Listing</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Upload products in bulk from CSV. Minimum {BULK_MIN_PRODUCTS} products required per upload.</p>
                        <p className="text-[11px] text-gray-500 mt-1">Template covers basic info, media URLs, package details, variants, offers, shipping flag, and used or refurbished condition plus return policy fields. In bulk mode, product images are optional and can be added later via Edit Product. Origin country, currency, HSN, and manufacturer address are derived from your seller account data.</p>
                      </div>
                      <button
                        type="button"
                        onClick={downloadBulkTemplate}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Download size={13} /> Download Template
                      </button>
                    </div>

                    <div className="mb-3 flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <Upload size={13} /> Upload CSV
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            void handleBulkFileUpload(file);
                            e.currentTarget.value = '';
                          }}
                          disabled={bulkLoading}
                        />
                      </label>
                      <span className="text-[11px] text-gray-500">Required per row: name, category_slug, mrp, price, stock, packing_type_name, package dimensions, and unit codes. image_urls_json is optional in bulk mode. JSON columns accept arrays or objects exactly as shown in the template.</span>
                    </div>

                    <textarea
                      value={bulkCsvText}
                      onChange={(e) => setBulkCsvText(e.target.value)}
                      placeholder="Paste CSV content here..."
                      rows={8}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      disabled={bulkLoading}
                    />

                    {bulkError && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                        {bulkError}
                      </div>
                    )}

                    {bulkMessage && (
                      <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                        {bulkMessage}
                      </div>
                    )}

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleBulkCreate()}
                        disabled={bulkLoading || settingsSaving}
                        className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
                      >
                        {bulkLoading ? <Loader2 className="animate-spin" size={14} /> : null}
                        {bulkLoading ? 'Creating Bulk Products...' : `Create ${BULK_MIN_PRODUCTS}+ Products`}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
    </>
  );
};

/**
 * Build daily sales totals from orders for the chart.
 * Returns an array of { label, total } for the last N days.
 */
const SALES_EXCLUDED_STATUSES = new Set([
  'cancelled', 'canceled', 'refunded', 'returned', 'failed', 'rejected', 'declined',
]);

const buildDailySales = (orders: any[], days: number): { label: string; total: number }[] => {
  const buckets: Record<string, number> = {};
  const labels: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    buckets[key] = 0;
    labels.push(key);
  }
  orders.forEach((o: any) => {
    if (!o.created_at) return;
    // Exclude cancelled/refunded/failed orders from realised sales
    const rawStatus = String(o?.status ?? '').toLowerCase().trim();
    if (SALES_EXCLUDED_STATUSES.has(rawStatus)) return;
    const key = new Date(o.created_at).toISOString().slice(0, 10);
    if (key in buckets) {
      buckets[key] += resolveSellerDashboardOrderTotal(o);
    }
  });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels.map(key => ({
    label: dayNames[new Date(key + 'T00:00:00').getDay()],
    total: buckets[key],
  }));
};

const resolveSellerDashboardOrderTotal = (order: any): number => {
  if (order?.seller_total_amount != null) {
    return Number(order.seller_total_amount || 0);
  }
  return sumSellerOrderTotal((order?.order_items || order?.items || []) as Array<Record<string, any>>);
};

const renderOverview = (
  status: 'unverified' | 'pending' | 'verified',
  _onNavigate: (v: any) => void,
  onVerificationClick?: () => void,
  stats?: any,
  loading?: boolean,
  error?: string | null,
  onRetry?: () => void,
  formatPrice?: (value: number, currencyCode?: string) => string,
  handleRouteNavigation?: (view: string) => void,
  allOrders?: any[]
) => (
  <div className="space-y-3">
    {/* Verification banners — compact */}
    {status === 'unverified' && (
      <div className="rounded-xl bg-gradient-to-r from-amber-50 to-amber-100/60 border border-amber-200 px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
          <AlertTriangle size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-gray-900 leading-tight">Verification Required</p>
          <p className="text-[10px] text-gray-600 leading-snug">Complete KYC to start selling.</p>
        </div>
        <button
          onClick={onVerificationClick}
          className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[11px] font-semibold hover:bg-gray-800 transition-colors shrink-0"
        >
          Verify
        </button>
      </div>
    )}

    {status === 'pending' && (
      <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-100/60 border border-blue-200 px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0">
          <Clock size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-gray-900 leading-tight">Review In Progress</p>
          <p className="text-[10px] text-gray-600 leading-snug">Documents under review (48–72h).</p>
        </div>
        <span className="px-2 py-1 bg-blue-500 text-white rounded-md text-[10px] font-bold uppercase tracking-wide shrink-0">Pending</span>
      </div>
    )}

    {status === 'verified' && (
      <div className="rounded-lg bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 px-3 py-1.5 flex items-center gap-2">
        <ShieldCheck size={13} className="text-emerald-600" />
        <span className="text-[11px] font-semibold text-emerald-700">KYC Verified · Account Active</span>
      </div>
    )}

    {error && status === 'verified' && (
      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] text-red-600 font-medium">{error}</span>
        <button onClick={onRetry} className="text-[11px] text-red-700 font-bold underline">Retry</button>
      </div>
    )}

    {/* Colorful gradient stat cards — compact 2×2 mobile / 4-col desktop */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
      {[
        {
          label: 'Total Payouts',
          value: formatPrice?.(status === 'verified' ? (stats?.totalPayouts || 0) : 0) || '0',
          icon: <Wallet size={14} />,
          gradient: 'from-emerald-500 to-teal-600',
          ring: 'ring-emerald-200',
        },
        {
          label: 'Active Orders',
          value: String(status === 'verified' ? (stats?.activeOrders || 0) : 0),
          icon: <Package size={14} />,
          gradient: 'from-sky-500 to-blue-600',
          ring: 'ring-sky-200',
        },
        {
          label: 'Total Orders',
          value: String(status === 'verified' ? (stats?.totalOrders || 0) : 0),
          icon: <ShoppingBag size={14} />,
          gradient: 'from-fuchsia-500 to-purple-600',
          ring: 'ring-fuchsia-200',
        },
        {
          label: 'Conversion',
          value: `${status === 'verified' ? (stats?.conversionRate || 0) : 0}%`,
          icon: <BarChart2 size={14} />,
          gradient: 'from-amber-400 via-pink-500 to-rose-600',
          ring: 'ring-pink-200',
          // Inline fallback so the card always renders colorfully even if
          // Tailwind JIT misses the tri-stop gradient classes in some build.
          inlineBg: 'linear-gradient(135deg, #fbbf24 0%, #ec4899 55%, #e11d48 100%)',
        },
      ].map((card) => (
        <div
          key={card.label}
          className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${card.gradient} p-2.5 shadow-sm ring-1 ${card.ring} text-white`}
          style={card.inlineBg ? { backgroundImage: card.inlineBg } : undefined}
        >
          {/* decorative blob */}
          <div className="absolute -top-4 -right-4 w-14 h-14 bg-white/10 rounded-full" aria-hidden="true" />
          <div className="relative flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/85">{card.label}</span>
            <div className="w-6 h-6 rounded-md bg-white/20 backdrop-blur-sm flex items-center justify-center">
              {card.icon}
            </div>
          </div>
          <p className="relative mt-1.5 text-[18px] sm:text-xl font-extrabold leading-none">
            {loading && status === 'verified'
              ? <Skeleton rounded="sm" className="h-5 w-12 inline-block bg-white/40 align-middle" />
              : card.value}
          </p>
        </div>
      ))}
    </div>

    {/* Quick Actions — tight chip row */}
    <div>
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Quick Actions</h3>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {[
          { label: 'Products', icon: <ShoppingBag size={14} />, view: 'seller-product-listing', from: 'from-blue-500', to: 'to-cyan-500' },
          { label: 'Orders', icon: <Package size={14} />, view: 'seller-orders', from: 'from-emerald-500', to: 'to-green-500' },
          { label: 'Wallet', icon: <Wallet size={14} />, view: 'seller-wallet', from: 'from-purple-500', to: 'to-fuchsia-500' },
          { label: 'Warehouse', icon: <MapPin size={14} />, view: 'seller-warehouse', from: 'from-amber-500', to: 'to-orange-500' },
        ].map((action) => (
          <button
            key={action.view}
            onClick={() => handleRouteNavigation?.(action.view)}
            disabled={status !== 'verified'}
            className="group bg-white border border-gray-200 rounded-xl px-1.5 py-2 flex flex-col items-center gap-1 hover:border-gray-300 hover:shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${action.from} ${action.to} text-white flex items-center justify-center shadow-sm`}>
              {action.icon}
            </div>
            <span className="text-[10px] font-semibold text-gray-700 leading-none">{action.label}</span>
          </button>
        ))}
      </div>
    </div>

    {/* Sales Chart + Recent Orders */}
    <div className="grid lg:grid-cols-5 gap-3">
      {/* Sales Overview — smooth SVG area chart */}
      <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-[12px] font-bold text-gray-900 leading-tight">Sales Overview</h3>
            <p className="text-[10px] text-gray-500 leading-tight">
              {(() => {
                const end = new Date();
                const start = new Date();
                start.setDate(end.getDate() - 6);
                const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                return `Last 7 days · ${fmt(start)} – ${fmt(end)}`;
              })()}
            </p>
          </div>
          <span className="text-[10px] bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-md px-2 py-0.5 font-bold tracking-wide">
            7D
          </span>
        </div>
        {loading ? (
          <Skeleton rounded="lg" className="h-28 w-full" />
        ) : status === 'verified' && allOrders && allOrders.length > 0 ? (() => {
          const dailySales = buildDailySales(allOrders, 7);
          const maxVal = Math.max(...dailySales.map(d => d.total), 1);
          const total7d = dailySales.reduce((s, d) => s + d.total, 0);
          // Build smooth area + line path
          const W = 100;
          const H = 100;
          const stepX = W / Math.max(dailySales.length - 1, 1);
          const points = dailySales.map((d, i) => ({
            x: i * stepX,
            y: H - (d.total / maxVal) * (H - 10),
          }));
          const linePath = points
            .map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`))
            .join(' ');
          const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
          return (
            <>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-base font-extrabold text-gray-900 leading-tight">
                  {formatPrice?.(total7d, 'INR') ?? total7d}
                </p>
                <span className="text-[10px] font-semibold text-emerald-600">Σ 7d</span>
              </div>
              <div className="relative">
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  preserveAspectRatio="none"
                  className="w-full h-24"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath} fill="url(#salesArea)" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {points.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r="1.6"
                      fill="#fff"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-gray-400 font-medium">
                {dailySales.map((day, i) => (
                  <span key={i}>{day.label}</span>
                ))}
              </div>
            </>
          );
        })() : (
          <div className="flex flex-col items-center justify-center min-h-[140px] text-center px-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-blue-100 rounded-lg flex items-center justify-center mb-2">
              <BarChart2 size={16} className="text-indigo-500" />
            </div>
            <h4 className="text-[12px] font-semibold text-gray-900">No sales yet</h4>
            <p className="text-[10px] text-gray-500 max-w-xs leading-snug mt-0.5">
              Trends will appear once orders start coming in.
            </p>
          </div>
        )}
      </div>

      {/* Recent Orders */}
      <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl flex flex-col">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[12px] font-bold text-gray-900">Recent Orders</h3>
          <button
            disabled={status !== 'verified'}
            onClick={() => handleRouteNavigation?.('seller-orders')}
            className="text-[10px] text-blue-600 font-bold hover:underline disabled:opacity-40"
          >
            View All →
          </button>
        </div>
        <div className="flex-1 px-2 py-2">
          {loading && status === 'verified' ? (
            <ListSkeleton rows={4} withAvatar={false} />
          ) : status === 'verified' && stats?.recentOrders && stats.recentOrders.length > 0 ? (
            <div className="space-y-1.5">
              {stats.recentOrders.map((order: any) => (
                <RecentOrder
                  key={order.id}
                  orderId={order.order_number}
                  amount={formatPrice?.(resolveSellerDashboardOrderTotal(order), 'INR') || 'INR 0'}
                  time={new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  status={order.status}
                  buyerName={order.shipping_address?.full_name || order.buyer_name || ''}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Package size={18} className="mb-1" />
              <span className="text-[11px] font-medium">No orders yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);

const ProfileDetailRow = ({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 py-3 first:pt-0 last:pb-0">
    <span className="text-xs font-medium text-gray-500 shrink-0 sm:min-w-[8rem]">{label}</span>
    <span className={`text-sm font-semibold text-gray-900 sm:text-right ${multiline ? 'sm:max-w-[65%] break-words' : 'truncate sm:max-w-[65%]'}`}>
      {value}
    </span>
  </div>
);

const RecentOrder = ({ orderId, amount, time, status, buyerName }: { orderId: string, amount: string, time: string, status: string, buyerName?: string }) => {
  const statusColors: Record<string, { bg: string; text: string; iconBg: string; iconColor: string }> = {
    new: { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
    accepted: { bg: 'bg-amber-50', text: 'text-amber-600', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
    packed: { bg: 'bg-cyan-50', text: 'text-cyan-600', iconBg: 'bg-cyan-100', iconColor: 'text-cyan-600' },
    in_transit: { bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100', iconColor: 'text-green-600' },
    shipped: { bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100', iconColor: 'text-green-600' },
    delivered: { bg: 'bg-emerald-50', text: 'text-emerald-600', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    cancelled: { bg: 'bg-red-50', text: 'text-red-600', iconBg: 'bg-red-100', iconColor: 'text-red-600' },
    returned: { bg: 'bg-orange-50', text: 'text-orange-600', iconBg: 'bg-orange-100', iconColor: 'text-orange-600' },
  };
  const colors = statusColors[status] || statusColors.new;
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 ${colors.iconBg} rounded-lg flex items-center justify-center`}>
          <Package size={12} className={colors.iconColor} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-900">#{orderId}</p>
          <p className="text-[10px] text-gray-500">{time}{buyerName ? ` · ${buyerName}` : ''}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold text-gray-900">{amount}</p>
        <span className={`text-[9px] font-bold ${colors.text} ${colors.bg} px-1.5 py-0.5 rounded uppercase`}>{getStatusLabel(status)}</span>
      </div>
    </div>
  );
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    'new': 'New',
    'accepted': 'Accepted',
    'packed': 'Packed',
    'in_transit': 'In Transit',
    'out_for_delivery': 'Out for Delivery',
    'processing': 'Processing',
    'shipped': 'Shipped',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled',
    'returned': 'Returned'
  };
  return labels[status] || status;
};

export default SellerDashboard;
