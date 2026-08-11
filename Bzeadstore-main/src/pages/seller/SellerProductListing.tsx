import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  fetchProducts as fetchProductsFromDB,
  createProduct,
  upsertProductDraftBasic,
  saveProductDraftDetails,
  uploadProductImage,
  uploadProductVideo,
  deleteProduct,
  updateProduct,
  updateProductOfferRules,
  generateNextSku,
  saveConditionDetails,
  saveReturnPolicy,
  fetchConditionDetails,
  fetchReturnPolicy,
} from '../../lib/productService';
import {
  Package,
  Plus,
  CheckCircle2,
  Search, Loader2, AlertCircle, X, Save, Pencil, Video,
  ChevronLeft, ChevronRight, Filter, MapPin, MoreVertical, Upload,
} from 'lucide-react';
import BasicInfoPriceStep from './steps/BasicInfoPriceStep';
import type { BasicInfoPriceData } from './steps/BasicInfoPriceStep';
import MediaStep from './steps/MediaStep';
import type { MediaData } from './steps/MediaStep';
import DomesticShippingStep from './steps/DomesticShippingStep';
import type { DomesticShippingData } from './steps/DomesticShippingStep';
import ProductDetailsStep from './steps/ProductDetailsStep';
import type { ProductDetailsData } from './steps/ProductDetailsStep';
import OffersStep from './steps/OffersStep';
import type { OffersData } from './steps/OffersStep';
import ConditionDetailsStep from './steps/ConditionDetailsStep';
import type { ConditionDetailsData } from './steps/ConditionDetailsStep';
import ReturnPolicyStep from './steps/ReturnPolicyStep';
import type { ReturnPolicyData } from './steps/ReturnPolicyStep';
import type { UploadProgress } from './steps/MediaStep';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../../components/common/ToastContainer';
import { fetchCountries } from '../../lib/shippingDataService';
import type { Country } from '../../lib/shippingDataService';
import { useSellerDisplayCurrency } from '../../hooks/useSellerDisplayCurrency';
import type { SellerNotificationNavState } from '../../lib/sellerNotificationNavigation';


import type { ItemCondition } from '../../types';


const WIZARD_STEPS_BRAND_NEW = ['Basic Info & Price', 'Media', 'Product Details', 'Shipping', 'Offers & Discounts'] as const;
const WIZARD_STEPS_USED = ['Basic Info & Price', 'Media', 'Product Details', 'Condition Details', 'Return & Refund Policy', 'Shipping', 'Offers & Discounts'] as const;

function getWizardSteps(condition: ItemCondition): readonly string[] {
  return condition === 'brand_new' ? WIZARD_STEPS_BRAND_NEW : WIZARD_STEPS_USED;
}

interface SellerProduct {
  id: string;
  publicId: string;
  name: string;
  category: string;
  categoryName: string;
  price: number;
  currency: string;
  stockCount: number;
  stockMin: number;
  stockMax: number;
  variantCount: number;
  hasVariants: boolean;
  hasLowStock: boolean;
  inStock: boolean;
  isActive: boolean;
  approvalStatus: string;
  isDraft: boolean;
  resumeStep: 'basic' | 'media' | 'details' | 'domestic' | 'offers';
  image: string;
  package_weight?: number | null;
  sku: string;
}

interface SellerProductListingProps {
  onNavigate: (view: any) => void;
}

// Module-level cache keyed by seller id. Survives component unmounts so that
// switching tabs and coming back renders instantly instead of showing a loader.
const sellerProductsCache: Record<string, SellerProduct[]> = {};

type VariantStockAgg = {
  min: number;
  max: number;
  count: number;
  anyInStock: boolean;
  hasLowStock: boolean;
};

const aggregateVariantStocks = (stocks: number[]): VariantStockAgg | null => {
  if (!stocks.length) return null;
  let min = stocks[0];
  let max = stocks[0];
  let anyInStock = false;
  let hasLowStock = false;
  for (const raw of stocks) {
    const s = Number(raw) || 0;
    min = Math.min(min, s);
    max = Math.max(max, s);
    if (s > 0) anyInStock = true;
    if (s > 0 && s < 10) hasLowStock = true;
  }
  return { min, max, count: stocks.length, anyInStock, hasLowStock };
};

const buildSellerStockFields = (productStock: number, variantStocks: number[]) => {
  const agg = aggregateVariantStocks(variantStocks);
  if (agg) {
    return {
      hasVariants: true,
      variantCount: agg.count,
      stockCount: agg.min,
      stockMin: agg.min,
      stockMax: agg.max,
      inStock: agg.anyInStock,
      hasLowStock: agg.hasLowStock,
    };
  }
  const s = Number(productStock) || 0;
  return {
    hasVariants: false,
    variantCount: 0,
    stockCount: s,
    stockMin: s,
    stockMax: s,
    inStock: s > 0,
    hasLowStock: s > 0 && s < 10,
  };
};

const formatSellerStockLabel = (product: SellerProduct): string => {
  if (!product.inStock) return 'Out of stock';
  if (product.hasVariants && product.variantCount > 1) {
    if (product.stockMin !== product.stockMax) {
      return `${product.stockMin}–${product.stockMax} / variant (${product.variantCount})`;
    }
    return `${product.stockCount} / variant (${product.variantCount})`;
  }
  return String(product.stockCount);
};

const DEFAULT_DOMESTIC_SHIPPING: DomesticShippingData = {
  courierTypeId: '',
  shippingChargeTypeId: '',
  shippingChargeTypeName: '',
  flatShippingCharge: '',
  flatDeliveryDays: '',
  stateCharges: [],
  shipsInternationally: false,
};

const resolveShippingStrategy = (_shipping: DomesticShippingData) => {
  // All shipping is via Shiprocket
  return { shippingType: 'shiprocket', courierPartner: 'shiprocket' };
};

const rollbackCreatedProduct = async (productId: string, reason: string) => {
  const rollbackResult = await deleteProduct(productId);
  if (!rollbackResult.success) {
    return `${reason} Rollback also failed (${rollbackResult.error || 'unknown error'}). Manual cleanup required for product ${productId}.`;
  }

  return `${reason} Product creation was rolled back.`;
};

const parseIngredients = (raw: unknown): string[] => {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split(/\r?\n|,/) 
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
};

const serializeIngredients = (items: string[]): string => {
  return items.map((item) => item.trim()).filter(Boolean).slice(0, 50).join('\n');
};

const SellerProductListing: React.FC<SellerProductListingProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { step } = useParams<{ step?: string }>();
  const { user } = useAuth();
  const sellerId = user?.id || '';
  const { formatSellerAmount } = useSellerDisplayCurrency(sellerId);
  const toast = useToast();
  const [searchDraft, setSearchDraft] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageLoading, setPageLoading] = useState(false);
  const PRODUCTS_PER_PAGE = 15;
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [productTab, setProductTab] = useState<'active' | 'pending' | 'draft' | 'rejected'>('active');
  const [products, setProducts] = useState<SellerProduct[]>(() => {
    const uid = user?.id || '';
    return uid && sellerProductsCache[uid] ? sellerProductsCache[uid] : [];
  });
  const [loading, setLoading] = useState(() => {
    const uid = user?.id || '';
    return !(uid && sellerProductsCache[uid]);
  });
  // Bumped after a wizard submit to force the load effect to refetch
  // from the DB instead of serving stale cached/optimistic state.
  const [reloadProductsKey, setReloadProductsKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss the create/draft feedback banner after 6 seconds.
  useEffect(() => {
    if (!createFeedback) return;
    const timer = window.setTimeout(() => setCreateFeedback(null), 6000);
    return () => window.clearTimeout(timer);
  }, [createFeedback]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productToDelete, setProductToDelete] = useState<SellerProduct | null>(null);
  const [showOutOfStockDialog, setShowOutOfStockDialog] = useState(false);
  const [productToMarkOutOfStock, setProductToMarkOutOfStock] = useState<SellerProduct | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<SellerProduct | null>(null);
  const [actionLoadingByProduct, setActionLoadingByProduct] = useState<Record<string, 'delete' | 'out_of_stock' | 'update' | null>>({});
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
  const [inventoryModal, setInventoryModal] = useState<'low' | 'out' | null>(null);
  const [highlightProductId, setHighlightProductId] = useState<string | null>(null);
  const pendingNotificationNav = useRef<SellerNotificationNavState | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    shortDescription: '',
    description: '',
    mrp: '',
    price: '',
    stock: '',
    sku: '',
    manufacturer_name: '',
    manufacturer_address: '',
    images: [] as File[],
    imageUrls: [] as string[],
    existingImages: [] as string[],
    videos: [] as File[],
    videoUrls: [] as string[],
    existingVideos: [] as string[],
  });
  const [editImageInputRef] = useState<React.RefObject<HTMLInputElement | null>>(() => React.createRef());
  const [editVideoInputRef] = useState<React.RefObject<HTMLInputElement | null>>(() => React.createRef());
  const [editOriginCountryId, setEditOriginCountryId] = useState('');
  const [editDomesticShipping, setEditDomesticShipping] = useState<DomesticShippingData>(DEFAULT_DOMESTIC_SHIPPING);
  const [editOffersData, setEditOffersData] = useState<OffersData>({ specialDayOffers: [], quantityOffers: [], ingredients: [], directions: '', manufacturer_name: '', manufacturer_country: '', important_note: '' });
  const [editProductDetails, setEditProductDetails] = useState<ProductDetailsData>({
    sizeVariants: [], colorVariants: [], variantCombinations: [], highlights: [], specifications: [],
    packingTypeId: '',
    packageWeight: '', packageWeightUnitId: '',
    packageLength: '', packageLengthUnitId: '',
    packageWidth: '', packageWidthUnitId: '',
    packageHeight: '', packageHeightUnitId: '',
  });
  const [editCategorySlugs, setEditCategorySlugs] = useState({ categorySlug: '', subCategorySlug: '', productTypeSlug: '' });
  const [editCategoryNames, setEditCategoryNames] = useState({ categoryName: '', subCategoryName: '', productTypeName: '' });
  const [editExtras, setEditExtras] = useState({ brand: '', hsn: '' });
  const [showEditSaveConfirm, setShowEditSaveConfirm] = useState(false);
  const [isPriceEditing, setIsPriceEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [allCountries, setAllCountries] = useState<Country[]>([]);
  const [sellerLockedOrigin, setSellerLockedOrigin] = useState<{ countryId: string; currencyCode: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [hydratedDraftId, setHydratedDraftId] = useState('');

  const currentDraftId = new URLSearchParams(location.search).get('draft') || '';
  const isCreateFlow = location.pathname.includes('/seller/products/new/');
  
  // Wizard step data
  const [basicInfo, setBasicInfo] = useState<BasicInfoPriceData>({
    itemCondition: 'brand_new',
    name: '', categoryId: '', categoryName: '', categorySlug: '',
    subCategoryId: '', subCategoryName: '', subCategorySlug: '',
    productTypeId: '', productTypeName: '', productTypeSlug: '',
    hsnCode: '',
    brand_name: '', manufacturer_address: '',
    shortDescription: '', description: '',
    originCountryId: '', originCountryCurrency: '',
    mrp: '', price: '', stock: '', isCodAvailable: true, sku: '',
  });
  const [mediaData, setMediaData] = useState<MediaData>({
    images: [], imageUrls: [], videos: [], videoUrls: [],
  });
  const [productDetails, setProductDetails] = useState<ProductDetailsData>({
    sizeVariants: [], colorVariants: [], variantCombinations: [], highlights: [], specifications: [],
    packingTypeId: '',
    packageWeight: '', packageWeightUnitId: '',
    packageLength: '', packageLengthUnitId: '',
    packageWidth: '', packageWidthUnitId: '',
    packageHeight: '', packageHeightUnitId: '',
  });
  const [domesticShipping, setDomesticShipping] = useState<DomesticShippingData>(DEFAULT_DOMESTIC_SHIPPING);
  const [offersData, setOffersData] = useState<OffersData>({
    specialDayOffers: [], quantityOffers: [],
    ingredients: [], directions: '', manufacturer_name: '', manufacturer_country: '', important_note: '',
  });
  const [conditionDetails, setConditionDetails] = useState<ConditionDetailsData>({
    usage_duration: '' as any,
    working_condition: '' as any,
    working_condition_notes: '',
    original_packaging: false,
    original_invoice: false,
    accessories_included: '',
    ownership_type: '' as any,
    has_scratches: false,
    scratch_description: '',
    scratch_images: [],
    refurbished_by: null,
    repair_details: '',
  });
  const [returnPolicy, setReturnPolicy] = useState<ReturnPolicyData>({
    accepts_returns: false,
    return_window: null,
    accepted_return_reasons: [],
    return_shipping_by: null,
    refund_type: null,
    proof_requirement: null,
    return_condition_agreed: false,
    seller_responsibility_agreed: false,
  });

  const isUsedOrRefurbished = basicInfo.itemCondition !== 'brand_new';
  const WIZARD_STEPS = getWizardSteps(basicInfo.itemCondition);

  // Fetch seller products from Supabase
  useEffect(() => {
    fetchCountries().then(({ data }) => setAllCountries(data));
  }, []);

  useEffect(() => {
    const resolveSellerLockedOrigin = async () => {
      const sellerId = user?.id || '';
      if (!sellerId) return;

      let resolvedCountryId = '';

      const { data: kycRow } = await supabase
        .from('seller_kyc')
        .select('kyc_status, business_country, country, business_postal_code, business_name, business_street_address_1, business_street_address_2, business_city, business_state')
        .eq('seller_id', sellerId)
        .maybeSingle();

      let resolvedCurrencyCode = '';

      const kycCountryName = String(kycRow?.business_country || kycRow?.country || '').trim();
      if (String(kycRow?.kyc_status || '').toLowerCase() === 'approved' && kycCountryName) {
        const { data: countryByName } = await supabase
          .from('countries')
          .select('id, currency_code')
          .ilike('country_name', kycCountryName)
          .maybeSingle();
        resolvedCountryId = String(countryByName?.id || '');
        resolvedCurrencyCode = String(countryByName?.currency_code || '');
      }

      if (!resolvedCountryId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('country_id')
          .eq('id', sellerId)
          .maybeSingle();
        resolvedCountryId = String(profile?.country_id || '');
      }

      if (!resolvedCountryId) return;

      // If currency wasn't resolved from KYC query, look up from country_id
      if (!resolvedCurrencyCode) {
        const { data: countryById } = await supabase
          .from('countries')
          .select('currency_code')
          .eq('id', resolvedCountryId)
          .maybeSingle();
        resolvedCurrencyCode = String(countryById?.currency_code || '');
      }

      // Final fallback: try local allCountries array, then 'INR'
      if (!resolvedCurrencyCode) {
        const localMatch = allCountries.find((c) => c.id === resolvedCountryId);
        resolvedCurrencyCode = String(localMatch?.currency_code || 'INR');
      }

      setSellerLockedOrigin({ countryId: resolvedCountryId, currencyCode: resolvedCurrencyCode });
      setBasicInfo((prev) => ({
        ...prev,
        originCountryId: resolvedCountryId,
        originCountryCurrency: resolvedCurrencyCode,
      }));
      // Pre-fill manufacturer info from KYC into offersData if not already set
      const kycBusinessName = String(kycRow?.business_name || '');
      const kycBusinessCountry = String(kycRow?.business_country || kycRow?.country || '');
      setOffersData((prev) => ({
        ...prev,
        manufacturer_name: prev.manufacturer_name || kycBusinessName,
        manufacturer_country: prev.manufacturer_country || kycBusinessCountry,
      }));
      // Pickup warehouse is managed in separate section (/seller/warehouse).
      // Product listing should not bind pickup location details in UI state.
    };

    if (allCountries.length > 0 && user?.id) {
      void resolveSellerLockedOrigin();
    }
  }, [allCountries, user?.id]);

  // Close action menu when clicking outside
  useEffect(() => {
    if (!actionMenuOpenId) return;
    const handler = () => setActionMenuOpenId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [actionMenuOpenId]);

  useEffect(() => {
    const fetchProducts = async () => {
      const sellerId = user?.id || '';
      if (!sellerId) return;
      const hasCache = !!sellerProductsCache[sellerId];
      try {
        if (!hasCache) setLoading(true);
        setError(null);
        
        const batchSize = 200;
        let offset = 0;
        let allProducts: any[] = [];
        let e: string | null = null;

        while (true) {
          const { data: batchData, error: batchError } = await fetchProductsFromDB({
            sellerId,
            limit: batchSize,
            offset,
          });

          if (batchError) {
            e = batchError;
            break;
          }

          const rows = batchData || [];
          allProducts = allProducts.concat(rows);

          if (rows.length < batchSize) {
            break;
          }

          offset += batchSize;
        }

        if (e) {
          setError(e);
        } else {
          const productIds = allProducts.map((p: any) => String(p.id)).filter(Boolean);

          const variantsResponse = productIds.length > 0
            ? await supabase.from('product_variants').select('product_id, stock').in('product_id', productIds).eq('variant_type', 'combination')
            : { data: [], error: null } as any;

          const variantAggByProduct = new Map<string, VariantStockAgg>();
          const variantStocksByProduct = new Map<string, number[]>();
          const variantProductIds = new Set<string>();
          for (const row of variantsResponse.data || []) {
            const pid = String(row.product_id);
            variantProductIds.add(pid);
            const stocks = variantStocksByProduct.get(pid) || [];
            stocks.push(Number(row.stock || 0));
            variantStocksByProduct.set(pid, stocks);
          }
          for (const [pid, stocks] of variantStocksByProduct.entries()) {
            const agg = aggregateVariantStocks(stocks);
            if (agg) variantAggByProduct.set(pid, agg);
          }

          const hasRequiredProductDetails = (product: any) => {
            const weight = Number(product?.package_weight || 0);
            const length = Number(product?.package_length || 0);
            const width = Number(product?.package_width || 0);
            const height = Number(product?.package_height || 0);

            return Boolean(
              product?.packing_type_id
              && product?.package_weight_unit_id
              && product?.package_length_unit_id
              && product?.package_width_unit_id
              && product?.package_height_unit_id
              && Number.isFinite(weight) && weight > 0
              && Number.isFinite(length) && length > 0
              && Number.isFinite(width) && width > 0
              && Number.isFinite(height) && height > 0
            );
          };

          const mapped: SellerProduct[] = allProducts.map((p: any) => {
            const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
            const hasMedia = images.length > 0 || Boolean(p.image_url);
            const hasDetails = variantProductIds.has(String(p.id)) || hasRequiredProductDetails(p);
            const hasDomestic = hasRequiredProductDetails(p);

            let resumeStep: 'basic' | 'media' | 'details' | 'domestic' | 'offers' = 'basic';
            if (!hasMedia) resumeStep = 'media';
            else if (!hasDetails) resumeStep = 'details';
            else if (!hasDomestic) resumeStep = 'domestic';
            else resumeStep = 'offers';

            const approvalStatus = p.approval_status || 'pending';
            const isActive = Boolean(p.is_active);
            const isDraft = approvalStatus === 'pending' && !isActive && (!hasMedia || !hasDetails || !hasDomestic);

            const stockFields = buildSellerStockFields(
              Number(p.stock || 0),
              variantStocksByProduct.get(String(p.id)) || [],
            );

            return {
              id: p.id,
              publicId: p.public_product_id || '',
              name: p.name || '',
              category: p.category || '',
              categoryName: p.category_name || '',
              price: p.price || 0,
              currency: p.currency || 'INR',
              ...stockFields,
              isActive,
              approvalStatus,
              isDraft,
              resumeStep,
              image: ((Array.isArray(p.images) ? p.images : []) as string[]).find((u: string) => typeof u === 'string' && u.startsWith('http')) || p.image_url || '',
              sku: p.sku || '',
            };
          });
          setProducts(mapped);
          // Update module cache so revisits skip the loading state.
          sellerProductsCache[sellerId] = mapped;
        }
      } catch (_err) {
        setError('Failed to load products. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchProducts();
    }
  }, [user, reloadProductsKey]);

  useEffect(() => {
    const hydrateDraftFromBackend = async () => {
      if (!isCreateFlow || !currentDraftId || !user?.id) return;
      if (hydratedDraftId === currentDraftId) return;

      const { data: draftProduct, error: draftError } = await supabase
        .from('products')
        .select('id, name, category, sub_category, product_type, hsn_code, brand, ingredients, directions, important_note, manufacturer_name, manufacturer_country, manufacturer_address, short_description, description, origin_country_id, currency, mrp, price, stock, sku, images, videos, is_cod_available, packing_type_id, package_weight, package_weight_unit_id, package_length, package_length_unit_id, package_width, package_width_unit_id, package_height, package_height_unit_id, highlights, specifications, ships_internationally, item_condition')
        .eq('id', currentDraftId)
        .eq('seller_id', user.id)
        .maybeSingle();

      if (draftError || !draftProduct) {
        return;
      }

      const [
        draftVariantsResponse,
        offersResponse,
      ] = await Promise.all([
        supabase
          .from('product_variants')
          .select('id, variant_type, size_system, size_value, size, color, color_hex, sku, price, mrp, stock, images, weight, weight_unit, length, width, height, dimension_unit')
          .eq('product_id', currentDraftId),
        supabase
          .from('offer_rules')
          .select('id, offer_type, buy_quantity, get_quantity, special_day_name, discount_percent, start_time, end_time, bundle_min_qty, bundle_discount')
          .eq('product_id', currentDraftId),
      ]);

      const draftVariants = draftVariantsResponse.data;

      const combinationVariants = (draftVariants || []).filter((row: any) => row.variant_type === 'combination');

      const uniqueSizeMap = new Map<string, { sizeSystem: string; sizeValue: string; sizeUnit: string }>();
      const uniqueColorMap = new Map<string, { color: string; colorHex: string }>();

      for (const row of combinationVariants) {
        const sizeSystem = String(row.size_system || 'CUSTOM');
        const sizeValue = String(row.size_value || row.size || '').trim();
        const color = String(row.color || '').trim();
        const colorHex = String(row.color_hex || '#000000');

        // Recover sizeUnit from the formatted `size` column ("42 EU" → "EU")
        let sizeUnit = 'NONE';
        const rawSize = String(row.size || '').trim();
        if (sizeValue && rawSize.length > sizeValue.length) {
          const suffix = rawSize.slice(sizeValue.length).trim();
          if (suffix) sizeUnit = suffix.toUpperCase();
        }

        if (sizeValue) {
          uniqueSizeMap.set(`${sizeSystem}|${sizeValue}`, { sizeSystem, sizeValue, sizeUnit });
        }
        if (color) {
          uniqueColorMap.set(`${color}|${colorHex}`, { color, colorHex });
        }
      }

      // Look up category slugs so variant theme resolution works on draft reload
      const catIds = [draftProduct.category, draftProduct.sub_category, (draftProduct as any).product_type].filter(Boolean);
      let catSlugMap: Record<string, string> = {};
      if (catIds.length > 0) {
        const { data: catRows } = await supabase
          .from('categories')
          .select('id, slug')
          .in('id', catIds);
        if (catRows) {
          for (const r of catRows) catSlugMap[r.id] = r.slug;
        }
      }

      setBasicInfo((prev) => ({
        ...prev,
        itemCondition: ((draftProduct as any).item_condition || 'brand_new') as ItemCondition,
        name: String(draftProduct.name || ''),
        categoryId: String(draftProduct.category || ''),
        categorySlug: catSlugMap[draftProduct.category] || '',
        subCategoryId: String(draftProduct.sub_category || ''),
        subCategorySlug: catSlugMap[draftProduct.sub_category] || '',
        productTypeId: String((draftProduct as any).product_type || ''),
        productTypeName: '',
        productTypeSlug: catSlugMap[(draftProduct as any).product_type] || '',
        brand_name: String(draftProduct.brand || ''),
        sku: String((draftProduct as any).sku || ''),
        manufacturer_address: String((draftProduct as any).manufacturer_address || ''),
        shortDescription: String(draftProduct.short_description || ''),
        description: String(draftProduct.description || ''),
        originCountryId: String(draftProduct.origin_country_id || ''),
        originCountryCurrency: String(draftProduct.currency || prev.originCountryCurrency || ''),
        mrp: String(draftProduct.mrp ?? ''),
        price: String(draftProduct.price ?? ''),
        stock: String(draftProduct.stock ?? ''),
        isCodAvailable: draftProduct.is_cod_available !== false,
        hsnCode: String((draftProduct as any).hsn_code || ''),
      }));

      setMediaData((prev) => ({
        ...prev,
        images: [],
        videos: [],
        imageUrls: Array.isArray(draftProduct.images) ? draftProduct.images.filter(Boolean) : [],
        videoUrls: Array.isArray((draftProduct as any).videos) ? (draftProduct as any).videos.filter(Boolean) : [],
      }));

      const specificationRows = Object.entries((draftProduct.specifications || {}) as Record<string, string>).map(([key, value], index) => ({
        id: `spec-${currentDraftId}-${index}`,
        key: String(key),
        value: String(value),
      }));

      const highlightRows = (Array.isArray(draftProduct.highlights) ? draftProduct.highlights : [])
        .map((text: any, index: number) => ({ id: `hl-${currentDraftId}-${index}`, text: String(text || '') }))
        .filter((row) => row.text.trim());

      setProductDetails({
        sizeVariants: Array.from(uniqueSizeMap.values()).map((entry, index) => ({
          id: `size-${currentDraftId}-${index}`,
          size: entry.sizeValue,
          sizeSystem: entry.sizeSystem,
          sizeValue: entry.sizeValue,
          sizeUnit: entry.sizeUnit,
          customUnit: '',
          price: '',
          stock: '',
        })),
        colorVariants: Array.from(uniqueColorMap.values()).map((entry, index) => ({
          id: `color-${currentDraftId}-${index}`,
          color: entry.color,
          colorHex: entry.colorHex,
          sku: '',
          price: '',
          stock: '',
        })),
        variantCombinations: combinationVariants.map((row: any, index: number) => {
          const sv = String(row.size_value || row.size || '').trim();
          const rs = String(row.size || '').trim();
          let su = 'NONE';
          if (sv && rs.length > sv.length) {
            const suffix = rs.slice(sv.length).trim();
            if (suffix) su = suffix.toUpperCase();
          }
          return {
            id: String(row.id || `vc-${currentDraftId}-${index}`),
            sizeSystem: String(row.size_system || 'CUSTOM'),
            sizeValue: sv,
            sizeUnit: su,
            color: String(row.color || ''),
            colorHex: String(row.color_hex || '#000000'),
            sku: String(row.sku || ''),
            price: String(row.price ?? ''),
            mrp: String(row.mrp ?? ''),
            stock: String(row.stock ?? ''),
            images: Array.isArray(row.images) ? row.images : [],
          };
        }),
        highlights: highlightRows,
        specifications: specificationRows,
        packingTypeId: String((draftProduct as any).packing_type_id || ''),
        packageWeight: String(draftProduct.package_weight ?? ''),
        packageWeightUnitId: String((draftProduct as any).package_weight_unit_id || ''),
        packageLength: String(draftProduct.package_length ?? ''),
        packageLengthUnitId: String((draftProduct as any).package_length_unit_id || ''),
        packageWidth: String(draftProduct.package_width ?? ''),
        packageWidthUnitId: String((draftProduct as any).package_width_unit_id || ''),
        packageHeight: String(draftProduct.package_height ?? ''),
        packageHeightUnitId: String((draftProduct as any).package_height_unit_id || ''),
      });

      setDomesticShipping({
        ...DEFAULT_DOMESTIC_SHIPPING,
        shipsInternationally: Boolean(draftProduct.ships_internationally),
      });

      const offerRows = (offersResponse.data || []) as any[];
      setOffersData({
        specialDayOffers: offerRows
          .filter((row) => row.offer_type === 'special_day')
          .map((row) => ({
            id: String(row.id || crypto.randomUUID()),
            specialDayName: String(row.special_day_name || ''),
            discountPercent: row.discount_percent != null ? String(row.discount_percent) : '',
            startDate: row.start_time ? new Date(row.start_time).toISOString().slice(0, 16) : '',
            endDate: row.end_time ? new Date(row.end_time).toISOString().slice(0, 16) : '',
          })),
        quantityOffers: offerRows
          .filter((row) => row.offer_type === 'buy_x_get_y' || row.offer_type === 'bundle_discount')
          .map((row) => ({
            id: String(row.id || crypto.randomUUID()),
            offerType: row.offer_type === 'bundle_discount' ? 'bundle_discount' : 'buy_x_get_y',
            buyQuantity: row.buy_quantity != null ? String(row.buy_quantity) : '',
            getQuantity: row.get_quantity != null ? String(row.get_quantity) : '',
            discountPercent: row.discount_percent != null ? String(row.discount_percent) : '',
            bundleMinQty: row.bundle_min_qty != null ? String(row.bundle_min_qty) : '',
            bundleDiscount: row.bundle_discount != null ? String(row.bundle_discount) : '',
          })),
        ingredients: parseIngredients((draftProduct as any).ingredients),
        directions: String((draftProduct as any).directions || ''),
        manufacturer_name: String((draftProduct as any).manufacturer_name || ''),
        manufacturer_country: String((draftProduct as any).manufacturer_country || ''),
        important_note: String((draftProduct as any).important_note || ''),
      });

      setHydratedDraftId(currentDraftId);

      // Hydrate condition details and return policy for used/refurbished drafts
      const draftCondition = ((draftProduct as any).item_condition || 'brand_new') as string;
      if (draftCondition !== 'brand_new') {
        const [condRes, retRes] = await Promise.all([
          fetchConditionDetails(currentDraftId),
          fetchReturnPolicy(currentDraftId),
        ]);
        if (condRes.data) {
          setConditionDetails({
            usage_duration: condRes.data.usage_duration,
            working_condition: condRes.data.working_condition,
            working_condition_notes: condRes.data.working_condition_notes || '',
            original_packaging: Boolean(condRes.data.original_packaging),
            original_invoice: Boolean(condRes.data.original_invoice),
            accessories_included: condRes.data.accessories_included || '',
            ownership_type: condRes.data.ownership_type,
            has_scratches: Boolean(condRes.data.has_scratches),
            scratch_description: condRes.data.scratch_description || '',
            scratch_images: condRes.data.scratch_images || [],
            refurbished_by: condRes.data.refurbished_by || null,
            repair_details: condRes.data.repair_details || '',
          });
        }
        if (retRes.data) {
          setReturnPolicy({
            accepts_returns: Boolean(retRes.data.accepts_returns),
            return_window: retRes.data.return_window || null,
            accepted_return_reasons: retRes.data.accepted_return_reasons || [],
            return_shipping_by: retRes.data.return_shipping_by || null,
            refund_type: retRes.data.refund_type || null,
            proof_requirement: retRes.data.proof_requirement || null,
            return_condition_agreed: Boolean(retRes.data.return_condition_agreed),
            seller_responsibility_agreed: Boolean(retRes.data.seller_responsibility_agreed),
          });
        }
      }
    };

    void hydrateDraftFromBackend();
  }, [isCreateFlow, currentDraftId, user?.id, hydratedDraftId]);

  // Create new product (wizard-based)
  const handleCreateProduct = async () => {
    let createdProductId: string | null = null;

    try {
      setCreating(true);
      setCreateFeedback(null);

      const sellerId = user?.id || '';

      // Validation
      if (!basicInfo.name || !basicInfo.categoryId) {
        setCreateFeedback({ type: 'error', message: 'Please fill in all required fields in Step 1 (Name, Category).' });
        setCreating(false);
        setShowCreateConfirm(false);
        return;
      }

      // Variant rows are the single source of truth for price/MRP/stock.
      if (!productDetails.variantCombinations || productDetails.variantCombinations.length === 0) {
        setCreateFeedback({ type: 'error', message: 'No variant rows found. Go to the Product Details step, click "Generate Variant Combinations", and fill SKU, Selling Price, MRP and Stock.' });
        setCreating(false);
        setShowCreateConfirm(false);
        return;
      }

      const invalidVariantRow = productDetails.variantCombinations.some((row) => {
        const p = parseFloat(row.price || '0');
        const m = parseFloat(row.mrp || '0');
        const s = parseInt(row.stock || '0');
        if (!row.sku?.trim()) return true;
        if (!Number.isFinite(p) || p <= 0) return true;
        if (!Number.isFinite(m) || m <= 0) return true;
        if (p > m) return true;
        if (!Number.isFinite(s) || s < 1) return true;
        return false;
      });
      if (invalidVariantRow) {
        setCreateFeedback({ type: 'error', message: 'Every variant row needs SKU, Selling Price, MRP (>= price) and Stock (at least 1).' });
        setCreating(false);
        setShowCreateConfirm(false);
        return;
      }

      if (mediaData.images.length < 5) {
        setCreateFeedback({ type: 'error', message: 'Please upload at least 5 product images (maximum 10).' });
        setCreating(false);
        setShowCreateConfirm(false);
        return;
      }

      const packageWeight = parseFloat(productDetails.packageWeight);
      const packageLength = parseFloat(productDetails.packageLength);
      const packageWidth = parseFloat(productDetails.packageWidth);
      const packageHeight = parseFloat(productDetails.packageHeight);
      if (
        !productDetails.packingTypeId ||
        !productDetails.packageWeightUnitId ||
        !productDetails.packageLengthUnitId ||
        !productDetails.packageWidthUnitId ||
        !productDetails.packageHeightUnitId ||
        !Number.isFinite(packageWeight) || packageWeight <= 0 ||
        !Number.isFinite(packageLength) || packageLength <= 0 ||
        !Number.isFinite(packageWidth) || packageWidth <= 0 ||
        !Number.isFinite(packageHeight) || packageHeight <= 0
      ) {
        setCreateFeedback({ type: 'error', message: 'Packing details are mandatory. Select packing type/units and enter valid weight, length, width and height in Step 3.' });
        setCreating(false);
        setShowCreateConfirm(false);
        return;
      }

      // Validate condition details and return policy for used/refurbished items
      if (isUsedOrRefurbished) {
        if (!conditionDetails.usage_duration || !conditionDetails.working_condition || !conditionDetails.ownership_type) {
          setCreateFeedback({ type: 'error', message: 'Please fill in all required condition details (usage duration, working condition, ownership).' });
          setCreating(false);
          setShowCreateConfirm(false);
          return;
        }
        if (conditionDetails.working_condition !== 'works_perfectly' && !conditionDetails.working_condition_notes.trim()) {
          setCreateFeedback({ type: 'error', message: 'Please describe the working condition issues.' });
          setCreating(false);
          setShowCreateConfirm(false);
          return;
        }
        if (conditionDetails.has_scratches && (!conditionDetails.scratch_description.trim() || conditionDetails.scratch_images.length === 0)) {
          setCreateFeedback({ type: 'error', message: 'Please describe scratches and upload at least 1 photo of the damage.' });
          setCreating(false);
          setShowCreateConfirm(false);
          return;
        }
        if (basicInfo.itemCondition === 'refurbished' && (!conditionDetails.refurbished_by || !conditionDetails.repair_details?.trim())) {
          setCreateFeedback({ type: 'error', message: 'Please specify who refurbished the product and what was repaired.' });
          setCreating(false);
          setShowCreateConfirm(false);
          return;
        }
        if (!returnPolicy.return_condition_agreed || !returnPolicy.seller_responsibility_agreed) {
          setCreateFeedback({ type: 'error', message: 'Please agree to both return policy checkboxes.' });
          setCreating(false);
          setShowCreateConfirm(false);
          return;
        }
        if (returnPolicy.accepts_returns) {
          if (!returnPolicy.return_window || returnPolicy.accepted_return_reasons.length === 0 || !returnPolicy.return_shipping_by || !returnPolicy.refund_type || !returnPolicy.proof_requirement) {
            setCreateFeedback({ type: 'error', message: 'Please complete all return policy fields.' });
            setCreating(false);
            setShowCreateConfirm(false);
            return;
          }
        }
      }



      // Upload images with progress tracking
      const totalFiles = mediaData.images.length + mediaData.videos.length;
      let uploadedCount = 0;
      const uploadedImageUrls: string[] = [];
      for (const file of mediaData.images) {
        uploadedCount++;
        setUploadProgress({
          current: uploadedCount,
          total: totalFiles,
          percent: Math.round((uploadedCount / totalFiles) * 100),
          fileName: file.name,
        });
        const url = await uploadProductImage(file, sellerId);
        uploadedImageUrls.push(url);
      }

      // Upload videos with progress tracking
      const uploadedVideoUrls: string[] = [];
      for (const file of mediaData.videos) {
        uploadedCount++;
        setUploadProgress({
          current: uploadedCount,
          total: totalFiles,
          percent: Math.round((uploadedCount / totalFiles) * 100),
          fileName: file.name,
        });
        const url = await uploadProductVideo(file, sellerId);
        uploadedVideoUrls.push(url);
      }
      setUploadProgress(null);

      const selectedCountry = allCountries.find((c) => c.id === basicInfo.originCountryId);
      // Prefer the DB-resolved currency from locked origin, then form state, then local lookup — 'INR' only as absolute last resort
      const baseCurrencyCode = sellerLockedOrigin?.currencyCode || basicInfo.originCountryCurrency || selectedCountry?.currency_code || 'INR';

      // Resolve origin country name — if allCountries didn't have it, fetch from DB
      let originCountryName = selectedCountry?.country_name || '';
      if (!originCountryName && basicInfo.originCountryId) {
        const { data: dbCountry } = await supabase
          .from('countries')
          .select('country_name')
          .eq('id', basicInfo.originCountryId)
          .maybeSingle();
        originCountryName = String(dbCountry?.country_name || '');
      }

      // Build specifications JSONB
      const specificationsObj: Record<string, string> = {};
      for (const sp of productDetails.specifications) {
        if (sp.key && sp.value) specificationsObj[sp.key] = sp.value;
      }

      // Auto-generate SKU if seller didn't provide one
      const sellerSku = (basicInfo.sku || '').trim().toUpperCase();
      const finalSku = sellerSku || await generateNextSku();

      const productInput = {
        seller_id: sellerId,
        name: basicInfo.name,
        sku: finalSku,
        category: basicInfo.categoryId,
        sub_category: basicInfo.subCategoryId || undefined,
        product_type: basicInfo.productTypeId || null,
        hsn_code: basicInfo.hsnCode || null,
        brand: basicInfo.brand_name || basicInfo.name,
        manufacturer_name: offersData.manufacturer_name || '',
        manufacturer_country: offersData.manufacturer_country || '',
        manufacturer_address: basicInfo.manufacturer_address || '',
        ingredients: serializeIngredients(offersData.ingredients),
        directions: offersData.directions || '',
        important_note: offersData.important_note || '',
        description: basicInfo.description || basicInfo.name,
        short_description: basicInfo.shortDescription || basicInfo.description?.substring(0, 100) || basicInfo.name,
        highlights: productDetails.highlights
          .map((highlight) => highlight.text.trim())
          .filter(Boolean),
        specifications: Object.keys(specificationsObj).length > 0 ? specificationsObj : undefined,
        package_weight: packageWeight,
        package_weight_unit_id: productDetails.packageWeightUnitId,
        package_length: packageLength,
        package_length_unit_id: productDetails.packageLengthUnitId,
        package_width: packageWidth,
        package_width_unit_id: productDetails.packageWidthUnitId,
        package_height: packageHeight,
        package_height_unit_id: productDetails.packageHeightUnitId,
        packing_type_id: productDetails.packingTypeId,
        is_cod_available: basicInfo.isCodAvailable !== false,

        // Derive product-level price/MRP/stock from the cheapest variant row.
        // Variant rows are the single source of truth; these legacy columns are
        // kept in sync so RPCs / homepage cards continue to work.
        ...(() => {
          const combos = productDetails.variantCombinations;
          const cheapest = combos.reduce((min, c) => {
            const cp = parseFloat(c.price || '0');
            const mp = parseFloat((min?.price as string) || '0');
            return (!min || (cp > 0 && (mp <= 0 || cp < mp))) ? c : min;
          }, combos[0]);
          const derivedPrice = parseFloat(cheapest?.price || '0') || 0;
          const derivedMrp = parseFloat(cheapest?.mrp || '0') || derivedPrice;
          const derivedStock = combos.reduce((s, c) => s + (parseInt(c.stock || '0') || 0), 0);
          return { price: derivedPrice, mrp: derivedMrp, stock: derivedStock };
        })(),
        currency: baseCurrencyCode,
        origin_country: originCountryName,
        origin_country_id: basicInfo.originCountryId || null,

        image_url: uploadedImageUrls[0] || '',
        images: uploadedImageUrls,
        videos: uploadedVideoUrls,

        approval_status: 'pending',
        is_active: false,
        shipping_type: resolveShippingStrategy(domesticShipping).shippingType,
        courier_partner: resolveShippingStrategy(domesticShipping).courierPartner,
        item_condition: basicInfo.itemCondition || 'brand_new',

        // Variants (size + color)
        variantCombinations: productDetails.variantCombinations
          .filter((row) => row.sku && row.price && row.stock)
          .map((row) => ({
            size_system: row.sizeSystem,
            size_value: row.sizeValue,
            size_unit: row.sizeUnit,
            color: row.color,
            color_hex: row.colorHex,
            sku: row.sku,
            price: parseFloat(row.price) || 0,
            mrp: parseFloat(row.mrp) || parseFloat(row.price) || 0,
            stock: parseInt(row.stock) || 0,
            images: row.images || [],
          })),
        sizeVariants: productDetails.sizeVariants
          .filter((sv) => sv.sizeValue || sv.size)
          .map((sv) => {
            const resolvedSize = String(
              sv.sizeValue === '__CUSTOM__'
                ? (sv.size || '')
                : (sv.size || sv.sizeValue || '')
            ).trim();
            return {
              size: resolvedSize,
              price: parseFloat(sv.price) || 0,
              stock: parseInt(sv.stock) || 0,
            };
          }),
        colorVariants: productDetails.colorVariants
          .filter((cv) => cv.color)
          .map((cv) => ({ color: cv.color, color_hex: cv.colorHex, sku: cv.sku, price: parseFloat(cv.price) || 0, stock: parseInt(cv.stock) || 0 })),

        // Offer rules
        offerRules: [
          ...offersData.specialDayOffers
            .filter((o) => o.specialDayName && o.discountPercent)
            .map((o) => ({
              type: 'special_day',
              specialDayName: o.specialDayName,
              discountPercent: parseFloat(o.discountPercent),
              startTime: o.startDate ? new Date(o.startDate).toISOString() : null,
              endTime: o.endDate ? new Date(o.endDate).toISOString() : null,
              isActive: true,
            })),
          ...offersData.quantityOffers
            .filter((o) => o.offerType)
            .map((o) => ({
              type: o.offerType,
              buyQuantity: o.offerType === 'buy_x_get_y' ? parseInt(o.buyQuantity) || null : null,
              getQuantity: o.offerType === 'buy_x_get_y' ? parseInt(o.getQuantity) || null : null,
              discountPercent: o.offerType === 'buy_x_get_y' ? parseFloat(o.discountPercent) || null : null,
              bundleMinQty: o.offerType === 'bundle_discount' ? parseInt(o.bundleMinQty) || null : null,
              bundleDiscount: o.offerType === 'bundle_discount' ? parseFloat(o.bundleDiscount) || null : null,
              isActive: true,
            })),
        ],
      };

      const { data, error: createError } = await createProduct(productInput);

      if (createError) {
        setCreateFeedback({ type: 'error', message: `Failed to create product: ${createError}` });
      } else if (data) {
        const productId = data.id;
        createdProductId = productId;

        const failCreateAndRollback = async (message: string) => {
          const finalMessage = await rollbackCreatedProduct(productId, message);
          setCreateFeedback({ type: 'error', message: finalMessage });
          setShowCreateConfirm(false);
        };

        // Save ships_internationally flag on the product
        const { error: intlFlagErr } = await supabase
          .from('products')
          .update({ ships_internationally: Boolean(domesticShipping.shipsInternationally) })
          .eq('id', productId);
        if (intlFlagErr) {
          await failCreateAndRollback(`Failed to save international shipping flag: ${intlFlagErr.message}`);
          return;
        }

        // Save condition details and return policy for used/refurbished items
        if (isUsedOrRefurbished) {
          const { error: condErr } = await saveConditionDetails(productId, conditionDetails as unknown as Record<string, unknown>);
          if (condErr) {
            await failCreateAndRollback(`Failed to save condition details: ${condErr}`);
            return;
          }
          const { error: retErr } = await saveReturnPolicy(productId, returnPolicy as unknown as Record<string, unknown>);
          if (retErr) {
            await failCreateAndRollback(`Failed to save return policy: ${retErr}`);
            return;
          }
        }

        setCreateFeedback({ type: 'success', message: 'Product created successfully. It will be visible after admin approval.' });

        const createdComboStocks = (productDetails.variantCombinations || []).map(
          (row) => parseInt(row.stock || '0', 10) || 0,
        );
        const createdStockFields = createdComboStocks.length > 0
          ? buildSellerStockFields(0, createdComboStocks)
          : buildSellerStockFields(Number(data.stock || basicInfo.stock || 0), []);

        setProducts((prev) => [
          {
            id: String(data.id),
            publicId: String((data as any).public_product_id || ''),
            name: data.name || basicInfo.name,
            category: data.category || basicInfo.categoryId,
            categoryName: basicInfo.categoryName || '',
            price: Number(data.price || basicInfo.price || 0),
            currency: String(data.currency || selectedCountry?.currency_code || 'INR'),
            ...createdStockFields,
            isActive: Boolean((data as any).is_active),
            approvalStatus: 'pending',
            isDraft: false,
            resumeStep: 'domestic',
            image: data.image_url || uploadedImageUrls[0] || '',
            sku: (data as any).sku || '',
          },
          ...prev,
        ]);

        // Reset wizard
        resetWizard();
        setShowCreateModal(false);
        setShowCreateConfirm(false);
      }
    } catch (err: any) {
      if (createdProductId) {
        const finalMessage = await rollbackCreatedProduct(
          createdProductId,
          `Failed to create product: ${err.message || 'Please try again.'}`,
        );
        setCreateFeedback({ type: 'error', message: finalMessage });
      } else {
        setCreateFeedback({ type: 'error', message: `Failed to create product: ${err.message || 'Please try again.'}` });
      }
      setShowCreateConfirm(false);
    } finally {
      setCreating(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(0);
    setBasicInfo({
      itemCondition: 'brand_new',
      name: '', categoryId: '', categoryName: '', categorySlug: '',
      subCategoryId: '', subCategoryName: '', subCategorySlug: '',
      productTypeId: '', productTypeName: '', productTypeSlug: '',
      hsnCode: '',
      brand_name: '', shortDescription: '', description: '',
      originCountryId: sellerLockedOrigin?.countryId || '',
      originCountryCurrency: sellerLockedOrigin?.currencyCode || '',
      mrp: '', price: '', stock: '', isCodAvailable: true,
      manufacturer_address: '', sku: '',
    });
    setMediaData({ images: [], imageUrls: [], videos: [], videoUrls: [] });
    setProductDetails({
      sizeVariants: [],
      colorVariants: [],
      variantCombinations: [],
      highlights: [],
      specifications: [],
      packingTypeId: '',
      packageWeight: '',
      packageWeightUnitId: '',
      packageLength: '',
      packageLengthUnitId: '',
      packageWidth: '',
      packageWidthUnitId: '',
      packageHeight: '',
      packageHeightUnitId: '',
    });
    setDomesticShipping(DEFAULT_DOMESTIC_SHIPPING);
    setOffersData({ specialDayOffers: [], quantityOffers: [], ingredients: [], directions: '', manufacturer_name: '', manufacturer_country: '', important_note: '' });
    setConditionDetails({
      usage_duration: '' as any,
      working_condition: '' as any,
      working_condition_notes: '',
      original_packaging: false,
      original_invoice: false,
      accessories_included: '',
      ownership_type: '' as any,
      has_scratches: false,
      scratch_description: '',
      scratch_images: [],
      refurbished_by: null,
      repair_details: '',
    });
    setReturnPolicy({
      accepts_returns: false,
      return_window: null,
      accepted_return_reasons: [],
      return_shipping_by: null,
      refund_type: null,
      proof_requirement: null,
      return_condition_agreed: false,
      seller_responsibility_agreed: false,
    });
    setUploadProgress(null);
  };

  const openDeleteDialog = (product: SellerProduct) => {
    setProductToDelete(product);
    setShowDeleteDialog(true);
  };

  const closeDeleteDialog = () => {
    if (productToDelete && actionLoadingByProduct[productToDelete.id] === 'delete') return;
    setShowDeleteDialog(false);
    setProductToDelete(null);
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;

    const productId = productToDelete.id;
    setActionLoadingByProduct((prev) => ({ ...prev, [productId]: 'delete' }));

    try {
      const result = await deleteProduct(productId, user?.id);
      if (!result.success) {
        toast.error(result.error || 'Failed to delete product. Please try again.');
        return;
      }

      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setShowDeleteDialog(false);
      setProductToDelete(null);
    } finally {
      setActionLoadingByProduct((prev) => ({ ...prev, [productId]: null }));
    }
  };

  const openOutOfStockDialog = (product: SellerProduct) => {
    setProductToMarkOutOfStock(product);
    setShowOutOfStockDialog(true);
  };

  const closeOutOfStockDialog = () => {
    if (productToMarkOutOfStock && actionLoadingByProduct[productToMarkOutOfStock.id] === 'out_of_stock') return;
    setShowOutOfStockDialog(false);
    setProductToMarkOutOfStock(null);
  };

  const handleMarkOutOfStock = async (product: SellerProduct) => {
    setActionLoadingByProduct((prev) => ({ ...prev, [product.id]: 'out_of_stock' }));

    try {
      const { error } = await supabase.rpc('mark_seller_product_out_of_stock', {
        p_product_id: product.id,
      });
      if (error) {
        toast.error(error.message || 'Failed to mark product out of stock. Please try again.');
        return;
      }

      const stockFields = buildSellerStockFields(0, product.hasVariants ? Array(product.variantCount).fill(0) : []);
      setProducts((prev) => {
        const updated = prev.map((item) => item.id === product.id ? { ...item, ...stockFields } : item);
        if (user?.id) sellerProductsCache[user.id] = updated;
        return updated;
      });
      setShowOutOfStockDialog(false);
      setProductToMarkOutOfStock(null);
      toast.success(`${product.name} is now out of stock.`);
    } finally {
      setActionLoadingByProduct((prev) => ({ ...prev, [product.id]: null }));
    }
  };

  const toDateTimeLocalValue = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 16);
  };

  const openEditDialog = async (product: SellerProduct) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name || '',
      shortDescription: '',
      description: '',
      mrp: '',
      price: String(product.price ?? ''),
      stock: String(product.stockCount ?? ''),
      sku: product.sku || '',
      manufacturer_name: '',
      manufacturer_address: '',
      images: [],
      imageUrls: [],
      existingImages: product.image ? [product.image] : [],
      videos: [],
      videoUrls: [],
      existingVideos: [],
    });
    setEditOriginCountryId('');
    setEditDomesticShipping(DEFAULT_DOMESTIC_SHIPPING);
    setEditOffersData({ specialDayOffers: [], quantityOffers: [], ingredients: [], directions: '', manufacturer_name: '', manufacturer_country: '', important_note: '' });
    setEditProductDetails({
      sizeVariants: [], colorVariants: [], variantCombinations: [], highlights: [], specifications: [],
      packingTypeId: '',
      packageWeight: '', packageWeightUnitId: '',
      packageLength: '', packageLengthUnitId: '',
      packageWidth: '', packageWidthUnitId: '',
      packageHeight: '', packageHeightUnitId: '',
    });
    setEditCategorySlugs({ categorySlug: '', subCategorySlug: '', productTypeSlug: '' });
    setEditCategoryNames({ categoryName: '', subCategoryName: '', productTypeName: '' });
    setEditExtras({ brand: '', hsn: '' });
    setShowEditSaveConfirm(false);
    setIsPriceEditing(false);
    setShowEditDialog(true);

    const [
      productRes,
      offersRes,
      variantsRes,
    ] = await Promise.all([
      supabase
        .from('products')
        .select('name, short_description, description, images, image_url, videos, mrp, sku, origin_country_id, category, sub_category, product_type, packing_type_id, package_weight, package_weight_unit_id, package_length, package_length_unit_id, package_width, package_width_unit_id, package_height, package_height_unit_id, highlights, specifications, manufacturer_name, manufacturer_country, manufacturer_address, ingredients, directions, important_note, ships_internationally')
        .eq('id', product.id)
        .maybeSingle(),
      supabase
        .from('offer_rules')
        .select('id, offer_type, buy_quantity, get_quantity, special_day_name, discount_percent, start_time, end_time, bundle_min_qty, bundle_discount, is_active')
        .eq('product_id', product.id),
      supabase
        .from('product_variants')
        .select('id, variant_type, size_system, size_value, size, color, color_hex, sku, price, mrp, stock, images')
        .eq('product_id', product.id),
    ]);

    const productData = productRes.data as any;
    const productImages = Array.from(new Set([
      ...((productData?.images || []) as string[]),
      productData?.image_url,
      product.image,
    ].filter((url): url is string => typeof url === 'string' && url.length > 10 && (url.startsWith('http') || url.startsWith('/'))))) as string[];
    const productVideos = Array.from(new Set((productData?.videos || []).filter(Boolean))) as string[];

    const offerRows = (offersRes.data || []) as any[];
    const mappedOffers: OffersData = {
      specialDayOffers: offerRows
        .filter((row) => row.offer_type === 'special_day')
        .map((row) => ({
          id: String(row.id),
          specialDayName: String(row.special_day_name || ''),
          discountPercent: row.discount_percent != null ? String(row.discount_percent) : '',
          startDate: toDateTimeLocalValue(row.start_time),
          endDate: toDateTimeLocalValue(row.end_time),
        })),
      quantityOffers: offerRows
        .filter((row) => row.offer_type === 'buy_x_get_y' || row.offer_type === 'bundle_discount')
        .map((row) => ({
          id: String(row.id),
          offerType: row.offer_type,
          buyQuantity: row.buy_quantity != null ? String(row.buy_quantity) : '',
          getQuantity: row.get_quantity != null ? String(row.get_quantity) : '',
          discountPercent: row.discount_percent != null ? String(row.discount_percent) : '',
          bundleMinQty: row.bundle_min_qty != null ? String(row.bundle_min_qty) : '',
          bundleDiscount: row.bundle_discount != null ? String(row.bundle_discount) : '',
        })),
      ingredients: parseIngredients((productData as any)?.ingredients),
      directions: String((productData as any)?.directions || ''),
      manufacturer_name: String((productData as any)?.manufacturer_name || ''),
      manufacturer_country: String((productData as any)?.manufacturer_country || ''),
      important_note: String((productData as any)?.important_note || ''),
    };

    const shippingChargeTypeName = 'Single Shipping Charge for Country Level';

    // Override manufacturer fields with seller KYC business info
    const sellerId = user?.id || '';
    let kycBusinessName = '';
    let kycBusinessAddress = '';
    if (sellerId) {
      const { data: kyc } = await supabase
        .from('seller_kyc')
        .select('business_name, business_street_address_1, business_street_address_2, business_city, business_state, business_postal_code, business_country')
        .eq('seller_id', sellerId)
        .maybeSingle();
      if (kyc) {
        kycBusinessName = String(kyc.business_name || '');
        const addrParts = [
          kyc.business_street_address_1,
          kyc.business_street_address_2,
          kyc.business_city,
          kyc.business_state,
          kyc.business_postal_code,
          kyc.business_country,
        ].filter(Boolean);
        kycBusinessAddress = addrParts.join(', ');
      }
    }

    setEditForm((prev) => ({
      ...prev,
      name: String(productData?.name ?? prev.name),
      shortDescription: String(productData?.short_description ?? ''),
      description: String(productData?.description ?? ''),
      mrp: String(productData?.mrp ?? ''),
      sku: String(productData?.sku ?? ''),
      manufacturer_name: kycBusinessName || String(productData?.manufacturer_name ?? ''),
      manufacturer_address: kycBusinessAddress || String(productData?.manufacturer_address ?? ''),
      existingImages: productImages,
      existingVideos: productVideos,
    }));

    setEditOriginCountryId(String(productData?.origin_country_id || ''));
    setEditOffersData(mappedOffers);
    setEditDomesticShipping({
      ...DEFAULT_DOMESTIC_SHIPPING,
      shippingChargeTypeName,
      shipsInternationally: Boolean(productData?.ships_internationally),
    });

    // Hydrate product details (weight, dimensions, variants, highlights, specs) for edit
    const variantRows = ((variantsRes.data || []) as any[]);
    const combinationVariants = variantRows.filter((r) => r.variant_type === 'combination');

    const editSpecRows = Object.entries((productData?.specifications || {}) as Record<string, string>).map(([key, value], index) => ({
      id: `spec-edit-${product.id}-${index}`,
      key: String(key),
      value: String(value),
    }));
    const editHighlightRows = (Array.isArray(productData?.highlights) ? productData.highlights : [])
      .map((text: any, index: number) => ({ id: `hl-edit-${product.id}-${index}`, text: String(text || '') }))
      .filter((row: any) => row.text.trim());

    const uniqueSizeMap = new Map<string, { sizeSystem: string; sizeValue: string; sizeUnit: string }>();
    const uniqueColorMap = new Map<string, { color: string; colorHex: string }>();
    for (const row of combinationVariants) {
      const sv = String(row.size_value || row.size || '').trim();
      const ss = String(row.size_system || 'CUSTOM');
      if (sv) uniqueSizeMap.set(`${ss}|${sv}`, { sizeSystem: ss, sizeValue: sv, sizeUnit: 'NONE' });
      const col = String(row.color || '').trim();
      const hex = String(row.color_hex || '#000000').trim();
      if (col) uniqueColorMap.set(`${col}|${hex}`, { color: col, colorHex: hex });
    }

    setEditProductDetails({
      sizeVariants: Array.from(uniqueSizeMap.values()).map((entry, index) => ({
        id: `size-edit-${product.id}-${index}`,
        size: entry.sizeValue,
        sizeSystem: entry.sizeSystem,
        sizeValue: entry.sizeValue,
        sizeUnit: entry.sizeUnit,
        customUnit: '',
        price: '',
        stock: '',
      })),
      colorVariants: Array.from(uniqueColorMap.values()).map((entry, index) => ({
        id: `color-edit-${product.id}-${index}`,
        color: entry.color,
        colorHex: entry.colorHex,
        sku: '',
        price: '',
        stock: '',
      })),
      variantCombinations: combinationVariants.map((row: any, index: number) => {
        const sv = String(row.size_value || row.size || '').trim();
        const rs = String(row.size || '').trim();
        let su = 'NONE';
        if (sv && rs.length > sv.length) {
          const suffix = rs.slice(sv.length).trim();
          if (suffix) su = suffix.toUpperCase();
        }
        return {
          id: String(row.id || `vc-edit-${product.id}-${index}`),
          sizeSystem: String(row.size_system || 'CUSTOM'),
          sizeValue: sv,
          sizeUnit: su,
          color: String(row.color || ''),
          colorHex: String(row.color_hex || '#000000'),
          sku: String(row.sku || ''),
          price: String(row.price ?? ''),
          mrp: String(row.mrp ?? ''),
          stock: String(row.stock ?? ''),
          images: Array.isArray(row.images) ? row.images : [],
        };
      }),
      highlights: editHighlightRows,
      specifications: editSpecRows,
      packingTypeId: String(productData?.packing_type_id || ''),
      packageWeight: String(productData?.package_weight ?? ''),
      packageWeightUnitId: String(productData?.package_weight_unit_id || ''),
      packageLength: String(productData?.package_length ?? ''),
      packageLengthUnitId: String(productData?.package_length_unit_id || ''),
      packageWidth: String(productData?.package_width ?? ''),
      packageWidthUnitId: String(productData?.package_width_unit_id || ''),
      packageHeight: String(productData?.package_height ?? ''),
      packageHeightUnitId: String(productData?.package_height_unit_id || ''),
    });

    // Resolve category slugs for variant theme
    const catIds = [productData?.category, productData?.sub_category, productData?.product_type].filter(Boolean);
    if (catIds.length > 0) {
      const { data: catRows } = await supabase.from('categories').select('id, slug, name').in('id', catIds);
      const slugMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      if (catRows) for (const r of catRows) { slugMap[r.id] = r.slug; nameMap[r.id] = r.name; }
      setEditCategorySlugs({
        categorySlug: slugMap[productData?.category] || '',
        subCategorySlug: slugMap[productData?.sub_category] || '',
        productTypeSlug: slugMap[productData?.product_type] || '',
      });
      setEditCategoryNames({
        categoryName: nameMap[productData?.category] || '',
        subCategoryName: nameMap[productData?.sub_category] || '',
        productTypeName: nameMap[productData?.product_type] || '',
      });
    }

    // Brand & HSN — best-effort fetch; tolerate missing columns
    try {
      const { data: extra } = await supabase
        .from('products')
        .select('brand, hsn_code')
        .eq('id', product.id)
        .maybeSingle();
      if (extra) {
        setEditExtras({
          brand: String((extra as any).brand || ''),
          hsn:   String((extra as any).hsn_code || ''),
        });
      }
    } catch {
      // columns may not exist — leave defaults
    }
  };

  const closeEditDialog = () => {
    if (editingProduct && actionLoadingByProduct[editingProduct.id] === 'update') return;
    editForm.imageUrls.forEach(url => URL.revokeObjectURL(url));
    editForm.videoUrls.forEach(url => URL.revokeObjectURL(url));
    setShowEditDialog(false);
    setShowEditSaveConfirm(false);
    setEditingProduct(null);
  };

  useEffect(() => {
    const nav = location.state as SellerNotificationNavState | null;
    if (nav?.fromNotification) {
      pendingNotificationNav.current = nav;
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const nav = pendingNotificationNav.current;
    if (!nav || loading) return;

    if (nav.productTab) setProductTab(nav.productTab);

    const product = nav.productId
      ? products.find((p) => p.id === nav.productId)
      : undefined;

    if (!product) {
      if (!error) return;
      pendingNotificationNav.current = null;
      return;
    }

    pendingNotificationNav.current = null;

    const index = products.findIndex((p) => p.id === product.id);
    if (index >= 0) {
      setCurrentPage(Math.floor(index / PRODUCTS_PER_PAGE) + 1);
    }

    if (product.isDraft) {
      goToCreateStep(product.resumeStep, product.id);
      return;
    }

    if (nav.openProductEdit) {
      void openEditDialog(product);
      return;
    }

    setHighlightProductId(product.id);
    window.setTimeout(() => {
      document.getElementById(`seller-product-${product.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    window.setTimeout(() => setHighlightProductId(null), 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products, error]);

  const handleEditImageSelect = (files: FileList | null) => {
    if (!files) return;
    const maxNew = 10 - editForm.existingImages.length - editForm.images.length;
    const newImages = Array.from(files).slice(0, Math.max(0, maxNew));
    const urls = newImages.map(file => URL.createObjectURL(file));
    setEditForm(prev => ({
      ...prev,
      images: [...prev.images, ...newImages],
      imageUrls: [...prev.imageUrls, ...urls],
    }));
  };

  const handleEditVideoSelect = (files: FileList | null) => {
    if (!files) return;
    const maxNew = 2 - editForm.existingVideos.length - editForm.videos.length;
    const newVideos = Array.from(files).slice(0, Math.max(0, maxNew));
    const urls = newVideos.map(file => URL.createObjectURL(file));
    setEditForm(prev => ({
      ...prev,
      videos: [...prev.videos, ...newVideos],
      videoUrls: [...prev.videoUrls, ...urls],
    }));
  };

  const removeEditImage = (index: number) => {
    URL.revokeObjectURL(editForm.imageUrls[index]);
    setEditForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
    }));
  };

  const removeEditVideo = (index: number) => {
    URL.revokeObjectURL(editForm.videoUrls[index]);
    setEditForm(prev => ({
      ...prev,
      videos: prev.videos.filter((_, i) => i !== index),
      videoUrls: prev.videoUrls.filter((_, i) => i !== index),
    }));
  };

  const removeEditExistingImage = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      existingImages: prev.existingImages.filter((_, i) => i !== index),
    }));
  };

  const removeEditExistingVideo = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      existingVideos: prev.existingVideos.filter((_, i) => i !== index),
    }));
  };

  const moveEditExistingImage = (index: number, dir: -1 | 1) => {
    setEditForm(prev => {
      const arr = [...prev.existingImages];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...prev, existingImages: arr };
    });
  };

  const moveEditNewImage = (index: number, dir: -1 | 1) => {
    setEditForm(prev => {
      const imgs = [...prev.images];
      const urls = [...prev.imageUrls];
      const j = index + dir;
      if (j < 0 || j >= urls.length) return prev;
      [imgs[index], imgs[j]] = [imgs[j], imgs[index]];
      [urls[index], urls[j]] = [urls[j], urls[index]];
      return { ...prev, images: imgs, imageUrls: urls };
    });
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct) return;

    const productId = editingProduct.id;

    if (!(editForm.name || '').trim()) {
      toast.warning('Product name is required.');
      return;
    }

    // Price / MRP / Stock are driven by variant rows. Normally these come from
    // the edit form, but if the form's in-memory variant list is empty (e.g. the
    // editor was opened and saved before the async hydration of existing variants
    // finished) we fall back to the variants already stored in the DB. This way a
    // legitimate edit is never blocked, and — because we skip the variant
    // delete/re-insert below when the form has none — existing variants are never
    // silently wiped.
    const editCombos = editProductDetails.variantCombinations || [];
    const variantsFromForm = editCombos.length > 0;

    let dbComboFallback: Array<{ price: string; mrp: string; stock: string }> = [];
    if (!variantsFromForm) {
      const { data: existingCombos } = await supabase
        .from('product_variants')
        .select('price, mrp, stock')
        .eq('product_id', productId)
        .eq('variant_type', 'combination');
      dbComboFallback = (existingCombos || []).map((v: any) => ({
        price: String(v.price ?? ''),
        mrp: String(v.mrp ?? ''),
        stock: String(v.stock ?? ''),
      }));
      if (dbComboFallback.length === 0) {
        toast.warning('Add at least one variant row (Generate Variant Combinations in Product Details) with SKU, Selling Price, MRP and Stock.');
        return;
      }
    }

    // Rows used purely to derive product-level price/MRP/stock.
    const pricingRows = variantsFromForm ? editCombos : dbComboFallback;

    // Mandatory: custom sizes need both a typed value AND a unit. The unit
    // is otherwise lost (product_variants has no separate size_unit column;
    // unit only survives concatenated into the `size` text).
    const editInvalidCustomSize = (editProductDetails.sizeVariants || []).some((row) => {
      if (row.sizeValue !== '__CUSTOM__') return false;
      if (!String(row.size || '').trim()) return true;
      const unit = String(row.customUnit || row.sizeUnit || 'NONE').toUpperCase();
      return !unit || unit === 'NONE';
    });
    if (editInvalidCustomSize) {
      toast.warning('Custom sizes need a value and a unit (e.g. 1.25 ml). Pick a unit other than "No Unit".');
      return;
    }

    const editInvalidRow = editCombos.some((row) => {
      const p = parseFloat(row.price || '0');
      const m = parseFloat(row.mrp || '0');
      const s = parseInt(row.stock || '0');
      if (!row.sku?.trim()) return true;
      if (!Number.isFinite(p) || p <= 0) return true;
      if (!Number.isFinite(m) || m <= 0) return true;
      if (p > m) return true;
      if (!Number.isFinite(s) || s < 1) return true;
      return false;
    });
    if (editInvalidRow) {
      toast.warning('Every variant row needs SKU, Selling Price, MRP (>= price) and Stock (at least 1).');
      return;
    }

    // Derive product-level price/MRP/stock from the cheapest variant.
    const cheapestEdit = pricingRows.reduce((min, c) => {
      const cp = parseFloat(c.price || '0');
      const mp = parseFloat((min?.price as string) || '0');
      return (!min || (cp > 0 && (mp <= 0 || cp < mp))) ? c : min;
    }, pricingRows[0]);
    const parsedPrice = parseFloat(cheapestEdit?.price || '0') || 0;
    const parsedMrp = parseFloat(cheapestEdit?.mrp || '0') || parsedPrice;
    const parsedStock = pricingRows.reduce((s, c) => s + (parseInt(c.stock || '0') || 0), 0);



    setActionLoadingByProduct((prev) => ({ ...prev, [productId]: 'update' }));

    try {
      const sellerId = user?.id || '';

      const uploadedImageUrls: string[] = [];
      for (const file of editForm.images) {
        const url = await uploadProductImage(file, sellerId);
        uploadedImageUrls.push(url);
      }

      const uploadedVideoUrls: string[] = [];
      for (const file of editForm.videos) {
        const url = await uploadProductVideo(file, sellerId);
        uploadedVideoUrls.push(url);
      }

      const allImages = [...editForm.existingImages, ...uploadedImageUrls];
      const allVideos = [...editForm.existingVideos, ...uploadedVideoUrls];

      const resolvedShippingStrategy = resolveShippingStrategy(editDomesticShipping);

      const updatePayload: Record<string, any> = {
        mrp: parsedMrp,
        price: parsedPrice,
        stock: Math.floor(parsedStock),
        videos: allVideos,
        shipping_type: resolvedShippingStrategy.shippingType,
        courier_partner: resolvedShippingStrategy.courierPartner,
        package_weight: Number(editProductDetails.packageWeight || 0),
        package_weight_unit_id: editProductDetails.packageWeightUnitId || null,
        package_length: Number(editProductDetails.packageLength || 0),
        package_length_unit_id: editProductDetails.packageLengthUnitId || null,
        package_width: Number(editProductDetails.packageWidth || 0),
        package_width_unit_id: editProductDetails.packageWidthUnitId || null,
        package_height: Number(editProductDetails.packageHeight || 0),
        package_height_unit_id: editProductDetails.packageHeightUnitId || null,
        packing_type_id: editProductDetails.packingTypeId || null,
        highlights: editProductDetails.highlights.map((h) => h.text).filter(Boolean),
        specifications: Object.fromEntries(
          editProductDetails.specifications.filter((s) => s.key.trim()).map((s) => [s.key.trim(), s.value.trim()])
        ),
        manufacturer_name: (editOffersData.manufacturer_name || editForm.manufacturer_name || '').trim(),
        manufacturer_country: (editOffersData.manufacturer_country || '').trim(),
        manufacturer_address: editForm.manufacturer_address || '',
        ingredients: serializeIngredients(editOffersData.ingredients),
        directions: (editOffersData.directions || '').trim(),
        important_note: (editOffersData.important_note || '').trim(),
        sku: (editForm.sku || '').trim().toUpperCase(),
        name: (editForm.name || '').trim(),
        short_description: (editForm.shortDescription || '').trim(),
        description: (editForm.description || '').trim(),
      };

      // If the product was previously approved, reset to pending re-approval
      const wasApproved = editingProduct.approvalStatus === 'approved';
      if (wasApproved) {
        updatePayload.approval_status = 'pending';
        updatePayload.is_active = false;
      }

      if (allImages.length > 0) {
        updatePayload.images = allImages;
        updatePayload.image_url = allImages[0];
      }

      updatePayload.seller_id = sellerId;

      const result = await updateProduct(productId, updatePayload);

      if (!result.success) {
        toast.error(result.error || 'Failed to update product. Please try again.');
        return;
      }

      // Save variants (delete + re-insert) if any variant combinations exist
      if (editProductDetails.variantCombinations.length > 0) {
        const variantRows = editProductDetails.variantCombinations.map((variant) => {
          const sizeValue = String(variant.sizeValue || '').trim();
          const sizeUnit = String(variant.sizeUnit || '').trim();
          const formattedSize = sizeUnit && sizeUnit !== 'NONE' ? `${sizeValue} ${sizeUnit}` : sizeValue;
          return {
            product_id: productId,
            variant_type: 'combination',
            size: formattedSize,
            size_system: String(variant.sizeSystem || '').trim() || null,
            size_value: sizeValue || null,
            color: String(variant.color || '').trim() || null,
            color_hex: String(variant.colorHex || '').trim() || null,
            sku: String(variant.sku || '').trim().toUpperCase(),
            price: Number(variant.price || 0),
            mrp: Number(variant.mrp || 0) || Number(variant.price || 0),
            stock: Number(variant.stock || 0),
            quantity: Number(variant.stock || 0),
            images: Array.isArray(variant.images) ? variant.images : [],
          };
        });

        await supabase.from('product_variants').delete().eq('product_id', productId);
        const { error: variantInsertError } = await supabase.from('product_variants').insert(variantRows);
        if (variantInsertError) {
          console.warn('Variant update failed:', variantInsertError.message);
        }
      }

      const offerRulesPayload = [
        ...editOffersData.specialDayOffers
          .filter((o) => o.specialDayName && o.discountPercent)
          .map((o) => ({
            type: 'special_day',
            specialDayName: o.specialDayName,
            discountPercent: Number(o.discountPercent),
            startTime: o.startDate ? new Date(o.startDate).toISOString() : null,
            endTime: o.endDate ? new Date(o.endDate).toISOString() : null,
            isActive: true,
          })),
        ...editOffersData.quantityOffers.map((o) => ({
          type: o.offerType,
          buyQuantity: o.offerType === 'buy_x_get_y' ? Number(o.buyQuantity || 0) : null,
          getQuantity: o.offerType === 'buy_x_get_y' ? Number(o.getQuantity || 0) : null,
          discountPercent: o.offerType === 'buy_x_get_y' ? Number(o.discountPercent || 0) : null,
          bundleMinQty: o.offerType === 'bundle_discount' ? Number(o.bundleMinQty || 0) : null,
          bundleDiscount: o.offerType === 'bundle_discount' ? Number(o.bundleDiscount || 0) : null,
          isActive: true,
        })),
      ];

      const offerResult = await updateProductOfferRules(productId, offerRulesPayload, sellerId);
      if (!offerResult.success) {
        toast.warning(offerResult.error || 'Product updated but offer rules failed to save.');
      }

      // Save ships_internationally flag
      const { error: intlFlagErr } = await supabase
        .from('products')
        .update({ ships_internationally: Boolean(editDomesticShipping.shipsInternationally) })
        .eq('id', productId);
      if (intlFlagErr) {
        toast.warning(`Product updated but international shipping flag failed to save: ${intlFlagErr.message}`);
        return;
      }

      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== productId) return p;
          const comboStocks = (editProductDetails.variantCombinations || []).map(
            (row) => parseInt(row.stock || '0', 10) || 0,
          );
          const stockFields = comboStocks.length > 0
            ? buildSellerStockFields(0, comboStocks)
            : buildSellerStockFields(Math.floor(parsedStock), []);
          return {
            ...p,
            name: (editForm.name || '').trim() || p.name,
            price: parsedPrice,
            ...stockFields,
            image: allImages[0] || p.image,
            ...(wasApproved ? { approvalStatus: 'pending', isActive: false } : {}),
          };
        }),
      );

      editForm.imageUrls.forEach(url => URL.revokeObjectURL(url));
      editForm.videoUrls.forEach(url => URL.revokeObjectURL(url));

      if (wasApproved) {
        toast.warning('Your product has been saved and sent for re-approval. It will go live once an admin approves the changes.');
      } else {
        toast.success('Product updated successfully.');
      }

      setShowEditSaveConfirm(false);
      setShowEditDialog(false);
      setEditingProduct(null);
    } finally {
      setActionLoadingByProduct((prev) => ({ ...prev, [productId]: null }));
    }
  };

  const filteredProducts = products.filter((product: SellerProduct) => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.id.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.publicId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.categoryName === filterCategory;
    const matchesStatus = filterStatus === 'all' || 
               (filterStatus === 'draft' && product.isDraft) ||
                         (filterStatus === 'active' && product.approvalStatus === 'approved' && product.inStock) ||
                         (filterStatus === 'pending' && product.approvalStatus === 'pending') ||
                         (filterStatus === 'rejected' && product.approvalStatus === 'rejected') ||
                         (filterStatus === 'outofstock' && !product.inStock);
    const matchesTab =
      (productTab === 'active'   && product.approvalStatus === 'approved' && !product.isDraft) ||
      (productTab === 'pending'  && product.approvalStatus === 'pending' && !product.isDraft) ||
      (productTab === 'draft'    && product.isDraft) ||
      (productTab === 'rejected' && product.approvalStatus === 'rejected');
    return matchesSearch && matchesCategory && matchesStatus && matchesTab;
  });

  const tabCounts = {
    active:   products.filter((p: SellerProduct) => p.approvalStatus === 'approved' && !p.isDraft).length,
    pending:  products.filter((p: SellerProduct) => p.approvalStatus === 'pending' && !p.isDraft).length,
    draft:    products.filter((p: SellerProduct) => p.isDraft).length,
    rejected: products.filter((p: SellerProduct) => p.approvalStatus === 'rejected').length,
  };

  const isListedProduct = (p: SellerProduct) =>
    p.approvalStatus === 'approved' && p.isActive && !p.isDraft;

  const lowStockProducts = products.filter((p: SellerProduct) => isListedProduct(p) && p.hasLowStock);
  const outOfStockProducts = products.filter((p: SellerProduct) => isListedProduct(p) && !p.inStock);

  const stats = {
    active: products.filter((p: SellerProduct) => p.approvalStatus === 'approved' && p.inStock).length,
    lowStock: lowStockProducts.length,
    outOfStock: outOfStockProducts.length,
    pending: products.filter((p: SellerProduct) => p.approvalStatus === 'pending').length,
    totalProducts: products.length,
  };

  const categories: string[] = Array.from(new Set(products.map((p: SellerProduct) => p.categoryName).filter(Boolean)));

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory, filterStatus, productTab]);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setPageLoading(true);
    // Simulate brief loading for smooth UX on large lists
    setTimeout(() => {
      setCurrentPage(page);
      setPageLoading(false);
      // Scroll to top of product table
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
  };

  const handleSearchSubmit = () => {
    setSearchQuery(searchDraft.trim());
  };

  const clearFilters = () => {
    setSearchDraft('');
    setSearchQuery('');
    setFilterCategory('all');
    setFilterStatus('all');
  };

  const goToCreateStep = (targetStep: 'basic' | 'media' | 'details' | 'condition' | 'returnpolicy' | 'domestic' | 'offers', draftId?: string) => {
    const suffix = draftId ? `?draft=${draftId}` : '';
    navigate(`/seller/products/new/${targetStep}${suffix}`);
  };

  const handleContinueDraft = (product: SellerProduct) => {
    goToCreateStep(product.resumeStep, product.id);
  };

  const handleStartNewListing = () => {
    setCreateFeedback(null);
    goToCreateStep('basic');
  };

  const handleOpenBulkListing = () => {
    navigate('/seller/dashboard#settings');
  };

  const handleSaveBasicAndNext = async () => {
    const sellerId = user?.id || '';
    if (!sellerId) {
      setCreateFeedback({ type: 'error', message: 'Seller session not found. Please login again.' });
      return;
    }

    if (!basicInfo.name.trim() || !basicInfo.categoryId) {
      setCreateFeedback({ type: 'error', message: 'Please complete Product Name and Category. (MRP / Selling Price / Stock are now entered in the Product Details step under Variant Rows.)' });
      return;
    }

    if (!basicInfo.brand_name.trim()) {
      setCreateFeedback({ type: 'error', message: 'Brand Name is required.' });
      return;
    }

    if (!basicInfo.shortDescription.trim()) {
      setCreateFeedback({ type: 'error', message: 'Short Description is required.' });
      return;
    }

    if (!basicInfo.description.trim() || basicInfo.description.trim().length < 30) {
      setCreateFeedback({ type: 'error', message: 'About Product must contain at least 30 characters.' });
      return;
    }

    if (/[\p{Extended_Pictographic}]/u.test(basicInfo.description)) {
      setCreateFeedback({ type: 'error', message: 'About Product should not include icons/emojis.' });
      return;
    }

    // (MRP / Selling Price validation moved to Product Details step — variant rows are the source of truth.)

    try {
      setCreating(true);
      setCreateFeedback(null);

      const selectedCountry = allCountries.find((country) => country.id === basicInfo.originCountryId);
      const result = await upsertProductDraftBasic({
        draftId: currentDraftId || undefined,
        seller_id: sellerId,
        name: basicInfo.name.trim(),
        sku: (basicInfo.sku || '').trim().toUpperCase(),
        category: basicInfo.categoryId,
        sub_category: basicInfo.subCategoryId || undefined,
        product_type: basicInfo.productTypeId || null,
        hsn_code: basicInfo.hsnCode || null,
        brand: basicInfo.brand_name.trim(),
        short_description: basicInfo.shortDescription.trim(),
        description: basicInfo.description.trim(),
        origin_country_id: basicInfo.originCountryId,
        origin_country: selectedCountry?.country_name || '',
        currency: selectedCountry?.currency_code || basicInfo.originCountryCurrency || 'INR',
        // Placeholders — real values are derived from variant rows when the Product
        // Details step is saved. Stored as 0 here so the draft row stays valid.
        mrp: 0,
        price: 0,
        stock: 0,
        is_cod_available: basicInfo.isCodAvailable !== false,
        item_condition: basicInfo.itemCondition,
      });

      if (result.error || !result.data?.id) {
        setCreateFeedback({ type: 'error', message: result.error || 'Failed to save draft.' });
        return;
      }

      setCreateFeedback({
        type: 'success',
        message: `Draft saved successfully. Draft ID: ${result.data.public_product_id || result.data.id}`,
      });
      goToCreateStep('media', result.data.id);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveMediaAndNext = async () => {
    if (!currentDraftId) {
      setCreateFeedback({ type: 'error', message: 'Draft not found. Please complete Product Details & Pricing first.' });
      goToCreateStep('basic');
      return;
    }

    const totalImages = mediaData.imageUrls.length;
    if (totalImages < 5) {
      setCreateFeedback({ type: 'error', message: `Please upload at least 5 product images (${totalImages} uploaded).` });
      return;
    }

    try {
      setCreating(true);
      setCreateFeedback(null);

      const sellerId = user?.id || '';
      const uploadedImageUrls: string[] = [];
      const uploadedVideoUrls: string[] = [];
      const totalFiles = mediaData.images.length + mediaData.videos.length;
      let uploadedCount = 0;

      for (const file of mediaData.images) {
        uploadedCount++;
        setUploadProgress({
          current: uploadedCount,
          total: Math.max(totalFiles, 1),
          percent: Math.round((uploadedCount / Math.max(totalFiles, 1)) * 100),
          fileName: file.name,
        });
        const url = await uploadProductImage(file, sellerId);
        uploadedImageUrls.push(url);
      }

      for (const file of mediaData.videos) {
        uploadedCount++;
        setUploadProgress({
          current: uploadedCount,
          total: Math.max(totalFiles, 1),
          percent: Math.round((uploadedCount / Math.max(totalFiles, 1)) * 100),
          fileName: file.name,
        });
        const url = await uploadProductVideo(file, sellerId);
        uploadedVideoUrls.push(url);
      }

      setUploadProgress(null);

      // Keep only real URLs (existing Supabase URLs); drop browser blob: previews
      const existingImageUrls = mediaData.imageUrls.filter(u => !u.startsWith('blob:'));
      const existingVideoUrls = mediaData.videoUrls.filter(u => !u.startsWith('blob:'));
      const finalImages = [...existingImageUrls, ...uploadedImageUrls];
      const finalVideos = [...existingVideoUrls, ...uploadedVideoUrls];

      const { error: updateError } = await updateProduct(currentDraftId, {
        seller_id: sellerId,
        image_url: finalImages[0] || '',
        images: finalImages,
        videos: finalVideos,
      });

      if (updateError) {
        setCreateFeedback({ type: 'error', message: updateError });
        return;
      }

      setCreateFeedback({ type: 'success', message: 'Media saved successfully.' });
      goToCreateStep('details', currentDraftId);
    } finally {
      setCreating(false);
      setUploadProgress(null);
    }
  };

  const handleSaveDetailsAndNext = async () => {
    if (!currentDraftId) {
      setCreateFeedback({ type: 'error', message: 'Draft not found. Please complete previous steps first.' });
      goToCreateStep('basic');
      return;
    }

    if (productDetails.variantCombinations.length === 0) {
      setCreateFeedback({
        type: 'error',
        message: 'Click the "Generate Variant Combinations" button below, then fill SKU, Selling Price, MRP and Stock for each row before continuing.',
      });
      return;
    }

    // Mandatory: custom sizes must have a typed value AND a unit; preset
    // sizes (XL/L/M/...) and Free Size are valid on their own and intentionally
    // carry no unit. The sentinel '__CUSTOM__' is the only reliable marker for
    // "user is in custom mode" — anything else is a preset or Free Size value.
    const invalidCustomSize = productDetails.sizeVariants.some((row) => {
      if (row.sizeValue !== '__CUSTOM__') return false;
      if (!String(row.size || '').trim()) return true;
      const unit = String(row.customUnit || row.sizeUnit || 'NONE').toUpperCase();
      return !unit || unit === 'NONE';
    });
    if (invalidCustomSize) {
      setCreateFeedback({ type: 'error', message: 'Custom sizes need a value and a unit. Free Size does not need a unit.' });
      return;
    }

    const missingColorHex = productDetails.colorVariants.some((row) => row.color.trim() && !/^#[0-9A-Fa-f]{6}$/.test(row.colorHex || ''));
    if (missingColorHex) {
      setCreateFeedback({ type: 'error', message: 'Pick a color swatch for every color name. Color is mandatory.' });
      return;
    }

    const highlightText = (productDetails.highlights[0]?.text || '').trim();
    if (!highlightText) {
      setCreateFeedback({ type: 'error', message: 'Product highlight is required.' });
      return;
    }
    if (highlightText.length > 400) {
      setCreateFeedback({ type: 'error', message: 'Product highlight must be 400 characters or fewer.' });
      return;
    }

    const validSpecs = productDetails.specifications.filter((sp) => sp.key.trim() && sp.value.trim());
    if (validSpecs.length === 0) {
      setCreateFeedback({ type: 'error', message: 'Add at least one product specification (attribute and value).' });
      return;
    }

    const hasInvalidRows = productDetails.variantCombinations.some((row) => {
      if (!row.sku.trim()) return true;
      const price = parseFloat(row.price || '0');
      const variantMrp = parseFloat(row.mrp || '0');
      const stock = parseInt(row.stock || '0');
      if (!Number.isFinite(price) || price <= 0) return true;
      if (!Number.isFinite(variantMrp) || variantMrp <= 0) return true;
      if (price > variantMrp) return true;
      if (!Number.isFinite(stock) || stock < 0) return true;
      return false;
    });

    if (hasInvalidRows) {
      setCreateFeedback({ type: 'error', message: 'Each variant row needs SKU, Selling Price, MRP (>= price) and Stock.' });
      return;
    }

    const packageWeight = parseFloat(productDetails.packageWeight || '0');
    const packageLength = parseFloat(productDetails.packageLength || '0');
    const packageWidth = parseFloat(productDetails.packageWidth || '0');
    const packageHeight = parseFloat(productDetails.packageHeight || '0');

    if (
      !productDetails.packingTypeId
      || !productDetails.packageWeightUnitId
      || !productDetails.packageLengthUnitId
      || !productDetails.packageWidthUnitId
      || !productDetails.packageHeightUnitId
      || !Number.isFinite(packageWeight)
      || !Number.isFinite(packageLength)
      || !Number.isFinite(packageWidth)
      || !Number.isFinite(packageHeight)
      || packageWeight <= 0
      || packageLength <= 0
      || packageWidth <= 0
      || packageHeight <= 0
    ) {
      setCreateFeedback({ type: 'error', message: 'Packing type and all package values/units are mandatory.' });
      return;
    }

    const normalizedSkus = productDetails.variantCombinations.map((row) => row.sku.trim().toUpperCase());
    if (new Set(normalizedSkus).size !== normalizedSkus.length) {
      setCreateFeedback({ type: 'error', message: 'Duplicate SKU found in variant rows.' });
      return;
    }

    const specificationsObj: Record<string, string> = {};
    for (const spec of productDetails.specifications) {
      const key = spec.key.trim();
      const value = spec.value.trim();
      if (key && value) specificationsObj[key] = value;
    }

    const highlights = productDetails.highlights
      .map((item) => item.text.trim())
      .filter(Boolean);

    try {
      setCreating(true);
      setCreateFeedback(null);

      const saveResult = await saveProductDraftDetails({
        productId: currentDraftId,
        highlights,
        specifications: specificationsObj,
        packing_type_id: productDetails.packingTypeId,
        package_weight: packageWeight,
        package_weight_unit_id: productDetails.packageWeightUnitId,
        package_length: packageLength,
        package_length_unit_id: productDetails.packageLengthUnitId,
        package_width: packageWidth,
        package_width_unit_id: productDetails.packageWidthUnitId,
        package_height: packageHeight,
        package_height_unit_id: productDetails.packageHeightUnitId,
        variantCombinations: productDetails.variantCombinations.map((row) => ({
          size_system: row.sizeSystem,
          size_value: row.sizeValue,
          size_unit: row.sizeUnit,
          color: row.color,
          color_hex: row.colorHex,
          sku: row.sku,
          price: parseFloat(row.price || '0'),
          mrp: parseFloat(row.mrp || '0') || parseFloat(row.price || '0'),
          stock: parseInt(row.stock || '0'),
          images: row.images || [],
        })),
      });

      if (!saveResult.success) {
        setCreateFeedback({ type: 'error', message: saveResult.error || 'Failed to save product details.' });
        return;
      }

      setCreateFeedback({ type: 'success', message: 'Product details saved successfully.' });
      if (isUsedOrRefurbished) {
        goToCreateStep('condition', currentDraftId);
      } else {
        navigate(`/seller/products/new/domestic?draft=${currentDraftId}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSaveConditionAndNext = async () => {
    if (!currentDraftId) {
      setCreateFeedback({ type: 'error', message: 'Draft not found. Please complete previous steps first.' });
      goToCreateStep('basic');
      return;
    }

    if (!conditionDetails.usage_duration) {
      setCreateFeedback({ type: 'error', message: 'Please select how long the product has been used.' });
      return;
    }
    if (!conditionDetails.working_condition) {
      setCreateFeedback({ type: 'error', message: 'Please select the working condition.' });
      return;
    }
    if (!conditionDetails.ownership_type) {
      setCreateFeedback({ type: 'error', message: 'Please select ownership type.' });
      return;
    }
    if (conditionDetails.has_scratches && conditionDetails.scratch_images.length === 0) {
      setCreateFeedback({ type: 'error', message: 'Please upload at least one photo of scratches/damage.' });
      return;
    }
    if (basicInfo.itemCondition === 'refurbished' && !conditionDetails.refurbished_by) {
      setCreateFeedback({ type: 'error', message: 'Please select who refurbished this product.' });
      return;
    }

    try {
      setCreating(true);
      setCreateFeedback(null);
      await saveConditionDetails(currentDraftId, conditionDetails);
      setCreateFeedback({ type: 'success', message: 'Condition details saved.' });
      goToCreateStep('returnpolicy', currentDraftId);
    } catch (err: any) {
      setCreateFeedback({ type: 'error', message: err?.message || 'Failed to save condition details.' });
    } finally {
      setCreating(false);
    }
  };

  const handleSaveReturnPolicyAndNext = async () => {
    if (!currentDraftId) {
      setCreateFeedback({ type: 'error', message: 'Draft not found. Please complete previous steps first.' });
      goToCreateStep('basic');
      return;
    }

    if (!returnPolicy.return_condition_agreed) {
      setCreateFeedback({ type: 'error', message: 'Please agree to the return condition statement.' });
      return;
    }
    if (!returnPolicy.seller_responsibility_agreed) {
      setCreateFeedback({ type: 'error', message: 'Please agree to the seller responsibility statement.' });
      return;
    }

    try {
      setCreating(true);
      setCreateFeedback(null);
      await saveReturnPolicy(currentDraftId, returnPolicy);
      setCreateFeedback({ type: 'success', message: 'Return policy saved.' });
      goToCreateStep('domestic', currentDraftId);
    } catch (err: any) {
      setCreateFeedback({ type: 'error', message: err?.message || 'Failed to save return policy.' });
    } finally {
      setCreating(false);
    }
  };

  const handleSaveShippingAndNext = async () => {
    if (!currentDraftId) {
      setCreateFeedback({ type: 'error', message: 'Draft not found. Please complete previous steps first.' });
      goToCreateStep('basic');
      return;
    }

    try {
      setCreating(true);
      setCreateFeedback(null);

      // Ensure shipping_type is 'shiprocket' and ships_internationally flag on the product row
      const { error: shippingTypeErr } = await supabase
        .from('products')
        .update({ shipping_type: 'shiprocket', courier_partner: 'shiprocket', ships_internationally: Boolean(domesticShipping.shipsInternationally) })
        .eq('id', currentDraftId);
      if (shippingTypeErr) {
        setCreateFeedback({ type: 'error', message: shippingTypeErr.message });
        return;
      }

      setCreateFeedback({ type: 'success', message: 'Shipping saved successfully.' });
      goToCreateStep('offers', currentDraftId);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveOffersAndSubmit = async () => {
    if (!currentDraftId) {
      setCreateFeedback({ type: 'error', message: 'Draft not found. Please complete previous steps first.' });
      goToCreateStep('basic');
      return;
    }

    try {
      setCreating(true);
      setCreateFeedback(null);

      const sellerId = user?.id || '';

      const offerRulesPayload = [
        ...offersData.specialDayOffers
          .filter((o) => o.specialDayName && o.discountPercent)
          .map((o) => ({
            type: 'special_day',
            specialDayName: o.specialDayName,
            discountPercent: Number(o.discountPercent),
            startTime: o.startDate ? new Date(o.startDate).toISOString() : null,
            endTime: o.endDate ? new Date(o.endDate).toISOString() : null,
            isActive: true,
          })),
        ...offersData.quantityOffers
          .filter((o) => o.offerType)
          .map((o) => ({
            type: o.offerType,
            buyQuantity: o.offerType === 'buy_x_get_y' ? Number(o.buyQuantity || 0) : null,
            getQuantity: o.offerType === 'buy_x_get_y' ? Number(o.getQuantity || 0) : null,
            discountPercent: o.offerType === 'buy_x_get_y' ? Number(o.discountPercent || 0) : null,
            bundleMinQty: o.offerType === 'bundle_discount' ? Number(o.bundleMinQty || 0) : null,
            bundleDiscount: o.offerType === 'bundle_discount' ? Number(o.bundleDiscount || 0) : null,
            isActive: true,
          })),
      ];

      const offerResult = await updateProductOfferRules(currentDraftId, offerRulesPayload, sellerId);
      if (!offerResult.success) {
        setCreateFeedback({ type: 'error', message: offerResult.error || 'Failed to save offer rules.' });
        return;
      }

      // Derive product-level stock from the variant rows the seller actually
      // filled in (Product Details step is the source of truth). The previous
      // code read `basicInfo.stock`, which is never populated during the
      // create wizard, so it overwrote the correct stock (already set by
      // saveProductDraftDetails) with 0. See AGENT_RULES Rule D.
      const derivedFinalStock = productDetails.variantCombinations.reduce(
        (sum, row) => sum + (parseInt(row.stock || '0', 10) || 0),
        0,
      );

      const finalizeResult = await updateProduct(currentDraftId, {
        seller_id: sellerId,
        stock: derivedFinalStock,
        shipping_type: resolveShippingStrategy(domesticShipping).shippingType,
        courier_partner: resolveShippingStrategy(domesticShipping).courierPartner,
        manufacturer_name: (offersData.manufacturer_name || '').trim(),
        manufacturer_country: (offersData.manufacturer_country || '').trim(),
        ingredients: serializeIngredients(offersData.ingredients),
        directions: (offersData.directions || '').trim(),
        important_note: (offersData.important_note || '').trim(),
      });

      if (!finalizeResult.success) {
        setCreateFeedback({ type: 'error', message: finalizeResult.error || 'Failed to finalize listing.' });
        return;
      }

      // Wizard succeeded: invalidate cached list, reset wizard state, and
      // force a fresh DB read so the inventory tabs/stock/price reflect
      // what was just written (variant rows are the source of truth and
      // the cached row may still show the Step-1 placeholder of stock=0).
      if (sellerId) delete sellerProductsCache[sellerId];
      resetWizard();
      setHydratedDraftId('');
      setReloadProductsKey((n) => n + 1);

      navigate('/seller/products');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!isCreateFlow) return;
    const stepToIndex: Record<string, number> = isUsedOrRefurbished
      ? { basic: 0, media: 1, details: 2, condition: 3, returnpolicy: 4, domestic: 5, offers: 6 }
      : { basic: 0, media: 1, details: 2, domestic: 3, offers: 4 };
    setWizardStep(stepToIndex[step || 'basic'] ?? 0);
  }, [isCreateFlow, step, isUsedOrRefurbished]);

  if (isCreateFlow) {
    return (
      <>
        <div className="max-w-[980px] mx-auto w-full px-3 sm:px-6 py-2 sm:py-4">
          <div className="flex items-center justify-between mb-2 gap-2">
            <button
              onClick={() => navigate('/seller/products')}
              aria-label="Back to listing"
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-[10px] sm:text-xs font-semibold text-gray-700 uppercase tracking-wide">Step {Math.min(wizardStep + 1, WIZARD_STEPS.length)} of {WIZARD_STEPS.length}</div>
          </div>

          {createFeedback && (
            <div className={`mb-2 rounded-sm border px-3 py-2 text-[11px] font-medium ${
              createFeedback.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {createFeedback.message}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 md:p-6">
            {WIZARD_STEPS[wizardStep] === 'Basic Info & Price' && (
              <BasicInfoPriceStep
                data={basicInfo}
                onChange={setBasicInfo}
                disabled={creating}
                lockOriginCountry
              />
            )}

            {WIZARD_STEPS[wizardStep] === 'Media' && (
              <MediaStep
                data={mediaData}
                onChange={setMediaData}
                disabled={creating}
                uploadProgress={uploadProgress}
              />
            )}

            {WIZARD_STEPS[wizardStep] === 'Product Details' && (
              <ProductDetailsStep
                data={productDetails}
                onChange={setProductDetails}
                disabled={creating}
                baseMrp={basicInfo.mrp}
                baseSellingPrice={basicInfo.price}
                productTypeSlug={basicInfo.productTypeSlug}
                subCategorySlug={basicInfo.subCategorySlug}
                categorySlug={basicInfo.categorySlug}
              />
            )}

            {WIZARD_STEPS[wizardStep] === 'Condition Details' && (
              <ConditionDetailsStep
                data={conditionDetails}
                onChange={setConditionDetails}
                itemCondition={basicInfo.itemCondition}
                disabled={creating}
              />
            )}

            {WIZARD_STEPS[wizardStep] === 'Return & Refund Policy' && (
              <ReturnPolicyStep
                data={returnPolicy}
                onChange={setReturnPolicy}
                disabled={creating}
              />
            )}

            {WIZARD_STEPS[wizardStep] === 'Shipping' && (
              <DomesticShippingStep
                data={domesticShipping}
                onChange={setDomesticShipping}
                originCountryId={basicInfo.originCountryId}
                disabled={creating}
              />
            )}

            {WIZARD_STEPS[wizardStep] === 'Offers & Discounts' && (
              <OffersStep
                data={offersData}
                onChange={setOffersData}
                disabled={creating}
                allCountries={allCountries}
              />
            )}

            <div className="flex justify-end pt-6 mt-6 border-t border-gray-200">
              {WIZARD_STEPS[wizardStep] === 'Basic Info & Price' && (
                <button
                  onClick={handleSaveBasicAndNext}
                  disabled={creating}
                  className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold font-[Arial,sans-serif] disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Next'}
                </button>
              )}
              {WIZARD_STEPS[wizardStep] === 'Media' && (
                <button
                  onClick={handleSaveMediaAndNext}
                  disabled={creating}
                  className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold font-[Arial,sans-serif] disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Next'}
                </button>
              )}
              {WIZARD_STEPS[wizardStep] === 'Product Details' && (
                <button
                  onClick={handleSaveDetailsAndNext}
                  disabled={creating}
                  className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold font-[Arial,sans-serif] disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Next'}
                </button>
              )}
              {WIZARD_STEPS[wizardStep] === 'Condition Details' && (
                <button
                  onClick={handleSaveConditionAndNext}
                  disabled={creating}
                  className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold font-[Arial,sans-serif] disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Next'}
                </button>
              )}
              {WIZARD_STEPS[wizardStep] === 'Return & Refund Policy' && (
                <button
                  onClick={handleSaveReturnPolicyAndNext}
                  disabled={creating}
                  className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold font-[Arial,sans-serif] disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Next'}
                </button>
              )}
              {WIZARD_STEPS[wizardStep] === 'Shipping' && (
                <button
                  onClick={handleSaveShippingAndNext}
                  disabled={creating}
                  className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold font-[Arial,sans-serif] disabled:opacity-50"
                >
                  {creating ? 'Saving...' : 'Next'}
                </button>
              )}
              {WIZARD_STEPS[wizardStep] === 'Offers & Discounts' && (
                <button
                  onClick={handleSaveOffersAndSubmit}
                  disabled={creating}
                  className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold font-[Arial,sans-serif] disabled:opacity-50"
                >
                  {creating ? 'Submitting...' : 'Save & Submit For Review'}
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ToastContainer toasts={toast.toasts} dismiss={toast.dismiss} />
      {/* Header — flush top, no blank space */}
      <div className="flex items-center justify-between gap-2 px-2 sm:px-8 pt-0 sm:pt-4 pb-1.5">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => onNavigate('seller-dashboard')}
              className="p-1 sm:p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-md hover:bg-blue-100 transition-colors flex-shrink-0"
              aria-label="Back to dashboard"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold text-gray-900 truncate leading-tight">Product Inventory</h1>
              <p className="text-[10px] sm:text-xs text-gray-500 truncate leading-tight">Manage your product catalog</p>
            </div>
          </div>
          {/* Pickup Warehouse - desktop only (hidden on mobile) */}
          <button
            onClick={() => onNavigate('seller-warehouse')}
            className="hidden sm:flex bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-3 sm:px-5 py-2 rounded-lg transition-all shadow-sm items-center justify-center gap-1.5 text-xs"
          >
            <MapPin size={14} /> Pickup Warehouse
          </button>
          {/* Bulk Listing + Add Product — mobile header */}
          <div className="sm:hidden flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleOpenBulkListing}
              className="bg-white border border-blue-600 text-blue-700 font-semibold px-2 py-1 rounded-md flex items-center gap-1 text-[11px] shadow-sm"
            >
              <Upload size={12} /> Bulk
            </button>
            <button
              onClick={handleStartNewListing}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 text-[11px] shadow-sm"
            >
              <Plus size={12} /> Add
            </button>
          </div>
        </div>

        <div className="px-2 sm:px-8 py-1.5 sm:py-4">

        {createFeedback && (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium flex items-center justify-between gap-4 ${
              createFeedback.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <span>{createFeedback.message}</span>
            <button
              type="button"
              onClick={() => setCreateFeedback(null)}
              className="text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Inventory Summary — compact blue tiles on mobile, full cards on desktop */}
        <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5 sm:gap-4 mb-2 sm:mb-6">
          <StatCard label="Total" value={stats.totalProducts.toString()} subtitle="Active & inactive products" loading={loading} />
          <StatCard label="Active" value={stats.active.toString()} subtitle="Currently listed" loading={loading} />
          <StatCard
            label="Out of Stock"
            value={stats.outOfStock.toString()}
            subtitle={stats.outOfStock > 0 ? 'Tap to view & restock' : 'Needs restock'}
            loading={loading}
            onClick={stats.outOfStock > 0 ? () => setInventoryModal('out') : undefined}
          />
          <StatCard
            label="Low Stock"
            value={stats.lowStock.toString()}
            subtitle={stats.lowStock > 0 ? 'Tap to view & restock' : 'Below 10 units'}
            loading={loading}
            onClick={stats.lowStock > 0 ? () => setInventoryModal('low') : undefined}
          />
        </div>

        {/* Low / Out of stock affected-products modal */}
        {inventoryModal && (() => {
          const isOut = inventoryModal === 'out';
          const list = isOut ? outOfStockProducts : lowStockProducts;
          return (
            <div
              className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
              onClick={() => setInventoryModal(null)}
            >
              <div
                className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={18} className={isOut ? 'text-red-500' : 'text-orange-500'} />
                    <h3 className="text-base font-bold text-gray-900">
                      {isOut ? 'Out of Stock' : 'Low Stock'}
                      <span className="ml-1.5 text-sm font-semibold text-gray-500">({list.length})</span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInventoryModal(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="overflow-y-auto p-2 sm:p-3">
                  {list.length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-500">
                      No {isOut ? 'out of stock' : 'low stock'} products.
                    </div>
                  ) : (
                    list.map((product) => (
                      <div key={product.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                        <div className="w-11 h-11 rounded-md bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-100">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.nextElementSibling as HTMLElement | null; if (fb) fb.style.display = 'flex'; }}
                            />
                          ) : null}
                          <div className="flex-col items-center justify-center text-gray-400" style={{ display: product.image ? 'none' : 'flex' }}><Package size={16} /></div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500 truncate">{product.sku || product.publicId || 'ID pending'}{product.categoryName ? ` · ${product.categoryName}` : ''}</p>
                        </div>
                        <span className={`text-xs font-semibold whitespace-nowrap ${isOut ? 'text-red-600' : 'text-orange-600'}`}>
                          {isOut ? 'Out of stock' : product.hasVariants && product.variantCount > 1
                            ? `${product.stockCount} / variant`
                            : `${product.stockCount} left`}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setInventoryModal(null); openEditDialog(product); }}
                          className="flex-shrink-0 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-2.5 py-1.5"
                        >
                          Restock
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Search + Filter (Export removed; same line on all sizes) */}
        <div className="mb-3 sm:mb-6">
          <div className="flex flex-row items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search products..."
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchSubmit();
                  }
                }}
                className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 sm:py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowFilterPanel((prev) => !prev)}
              className={`h-[38px] sm:h-[42px] px-2.5 sm:px-3 border rounded-lg bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium flex-shrink-0 ${showFilterPanel ? 'border-blue-500 text-blue-600' : 'border-gray-200'}`}
              aria-label="Toggle filters"
            >
              <Filter size={15} />
              <span className="hidden sm:inline">Filter</span>
            </button>
            {/* Bulk Listing + Add Product (desktop — mobile has them in the header) */}
            <button
              onClick={handleOpenBulkListing}
              className="hidden sm:flex h-[42px] bg-white border border-blue-600 text-blue-700 hover:bg-blue-50 font-semibold px-4 rounded-lg transition-all shadow-sm items-center gap-1.5 text-sm whitespace-nowrap"
            >
              <Upload size={15} /> Bulk Listing
            </button>
            <button
              onClick={handleStartNewListing}
              className="hidden sm:flex h-[42px] bg-green-600 hover:bg-green-700 text-white font-semibold px-4 rounded-lg transition-all shadow-sm items-center gap-1.5 text-sm whitespace-nowrap"
            >
              <Plus size={15} /> Add Product
            </button>
          </div>

          {showFilterPanel && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white border border-gray-200 rounded-lg p-3">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Categories</option>
                {categories.map((cat: string) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
                <option value="outofstock">Out of Stock</option>
              </select>
            </div>
          )}

          {(searchQuery || filterCategory !== 'all' || filterStatus !== 'all') && (
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-red-500 hover:underline px-1 pt-2 whitespace-nowrap"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Segmented pill tabs — Active / Pending / Draft / Rejected */}
        <div className="mb-3 sm:mb-5 flex justify-center">
          <div
            role="tablist"
            aria-label="Product status"
            className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full p-1 shadow-sm w-full max-w-md sm:max-w-2xl"
          >
            {([
              { key: 'active'   as const, label: 'Active',   shortLabel: 'Active',  count: tabCounts.active,   activeBg: 'bg-green-600',  ring: 'focus-visible:ring-green-500/40' },
              { key: 'pending'  as const, label: 'Pending Review', shortLabel: 'Pending', count: tabCounts.pending, activeBg: 'bg-blue-600',  ring: 'focus-visible:ring-blue-500/40' },
              { key: 'draft'    as const, label: 'Draft',    shortLabel: 'Draft',   count: tabCounts.draft,    activeBg: 'bg-amber-500',  ring: 'focus-visible:ring-amber-500/40' },
              { key: 'rejected' as const, label: 'Rejected', shortLabel: 'Rejected', count: tabCounts.rejected, activeBg: 'bg-red-600',    ring: 'focus-visible:ring-red-500/40' },
            ]).map((tab) => {
              const isActive = productTab === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setProductTab(tab.key)}
                  className={`flex-1 min-w-0 px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 whitespace-nowrap ${tab.ring} ${
                    isActive
                      ? `${tab.activeBg} text-white shadow-md scale-[1.02]`
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/70'
                  }`}
                >
                  <span className="inline-flex items-center gap-1 sm:gap-1.5">
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span
                      className={`inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-[16px] sm:h-[18px] px-1 sm:px-1.5 rounded-full text-[9px] sm:text-[10px] font-bold ${
                        isActive ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-2 sm:mb-4">
          {loading ? (
            <div className="h-3.5 sm:h-4 w-40 sm:w-56 rounded bg-gray-200 animate-pulse" />
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 w-full">
              <AlertCircle size={18} />
              {error}
              <button onClick={() => window.location.reload()} className="ml-auto underline hover:no-underline">
                Retry
              </button>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-gray-500">
              Showing <span className="font-semibold text-gray-900">{Math.min((currentPage - 1) * PRODUCTS_PER_PAGE + 1, filteredProducts.length)}–{Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length)}</span> of <span className="font-semibold text-gray-900">{filteredProducts.length}</span> products
            </p>
          )}
        </div>

        {/* Product Table */}
        {error ? null : loading ? (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* Mobile skeleton cards — match real card layout */}
            <div className="sm:hidden divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`m-load-${i}`} className="px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-11 h-11 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <div className="h-3 w-11/12 rounded bg-gray-200 animate-pulse" />
                          <div className="h-3 w-2/3 rounded bg-gray-200 animate-pulse" />
                          <div className="h-2.5 w-20 rounded bg-gray-100 animate-pulse" />
                        </div>
                        <div className="h-4 w-12 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-2.5 w-12 rounded bg-gray-100 animate-pulse" />
                        <div className="h-2.5 w-14 rounded bg-gray-100 animate-pulse" />
                        <div className="h-2.5 w-20 rounded bg-gray-100 animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="h-6 w-20 ml-auto col-start-2 rounded-md bg-gray-200 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop skeleton table */}
            <div className="hidden sm:block">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 grid grid-cols-12 gap-3">
                {['Product','SKU','Category','Price','Stock','Status'].map((h) => (
                  <div key={h} className={`h-3 rounded bg-gray-200 ${h === 'Product' ? 'col-span-4' : 'col-span-1'} `} />
                ))}
                <div className="col-span-1" />
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`d-load-${i}`} className="px-4 py-4 border-b border-gray-100 grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="h-3 w-11/12 rounded bg-gray-200 animate-pulse" />
                      <div className="h-2.5 w-1/2 rounded bg-gray-100 animate-pulse" />
                    </div>
                  </div>
                  <div className="col-span-1 h-3 rounded bg-gray-100 animate-pulse" />
                  <div className="col-span-1 h-3 rounded bg-gray-100 animate-pulse" />
                  <div className="col-span-1 h-3 rounded bg-gray-100 animate-pulse" />
                  <div className="col-span-1 h-3 rounded bg-gray-100 animate-pulse" />
                  <div className="col-span-1 h-4 rounded-full bg-gray-200 animate-pulse" />
                  <div className="col-span-3 flex justify-end gap-2">
                    <div className="h-7 w-16 rounded-md bg-gray-200 animate-pulse" />
                    <div className="h-7 w-16 rounded-md bg-gray-200 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
            <Package size={24} className="text-gray-400 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-gray-900 mb-1">No Products Found</h3>
            <p className="text-gray-500 text-sm mb-4">Try adjusting your filters</p>
            <button 
              onClick={() => { setSearchQuery(''); setFilterCategory('all'); setFilterStatus('all'); setProductTab('active'); }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-all text-sm"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div key={productTab} className="bg-white border border-gray-200 rounded-lg overflow-hidden animate-tab-fade">
            {/* Desktop Table — hidden on mobile */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">SKU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageLoading ? (
                    Array.from({ length: Math.min(PRODUCTS_PER_PAGE, 5) }).map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        <td colSpan={7} className="px-4 py-4">
                          <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : paginatedProducts.map((product: SellerProduct) => {
                    const statusConfig = product.isDraft
                      ? { label: 'Draft', bg: 'bg-amber-100', text: 'text-amber-700' }
                      : product.approvalStatus === 'approved' && product.isActive
                      ? { label: 'Active', bg: 'bg-green-100', text: 'text-green-700' }
                      : product.approvalStatus === 'rejected'
                      ? { label: 'Rejected', bg: 'bg-red-100', text: 'text-red-700' }
                      : product.approvalStatus === 'pending'
                      ? { label: 'Pending', bg: 'bg-blue-100', text: 'text-blue-700' }
                      : { label: 'Inactive', bg: 'bg-gray-100', text: 'text-gray-600' };

                    return (
                      <tr
                        key={product.id}
                        id={`seller-product-${product.id}`}
                        className={`hover:bg-gray-50 transition-colors ${
                          highlightProductId === product.id ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                              {product.image ? (
                                <img src={product.image} className="w-full h-full object-cover" alt={product.name} onError={(e) => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.nextElementSibling as HTMLElement | null; if (fb) fb.style.display = 'flex'; }} />
                              ) : null}
                              <div className="flex-col items-center justify-center text-gray-400" style={{ display: product.image ? 'none' : 'flex' }}><Package size={16} /></div>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{product.name}</p>
                              <p className="text-xs text-gray-500 truncate">{product.publicId || 'ID pending'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell"><span className="text-sm text-gray-600">{product.sku || '—'}</span></td>
                        <td className="px-4 py-3"><span className="text-sm text-gray-600">{product.categoryName || '—'}</span></td>
                        <td className="px-4 py-3"><span className="text-sm font-medium text-gray-900">{formatSellerAmount(product.price, product.currency || 'INR')}</span></td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium ${!product.inStock ? 'text-red-600' : product.hasLowStock ? 'text-orange-600' : 'text-gray-900'}`}>
                            {formatSellerStockLabel(product)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>{statusConfig.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setActionMenuOpenId(actionMenuOpenId === product.id ? null : product.id); }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                              disabled={!!actionLoadingByProduct[product.id]}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {actionMenuOpenId === product.id && (
                              <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1" onClick={(e) => e.stopPropagation()}>
                                {product.isDraft && (
                                  <button onClick={() => { setActionMenuOpenId(null); handleContinueDraft(product); }} className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium">Complete Listing</button>
                                )}
                                <button onClick={() => { setActionMenuOpenId(null); openEditDialog(product); }} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                  {actionLoadingByProduct[product.id] === 'update' ? 'Saving...' : 'Modify'}
                                </button>
                                {product.inStock && !product.isDraft && (
                                  <button onClick={() => { setActionMenuOpenId(null); openOutOfStockDialog(product); }} className="w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50">
                                    {actionLoadingByProduct[product.id] === 'out_of_stock' ? 'Updating stock...' : 'Mark Out of Stock'}
                                  </button>
                                )}
                                <button onClick={() => { setActionMenuOpenId(null); openDeleteDialog(product); }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                  {actionLoadingByProduct[product.id] === 'delete' ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List — visible only on small screens */}
            <div className="sm:hidden divide-y divide-gray-100">
              {pageLoading ? (
                Array.from({ length: Math.min(PRODUCTS_PER_PAGE, 5) }).map((_, i) => (
                  <div key={`m-skeleton-${i}`} className="px-4 py-4"><div className="h-16 bg-gray-100 rounded-lg animate-pulse" /></div>
                ))
              ) : paginatedProducts.map((product: SellerProduct) => {
                const statusConfig = product.isDraft
                  ? { label: 'Draft', bg: 'bg-amber-100', text: 'text-amber-700' }
                  : product.approvalStatus === 'approved' && product.isActive
                  ? { label: 'Active', bg: 'bg-green-100', text: 'text-green-700' }
                  : product.approvalStatus === 'rejected'
                  ? { label: 'Rejected', bg: 'bg-red-100', text: 'text-red-700' }
                  : product.approvalStatus === 'pending'
                  ? { label: 'Pending', bg: 'bg-blue-100', text: 'text-blue-700' }
                  : { label: 'Inactive', bg: 'bg-gray-100', text: 'text-gray-600' };

                return (
                  <div
                    key={product.id}
                    id={`seller-product-${product.id}`}
                    className={`px-3 py-2.5 ${
                      highlightProductId === product.id ? 'bg-blue-50 ring-2 ring-inset ring-blue-300 rounded-lg' : ''
                    }`}
                  >
                    {/* Top row: image + info + status */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-11 h-11 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {product.image ? (
                          <img src={product.image} className="w-full h-full object-cover" alt={product.name} onError={(e) => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.nextElementSibling as HTMLElement | null; if (fb) fb.style.display = 'flex'; }} />
                        ) : null}
                        <div className="flex-col items-center justify-center text-gray-400" style={{ display: product.image ? 'none' : 'flex' }}><Package size={14} /></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] leading-snug font-medium text-gray-900 line-clamp-2">{product.name}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{product.publicId || 'ID pending'}</p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${statusConfig.bg} ${statusConfig.text}`}>{statusConfig.label}</span>
                        </div>
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                          <span className="font-semibold text-gray-900">{formatSellerAmount(product.price, product.currency || 'INR')}</span>
                          <span>Stock: {product.inStock ? formatSellerStockLabel(product) : <span className="text-red-600 font-semibold">0</span>}</span>
                          {product.sku && <span className="truncate max-w-[140px]">SKU: {product.sku}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons row — compact pills, right aligned */}
                    <div className="flex items-center justify-end gap-1.5 mt-1.5">
                      {product.isDraft ? (
                        <>
                          <button
                            onClick={() => handleContinueDraft(product)}
                            className="px-2 py-1 bg-blue-600 text-white rounded-md text-[10px] font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-1"
                          >
                            <Pencil size={10} />Complete
                          </button>
                          <button
                            onClick={() => openDeleteDialog(product)}
                            className="px-2 py-1 bg-red-600 text-white rounded-md text-[10px] font-semibold hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => openEditDialog(product)}
                            className="px-2 py-1 bg-blue-600 text-white rounded-md text-[10px] font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-1"
                          >
                            <Pencil size={10} />Modify
                          </button>
                          {product.inStock && (
                            <button
                              onClick={() => openOutOfStockDialog(product)}
                              disabled={actionLoadingByProduct[product.id] === 'out_of_stock'}
                              className="px-2 py-1 bg-amber-600 text-white rounded-md text-[10px] font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
                            >
                              {actionLoadingByProduct[product.id] === 'out_of_stock' ? 'Updating...' : 'Mark Out Of Stock'}
                            </button>
                          )}
                          <button
                            onClick={() => openDeleteDialog(product)}
                            className="px-2 py-1 bg-red-600 text-white rounded-md text-[10px] font-semibold hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50/50">
                <p className="text-xs text-gray-500">
                  Page <span className="font-semibold text-gray-900">{currentPage}</span> of <span className="font-semibold text-gray-900">{totalPages}</span>
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || pageLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  {(() => {
                    const pages: (number | 'ellipsis')[] = [];
                    if (totalPages <= 7) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (currentPage > 3) pages.push('ellipsis');
                      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                      if (currentPage < totalPages - 2) pages.push('ellipsis');
                      pages.push(totalPages);
                    }
                    return pages.map((p, idx) =>
                      p === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-gray-400">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => handlePageChange(p)}
                          disabled={pageLoading}
                          className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                            currentPage === p
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                          } disabled:opacity-40`}
                        >
                          {p}
                        </button>
                      )
                    );
                  })()}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || pageLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {showDeleteDialog && productToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-4" onClick={closeDeleteDialog}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-red-600 mb-3">Delete Product Permanently</h3>
              <p className="text-sm text-gray-600 mb-2">
                Are you sure you want to delete <span className="font-semibold text-gray-900">{productToDelete.name}</span>?
              </p>
              <p className="text-xs text-red-500 font-medium mb-6">
                This action is permanent and cannot be undone. The product will be removed from your store completely.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeDeleteDialog}
                  disabled={actionLoadingByProduct[productToDelete.id] === 'delete'}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteProduct}
                  disabled={actionLoadingByProduct[productToDelete.id] === 'delete'}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoadingByProduct[productToDelete.id] === 'delete' ? (
                    <><Loader2 size={14} className="animate-spin" /> Deleting...</>
                  ) : (
                    <>Delete</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {showOutOfStockDialog && productToMarkOutOfStock && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-4" onClick={closeOutOfStockDialog}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-amber-700 mb-3">Mark Product Out Of Stock</h3>
              <p className="text-sm text-gray-600 mb-2">
                Mark <span className="font-semibold text-gray-900">{productToMarkOutOfStock.name}</span> out of stock?
              </p>
              <p className="text-xs text-gray-500 mb-6">
                This sets the product and all of its variants to zero inventory. You can restore stock later by modifying the listing.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={closeOutOfStockDialog}
                  disabled={actionLoadingByProduct[productToMarkOutOfStock.id] === 'out_of_stock'}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleMarkOutOfStock(productToMarkOutOfStock)}
                  disabled={actionLoadingByProduct[productToMarkOutOfStock.id] === 'out_of_stock'}
                  className="px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoadingByProduct[productToMarkOutOfStock.id] === 'out_of_stock' ? (
                    <><Loader2 size={14} className="animate-spin" /> Updating...</>
                  ) : (
                    <>Mark Out Of Stock</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {showEditDialog && editingProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-2 sm:p-4" onClick={closeEditDialog}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-2.5 sm:p-4 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2.5 sticky top-0 bg-white pb-2 border-b border-gray-100 z-10">
                <h3 className="text-[11px] sm:text-xs font-bold text-gray-900 leading-snug pr-2">
                  Edit Product — <span className="font-semibold">{editingProduct.name}</span>
                </h3>
                <button onClick={closeEditDialog} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={16} /></button>
              </div>

              {(() => {
                const saving = actionLoadingByProduct[editingProduct.id] === 'update';
                const SectionSave = (
                  <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      data-no-global-confirm="true"
                      onClick={() => setShowEditSaveConfirm(true)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-md text-[10px] font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save size={11} /> Save
                    </button>
                  </div>
                );
                const sectionWrap = "mb-2.5 border border-gray-200 rounded-lg p-2.5";
                const sectionTitle = "text-[11px] sm:text-xs font-bold text-gray-900 mb-2";
                const labelCls = "block text-[10px] font-semibold text-gray-500 mb-0.5";
                const inputCls = "w-full border border-gray-200 rounded-md px-2 py-1.5 text-[11px] focus:outline-none focus:border-blue-500";
                const originName = allCountries.find((c) => c.id === editOriginCountryId)?.country_name || '';

                return (
                  <>
                    {/* 1. Product Name */}
                    <div className={sectionWrap}>
                      <h4 className={sectionTitle}>Product Information</h4>
                      <label className={labelCls}>Product Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter product name"
                        className={inputCls}
                      />
                      {SectionSave}
                    </div>

                    {/* 2. Category / Subcategory / Product Type — read-only */}
                    <div className={sectionWrap}>
                      <h4 className={sectionTitle}>Category</h4>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { lbl: 'Category',     val: editCategoryNames.categoryName },
                          { lbl: 'Subcategory',  val: editCategoryNames.subCategoryName },
                          { lbl: 'Product Type', val: editCategoryNames.productTypeName },
                        ].map((c) => (
                          <div key={c.lbl} className="bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
                            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">{c.lbl}</p>
                            <p className="text-[11px] font-medium text-gray-800 truncate">{c.val || 'NA'}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. SKU / HSN */}
                    <div className={sectionWrap}>
                      <h4 className={sectionTitle}>Identifiers</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>SKU</label>
                          <input
                            type="text"
                            value={editForm.sku}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                            placeholder="e.g., BZD-XXX-001"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>HSN</label>
                          <input
                            type="text"
                            value={editExtras.hsn || ''}
                            placeholder="NA"
                            readOnly
                            className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`}
                          />
                        </div>
                      </div>
                      {SectionSave}
                    </div>

                    {/* 4. Brand / Short Desc / About / Pricing / Stock / Origin */}
                    <div className={sectionWrap}>
                      <h4 className={sectionTitle}>Brand & Description</h4>
                      <div className="space-y-2">
                        <div>
                          <label className={labelCls}>Brand</label>
                          <input
                            type="text"
                            value={editExtras.brand || ''}
                            placeholder="NA"
                            readOnly
                            className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Short Description</label>
                          <input
                            type="text"
                            value={editForm.shortDescription}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, shortDescription: e.target.value }))}
                            placeholder="Brief one-line summary"
                            maxLength={200}
                            className={inputCls}
                          />
                          <p className="text-[9px] text-gray-400 mt-0.5">{editForm.shortDescription.length}/200</p>
                        </div>
                        <div>
                          <label className={labelCls}>About Product</label>
                          <textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Detailed description..."
                            rows={3}
                            className={`${inputCls} resize-y`}
                          />
                        </div>
                      </div>
                      {SectionSave}
                    </div>

                    {/* 5. Pricing & Stock */}
                    <div className={sectionWrap}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className={sectionTitle + ' mb-0'}>Pricing & Stock</h4>
                        <button
                          type="button"
                          onClick={() => setIsPriceEditing((prev) => !prev)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700"
                        >
                          <Pencil size={10} /> {isPriceEditing ? 'Done' : 'Edit'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Origin Country</label>
                          <input
                            type="text"
                            value={originName || 'NA'}
                            readOnly
                            className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-2">
                        MRP, Selling Price and Stock are managed per variant under <strong>Product Variants &rarr; Variant Rows</strong> below.
                      </p>
                      {SectionSave}
                    </div>

                    {/* 6. Media */}
                    <div className={sectionWrap}>
                      <h4 className={sectionTitle}>Media</h4>

                      <label className={labelCls}>Product Images <span className="text-gray-400 font-normal">(use ◀ ▶ to reorder)</span></label>
                      {(editForm.existingImages.length + editForm.imageUrls.length) === 0 && (
                        <p className="text-[10px] text-gray-400 mb-1.5">No images yet</p>
                      )}
                      {editForm.existingImages.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {editForm.existingImages.map((url, idx) => (
                            <div key={`existing-${idx}`} className="relative w-14 h-14 rounded-md overflow-hidden border border-gray-200 group">
                              <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { const c = e.currentTarget.parentElement; if (c) c.style.display = 'none'; }} />
                              <span className="absolute top-0 left-0 bg-black/60 text-white text-[8px] font-bold px-1 rounded-br-md">{idx + 1}</span>
                              <button type="button" onClick={() => removeEditExistingImage(idx)} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-md p-0.5"><X size={10} /></button>
                              <div className="absolute bottom-0 inset-x-0 flex justify-between bg-black/55">
                                <button type="button" disabled={idx === 0} onClick={() => moveEditExistingImage(idx, -1)} className="text-white text-[10px] px-1 disabled:opacity-30">◀</button>
                                <button type="button" disabled={idx === editForm.existingImages.length - 1} onClick={() => moveEditExistingImage(idx, 1)} className="text-white text-[10px] px-1 disabled:opacity-30">▶</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {editForm.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {editForm.imageUrls.map((url, idx) => (
                            <div key={`new-${idx}`} className="relative w-14 h-14 rounded-md overflow-hidden border-2 border-green-300 group">
                              <img src={url} alt="" className="w-full h-full object-cover" />
                              <span className="absolute top-0 left-0 bg-green-600 text-white text-[8px] font-bold px-1 rounded-br-md">NEW</span>
                              <button type="button" onClick={() => removeEditImage(idx)} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-md p-0.5"><X size={10} /></button>
                              <div className="absolute bottom-0 inset-x-0 flex justify-between bg-black/55">
                                <button type="button" disabled={idx === 0} onClick={() => moveEditNewImage(idx, -1)} className="text-white text-[10px] px-1 disabled:opacity-30">◀</button>
                                <button type="button" disabled={idx === editForm.imageUrls.length - 1} onClick={() => moveEditNewImage(idx, 1)} className="text-white text-[10px] px-1 disabled:opacity-30">▶</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <input ref={editImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleEditImageSelect(e.target.files)} />
                      <button type="button" onClick={() => editImageInputRef.current?.click()} className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 border border-blue-200 rounded-md px-2 py-1">
                        <Pencil size={10} /> Add / Change Images
                      </button>

                      <div className="mt-2.5">
                        <label className={labelCls}>Product Videos</label>
                        {(editForm.existingVideos.length + editForm.videoUrls.length) === 0 && (
                          <p className="text-[10px] text-gray-400 mb-1.5">No videos yet</p>
                        )}
                        {editForm.existingVideos.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {editForm.existingVideos.map((url, idx) => (
                              <div key={`existing-video-${idx}`} className="relative w-20 h-14 rounded-md overflow-hidden border border-gray-200 bg-black">
                                <video src={url} className="w-full h-full object-cover" muted />
                                <button type="button" onClick={() => removeEditExistingVideo(idx)} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-md p-0.5"><X size={10} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                        {editForm.videoUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {editForm.videoUrls.map((url, idx) => (
                              <div key={`new-video-${idx}`} className="relative w-20 h-14 rounded-md overflow-hidden border-2 border-green-300 bg-black">
                                <video src={url} className="w-full h-full object-cover" muted />
                                <button type="button" onClick={() => removeEditVideo(idx)} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-md p-0.5"><X size={10} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                        <input ref={editVideoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => handleEditVideoSelect(e.target.files)} />
                        <button type="button" onClick={() => editVideoInputRef.current?.click()} className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 border border-blue-200 rounded-md px-2 py-1">
                          <Video size={10} /> Add / Change Videos
                        </button>
                      </div>
                      {SectionSave}
                    </div>

                    {/* 7. Variants & Package */}
                    <div className={sectionWrap + ' text-[11px]'}>
                      <h4 className={sectionTitle}>Variants & Package</h4>
                      <ProductDetailsStep
                        data={editProductDetails}
                        onChange={setEditProductDetails}
                        disabled={saving}
                        baseMrp={editForm.mrp}
                        baseSellingPrice={String(editingProduct.price ?? '')}
                        productTypeSlug={editCategorySlugs.productTypeSlug}
                        subCategorySlug={editCategorySlugs.subCategorySlug}
                        categorySlug={editCategorySlugs.categorySlug}
                      />
                      {SectionSave}
                    </div>

                    {/* 8. Offers */}
                    <div className={sectionWrap + ' text-[11px]'}>
                      <h4 className={sectionTitle}>Offers</h4>
                      <OffersStep
                        data={editOffersData}
                        onChange={setEditOffersData}
                        disabled={saving}
                        isPrimeSeller
                        allCountries={allCountries}
                      />
                      {SectionSave}
                    </div>

                    {/* 9. Shipping */}
                    <div className={sectionWrap + ' text-[11px] space-y-4'}>
                      <h4 className={sectionTitle}>Shipping</h4>
                      <DomesticShippingStep
                        data={editDomesticShipping}
                        onChange={setEditDomesticShipping}
                        originCountryId={editOriginCountryId}
                        disabled={saving}
                      />
                      {!editOriginCountryId && (
                        <p className="text-[10px] text-orange-600">
                          Origin country is not set for this product.
                        </p>
                      )}
                      {SectionSave}
                    </div>
                  </>
                );
              })()}

              {/* Footer */}
              <div className="flex gap-2 justify-end border-t pt-2 sticky bottom-0 bg-white">
                <button
                  onClick={closeEditDialog}
                  disabled={actionLoadingByProduct[editingProduct.id] === 'update'}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  data-no-global-confirm="true"
                  onClick={() => setShowEditSaveConfirm(true)}
                  disabled={actionLoadingByProduct[editingProduct.id] === 'update'}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Save size={12} /> Save All
                </button>
              </div>

              {showEditSaveConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[130] p-4" onClick={() => actionLoadingByProduct[editingProduct.id] !== 'update' && setShowEditSaveConfirm(false)}>
                  <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Product Update</h3>
                    <p className="text-sm text-gray-600 mb-6">Save all changes to price, product details, offers, media, and shipping now?</p>
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => setShowEditSaveConfirm(false)}
                        disabled={actionLoadingByProduct[editingProduct.id] === 'update'}
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUpdateProduct}
                        disabled={actionLoadingByProduct[editingProduct.id] === 'update'}
                        data-no-global-confirm="true"
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {actionLoadingByProduct[editingProduct.id] === 'update' ? (
                          <><Loader2 size={14} className="animate-spin" /> Saving...</>
                        ) : (
                          <><Save size={14} /> Confirm Save</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
        )}

        </div>{/* end content wrapper */}

      {/* Create Product Modal – Wizard */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 rounded-3xl p-4 sm:p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-semibold text-gray-900">Create New Product</h3>
              <button
                onClick={() => { resetWizard(); setShowCreateModal(false); setShowCreateConfirm(false); setCreateFeedback(null); }}
                className="text-gray-500 hover:text-gray-900 transition-colors"
                disabled={creating}
              >
                <X size={24} />
              </button>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
              {WIZARD_STEPS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  disabled={creating}
                  onClick={() => {
                    if (idx < wizardStep) setWizardStep(idx);
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all ${
                    idx === wizardStep
                      ? 'bg-blue-600 text-white shadow-md'
                      : idx < wizardStep
                      ? 'bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200'
                      : 'bg-gray-100 text-gray-400 cursor-default'
                  }`}
                >
                  {idx < wizardStep ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold
                      border-current">{idx + 1}</span>
                  )}
                  {label}
                </button>
              ))}
            </div>

            {/* Feedback message */}
            {createFeedback && (
              <div className={`rounded-xl border px-4 py-3 text-sm font-medium mb-4 ${
                createFeedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {createFeedback.message}
              </div>
            )}

            {/* Step Content */}
            <div className="min-h-[320px]">
              {WIZARD_STEPS[wizardStep] === 'Basic Info & Price' && (
                <BasicInfoPriceStep
                  data={basicInfo}
                  onChange={setBasicInfo}
                  disabled={creating}
                  lockOriginCountry
                />
              )}
              {WIZARD_STEPS[wizardStep] === 'Media' && (
                <MediaStep
                  data={mediaData}
                  onChange={setMediaData}
                  disabled={creating}
                  uploadProgress={uploadProgress}
                />
              )}
              {WIZARD_STEPS[wizardStep] === 'Product Details' && (
                <ProductDetailsStep
                  data={productDetails}
                  onChange={setProductDetails}
                  disabled={creating}
                  baseSellingPrice={basicInfo.price}
                  productTypeSlug={basicInfo.productTypeSlug}
                  subCategorySlug={basicInfo.subCategorySlug}
                  categorySlug={basicInfo.categorySlug}
                />
              )}
              {WIZARD_STEPS[wizardStep] === 'Condition Details' && (
                <ConditionDetailsStep
                  data={conditionDetails}
                  onChange={setConditionDetails}
                  itemCondition={basicInfo.itemCondition}
                  disabled={creating}
                />
              )}
              {WIZARD_STEPS[wizardStep] === 'Return & Refund Policy' && (
                <ReturnPolicyStep
                  data={returnPolicy}
                  onChange={setReturnPolicy}
                  disabled={creating}
                />
              )}
              {WIZARD_STEPS[wizardStep] === 'Shipping' && (
                <DomesticShippingStep
                  data={domesticShipping}
                  onChange={setDomesticShipping}
                  originCountryId={basicInfo.originCountryId}
                  disabled={creating}
                />
              )}
              {WIZARD_STEPS[wizardStep] === 'Offers & Discounts' && (
                <OffersStep
                  data={offersData}
                  onChange={setOffersData}
                  disabled={creating}
                  allCountries={allCountries}
                />
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setWizardStep(s => Math.max(0, s - 1))}
                disabled={wizardStep === 0 || creating}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={16} /> Back
              </button>

              {wizardStep < WIZARD_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep(s => Math.min(WIZARD_STEPS.length - 1, s + 1))}
                  disabled={creating}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateConfirm(true)}
                  disabled={creating}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
                >
                  <Save size={16} /> Submit for Review
                </button>
              )}
            </div>

            {/* Confirm Dialog */}
            {showCreateConfirm && (
              <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[130] p-4" onClick={() => !creating && setShowCreateConfirm(false)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Product Creation</h3>
                  <p className="text-sm text-gray-600 mb-6">Submit this product for admin review now?</p>
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCreateConfirm(false)}
                      disabled={creating}
                      className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateProduct}
                      disabled={creating}
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {creating ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {creating ? 'Creating...' : 'Confirm Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const StatCard = ({ label, value, subtitle, loading, onClick }: { label: string; value: string; subtitle?: string; loading?: boolean; onClick?: () => void }) => {
  const clickable = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
      className={`bg-blue-600 sm:bg-white border border-blue-700 sm:border-gray-200 rounded-md sm:rounded-lg px-1.5 py-1 sm:p-4 transition-all min-w-0 shadow-sm sm:shadow-none ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-white/70 sm:hover:ring-0 sm:hover:border-blue-400 sm:hover:shadow-md active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500' : ''}`}
    >
      <p className="text-[9px] sm:text-xs font-medium text-blue-100 sm:text-gray-500 mb-0 sm:mb-1 truncate leading-tight">{label}</p>
      {loading ? (
        <div className="h-3.5 sm:h-7 w-7 sm:w-16 rounded bg-white/30 sm:bg-gray-200 animate-pulse mt-0 sm:mt-1" />
      ) : (
        <h3 className="text-sm sm:text-2xl font-bold text-white sm:text-gray-900 leading-tight">{value}</h3>
      )}
      {/* Subtitle hidden on mobile to keep cards compact */}
      {subtitle && <p className="hidden sm:block text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
};

export default SellerProductListing;
