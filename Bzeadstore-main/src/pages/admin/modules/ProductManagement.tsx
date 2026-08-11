import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, X, RefreshCw, AlertCircle, CheckCircle2, XCircle, Eye,
  Download, ExternalLink, ImageIcon, Package, Building2, CreditCard,
  Clock, Tag, Loader2, FileText,
} from 'lucide-react';
import type { Product } from '../../../types';
import {
  fetchProducts as fetchProductsFromDB,
  approveProduct,
  rejectProduct,
  toggleProductStatus,
  fetchCategories,
  checkProductMissingFields,
} from '../../../lib/productService';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { supabase } from '../../../lib/supabase';
import { TableSkeleton, ListSkeleton } from '../../../components/common/Skeleton';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

interface CountryOption {
  id: string;
  country_name: string;
  country_code?: string | null;
  iso2?: string | null;
  currency_code?: string | null;
}

interface CountrySellingPriceRow {
  id?: number;
  country_id: string;
  selling_price: string;
  markup_percent?: string;
  markup_mrp?: string;
}

const APPROVAL_BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  draft:    'bg-gray-100 text-gray-600 border-gray-200',
};

const MISSING_LABELS: Record<string, string> = {
  hsn_code: 'HSN',
  sku: 'SKU',
  package_weight: 'WEIGHT',
  package_length: 'LENGTH',
  package_width: 'WIDTH',
  package_height: 'HEIGHT',
};

async function downloadProductImage(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('fetch failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export const ProductManagement: React.FC = () => {
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [categoryList, setCategoryList] = useState<{ id: string; name: string }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 50,
    total: 0,
  });
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [showSellingPriceModal, setShowSellingPriceModal] = useState(false);
  const [sellingPriceProduct, setSellingPriceProduct] = useState<Product | null>(null);
  const [defaultSellingPrice, setDefaultSellingPrice] = useState('');
  const [defaultSellingCurrency, setDefaultSellingCurrency] = useState('INR');
  const [defaultSellingCountryId, setDefaultSellingCountryId] = useState('');
  const [countrySellingPrices, setCountrySellingPrices] = useState<CountrySellingPriceRow[]>([]);
  const [newCountryId, setNewCountryId] = useState('');
  const [newCountryMarkup, setNewCountryMarkup] = useState('');
  const [newCountryPrice, setNewCountryPrice] = useState('');
  const [newCountryMrp, setNewCountryMrp] = useState('');
  const [savingSellingPrices, setSavingSellingPrices] = useState(false);
  const [sellingPriceError, setSellingPriceError] = useState<string | null>(null);
  const [measurementUnitCodeById, setMeasurementUnitCodeById] = useState<Record<string, string>>({});
  const [approvalCounts, setApprovalCounts] = useState<Record<string, number>>({
    all: 0, pending: 0, approved: 0, rejected: 0,
  });

  const loadApprovalCounts = useCallback(async () => {
    const statuses = ['all', 'pending', 'approved', 'rejected'] as const;
    const results = await Promise.all(
      statuses.map(async (status) => {
        const { count } = await fetchProductsFromDB({
          category: categoryFilter || undefined,
          approvalStatus: status === 'all' ? undefined : status,
          search: debouncedSearch || undefined,
          limit: 1,
          offset: 0,
          excludeDrafts: true,
        });
        return [status, count || 0] as const;
      })
    );
    setApprovalCounts(Object.fromEntries(results));
  }, [categoryFilter, debouncedSearch]);

  // Extra data loaded only when the Product Details modal opens
  interface DetailsBundle {
    seller: { full_name?: string; email?: string; phone?: string; shop_address?: string; created_at?: string; is_verified?: boolean } | null;
    variants: Array<{ id: string; sku?: string; variant_type?: string; size?: string; size_value?: string; color?: string; price?: number; mrp?: number; stock?: number }>;
  }
  const [detailsBundle, setDetailsBundle] = useState<DetailsBundle>({ seller: null, variants: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchCategories().then(({ data }) => setCategoryList(data as { id: string; name: string }[]));
    supabase
      .from('countries')
      .select('id, country_name, country_code, iso2, currency_code')
      .eq('is_active', true)
      .order('country_name', { ascending: true })
      .then(({ data, error: countriesError }) => {
        if (countriesError) {
          setError(countriesError.message || 'Failed to load countries');
          return;
        }
        setCountryOptions((data || []) as CountryOption[]);
      });

    supabase
      .from('measurement_units')
      .select('id, code')
      .then(({ data, error: unitsError }) => {
        if (unitsError) {
          setError(unitsError.message || 'Failed to load measurement units');
          return;
        }
        const map: Record<string, string> = {};
        (data || []).forEach((unit: any) => {
          map[String(unit.id)] = String(unit.code || '').toUpperCase();
        });
        setMeasurementUnitCodeById(map);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadApprovalCounts(); }, [loadApprovalCounts]);

  // Load seller + variants when Product Details modal opens
  useEffect(() => {
    if (!showDetails || !selectedProduct) {
      setDetailsBundle({ seller: null, variants: [] });
      return;
    }
    let cancelled = false;
    const productId = selectedProduct.productId || selectedProduct.id;
    setDetailsLoading(true);
    (async () => {
      try {
        const [sellerRes, variantsRes] = await Promise.all([
          selectedProduct.seller_id
            ? supabase.from('profiles')
                .select('full_name, email, phone, shop_address, created_at, is_verified')
                .eq('id', selectedProduct.seller_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from('product_variants')
            .select('id, sku, variant_type, size, size_value, color, price, mrp, stock')
            .eq('product_id', productId)
            .order('created_at', { ascending: true }),
        ]);
        if (cancelled) return;
        setDetailsBundle({
          seller: (sellerRes?.data as any) || null,
          variants: (variantsRes?.data as any[]) || [],
        });
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showDetails, selectedProduct]);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return 'N/A';
    try {
      return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch { return String(iso); }
  };

  const getWeightInKg = (rawWeight?: number, weightUnitId?: string) => {
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight <= 0) return null;

    const unitCode = String(weightUnitId ? measurementUnitCodeById[weightUnitId] || '' : '').toUpperCase();
    if (!unitCode || unitCode === 'KG' || unitCode === 'KGS') return weight;
    if (unitCode === 'G' || unitCode === 'GM' || unitCode === 'GRAM') return weight / 1000;
    if (unitCode === 'MG') return weight / 1000000;
    if (unitCode === 'LB' || unitCode === 'LBS') return weight * 0.453592;
    if (unitCode === 'OZ') return weight * 0.0283495;
    return weight;
  };

  const formatWeightInKg = (rawWeight?: number, weightUnitId?: string) => {
    const weightInKg = getWeightInKg(rawWeight, weightUnitId);
    if (weightInKg == null) return 'N/A';

    if (weightInKg >= 1) {
      return weightInKg.toFixed(2).replace(/\.00$/, '');
    }
    return weightInKg.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  };

  const resolveCountryCurrency = (countryId?: string | null, fallbackCurrency = 'INR') => {
    const normalizedCountryId = String(countryId || '').trim();
    if (!normalizedCountryId) {
      return String(fallbackCurrency || 'INR').toUpperCase();
    }
    const code = String(
      countryOptions.find((country) => country.id === normalizedCountryId)?.currency_code || ''
    ).trim().toUpperCase();
    return code || String(fallbackCurrency || 'INR').toUpperCase();
  };

  const resolveOriginCurrencyForProduct = (product: Product) => {
    const originCountryId = String(product.origin_country_id || '').trim();
    if (originCountryId) {
      return resolveCountryCurrency(originCountryId, product.currency || 'INR');
    }

    const defaultCountryId = String(product.default_selling_country_id || '').trim();
    if (defaultCountryId) {
      return resolveCountryCurrency(defaultCountryId, product.currency || 'INR');
    }

    return String(product.currency || 'INR').toUpperCase();
  };

  const openSellingPriceModal = async (product: Product) => {
    // Use saved default_selling_price if > 0, otherwise fall back to base product price
    const baseDefaultPrice = (product.default_selling_price && product.default_selling_price > 0)
      ? product.default_selling_price
      : (product.price || 0);
    const enforcedCurrency = resolveOriginCurrencyForProduct(product);
    setSellingPriceProduct(product);
    setDefaultSellingPrice(String(baseDefaultPrice));
    setDefaultSellingCurrency(enforcedCurrency);
    setDefaultSellingCountryId(String(product.default_selling_country_id || product.origin_country_id || ''));
    setCountrySellingPrices([]);
    setNewCountryId('');
    setNewCountryMarkup('');
    setNewCountryPrice('');
    setSellingPriceError(null);
    setShowSellingPriceModal(true);

    const productId = product.productId || product.id;
    const { data, error: countryPriceError } = await supabase
      .from('product_country_selling_prices')
      .select('id, country_id, selling_price, markup_percent, markup_mrp')
      .eq('product_id', productId)
      .order('country_id', { ascending: true });

    if (countryPriceError) {
      setSellingPriceError(countryPriceError.message || 'Failed to load country selling prices');
      return;
    }

    setCountrySellingPrices(
      (data || []).map((row: any) => {
        const rowPrice = Number(row.selling_price ?? 0);
        const dbMarkup = row.markup_percent != null ? String(row.markup_percent) : null;
        const calcMarkup = baseDefaultPrice > 0
          ? (((rowPrice - baseDefaultPrice) / baseDefaultPrice) * 100).toFixed(2)
          : '';
        return {
          id: row.id,
          country_id: String(row.country_id || ''),
          selling_price: String(row.selling_price ?? ''),
          markup_percent: dbMarkup ?? calcMarkup,
          markup_mrp: row.markup_mrp != null ? String(row.markup_mrp) : '',
        };
      })
    );
  };

  const closeSellingPriceModal = () => {
    setShowSellingPriceModal(false);
    setSellingPriceProduct(null);
    setDefaultSellingPrice('');
    setDefaultSellingCurrency('INR');
    setDefaultSellingCountryId('');
    setCountrySellingPrices([]);
    setNewCountryId('');
    setNewCountryMarkup('');
    setNewCountryPrice('');
    setNewCountryMrp('');
    setSavingSellingPrices(false);
    setSellingPriceError(null);
  };

  const getBasePriceForMarkup = () => {
    const base = Number(defaultSellingPrice);
    if (Number.isFinite(base) && base > 0) return base;
    const fallback = Number(sellingPriceProduct?.price ?? 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  };

  const calculateMarkup = (priceValue: number) => {
    const base = getBasePriceForMarkup();
    if (!Number.isFinite(priceValue) || base <= 0) return '';
    return (((priceValue - base) / base) * 100).toFixed(2);
  };

  const toTwoDecimals = (value: number) => (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);

  const suggestMajorUnitValue = (rawValue: string) => {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric < 1000 || !Number.isInteger(numeric)) return '';
    return toTwoDecimals(numeric / 100);
  };

  const addCountrySellingPriceRow = () => {
    const parsedPrice = Number(newCountryPrice);
    if (!newCountryId) {
      setSellingPriceError('Please select a country before adding');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setSellingPriceError('Country price must be a non-negative number');
      return;
    }
    if (countrySellingPrices.some((row) => row.country_id === newCountryId)) {
      setSellingPriceError('Country already exists in the list');
      return;
    }

    setCountrySellingPrices((prev) => [
      ...prev,
      {
        country_id: newCountryId,
        selling_price: String(parsedPrice),
        markup_percent: newCountryMarkup || calculateMarkup(parsedPrice),
        markup_mrp: newCountryMrp,
      },
    ]);
    setNewCountryId('');
    setNewCountryMarkup('');
    setNewCountryPrice('');
    setNewCountryMrp('');
    setSellingPriceError(null);
  };

  const updateCountrySellingPriceRow = (
    index: number,
    field: keyof CountrySellingPriceRow,
    value: string,
  ) => {
    setCountrySellingPrices((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        if (field === 'selling_price') {
          const parsedPrice = Number(value);
          const newMarkup = Number.isFinite(parsedPrice) ? calculateMarkup(parsedPrice) : null;
          const mrpBase = Number(sellingPriceProduct?.mrp || 0);
          const parsedNewMarkup = Number(newMarkup);
          const nextMrp = newMarkup !== null && mrpBase > 0 && Number.isFinite(parsedNewMarkup)
            ? ((mrpBase * (100 + parsedNewMarkup)) / 100).toFixed(2)
            : row.markup_mrp;
          return {
            ...row,
            selling_price: value,
            markup_percent: newMarkup ?? row.markup_percent,
            markup_mrp: nextMrp,
          };
        }

        if (field === 'markup_percent') {
          const parsedMarkup = Number(value);
          const base = getBasePriceForMarkup();
          const nextPrice = Number.isFinite(parsedMarkup) && base > 0
            ? ((base * (100 + parsedMarkup)) / 100).toFixed(2)
            : row.selling_price;
          const mrpBase = Number(sellingPriceProduct?.mrp || 0);
          const nextMrp = Number.isFinite(parsedMarkup) && mrpBase > 0
            ? ((mrpBase * (100 + parsedMarkup)) / 100).toFixed(2)
            : row.markup_mrp;
          return {
            ...row,
            markup_percent: value,
            selling_price: nextPrice,
            markup_mrp: nextMrp,
          };
        }

        return { ...row, [field]: value };
      })
    );
  };

  const removeCountrySellingPriceRow = (index: number) => {
    setCountrySellingPrices((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const saveSellingPrices = async () => {
    if (!sellingPriceProduct) return;

    const parsedDefaultSellingPrice = Number(defaultSellingPrice);
    if (!Number.isFinite(parsedDefaultSellingPrice) || parsedDefaultSellingPrice < 0) {
      setSellingPriceError('Default selling price must be a non-negative number');
      return;
    }

    // Auto-include any partially filled new-row form (handles case where "Add" was not clicked).
    // If country is selected, use whatever price is available; fall back to default selling price.
    const pendingCountryId = String(newCountryId || '').trim();
    let pendingRows: Array<{
      country_id: string;
      selling_price: number;
      markup_percent: number | null;
      markup_mrp: number | null;
    }> = [];

    if (pendingCountryId) {
      const rawPrice = newCountryPrice !== '' ? Number(newCountryPrice) : parsedDefaultSellingPrice;
      const parsedPendingPrice = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : parsedDefaultSellingPrice;
      const parsedPendingMarkup = newCountryMarkup !== '' && newCountryMarkup != null ? Number(newCountryMarkup) : null;
      const parsedPendingMrp = newCountryMrp !== '' && newCountryMrp != null ? Number(newCountryMrp) : null;
      pendingRows = [{
        country_id: pendingCountryId,
        selling_price: parsedPendingPrice,
        markup_percent: parsedPendingMarkup,
        markup_mrp: parsedPendingMrp,
      }];
    }

    const normalizedRows = [...countrySellingPrices, ...pendingRows]
      .map((row) => ({
        id: (row as CountrySellingPriceRow).id,
        country_id: String(row.country_id || '').trim(),
        selling_price: Number(row.selling_price),
        markup_percent: row.markup_percent !== '' && row.markup_percent != null ? Number(row.markup_percent) : null,
        markup_mrp: row.markup_mrp !== '' && row.markup_mrp != null ? Number(row.markup_mrp) : null,
      }))
      .filter((row) => row.country_id && Number.isFinite(row.selling_price) && row.selling_price >= 0);

    // Reject duplicate countries
    const selectedCountryIds = normalizedRows.map((row) => row.country_id);
    if (new Set(selectedCountryIds).size !== selectedCountryIds.length) {
      setSellingPriceError('Duplicate countries found. Each country can only have one price row.');
      return;
    }

    // Validate each row
    for (const row of normalizedRows) {
      if (!row.country_id) {
        setSellingPriceError('Each country selling price row must have a country selected');
        return;
      }
      if (!Number.isFinite(row.selling_price) || row.selling_price < 0) {
        setSellingPriceError('Each country selling price must be a non-negative number');
        return;
      }
    }

    const productId = sellingPriceProduct.productId || sellingPriceProduct.id;
    const resolvedDefaultCountryId =
      defaultSellingCountryId ||
      sellingPriceProduct.default_selling_country_id ||
      sellingPriceProduct.origin_country_id ||
      null;

    if (!resolvedDefaultCountryId) {
      setSellingPriceError('Default selling country is required before saving');
      return;
    }

    const enforcedCurrency = resolveOriginCurrencyForProduct(sellingPriceProduct);
    setDefaultSellingCurrency(enforcedCurrency);

    setSavingSellingPrices(true);
    setSellingPriceError(null);

    // Step 1: Update products table (default_selling_price, currency, default_selling_country_id)
    const { data: updatedProducts, error: updateProductError } = await supabase
      .from('products')
      .update({
        default_selling_price: parsedDefaultSellingPrice,
        currency: enforcedCurrency,
        default_selling_country_id: resolvedDefaultCountryId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .select('id');

    if (updateProductError) {
      console.error('[saveSellingPrices] products update error:', updateProductError);
      setSavingSellingPrices(false);
      setSellingPriceError(`Failed to save default selling price: ${updateProductError.message}`);
      return;
    }

    if (!Array.isArray(updatedProducts) || updatedProducts.length === 0) {
      console.error('[saveSellingPrices] products update returned 0 rows for productId:', productId);
      setSavingSellingPrices(false);
      setSellingPriceError('No product row was updated — check that you are logged in as admin and try again.');
      return;
    }

    // Step 2: Load existing country price rows to diff
    const { data: existingRows, error: existingRowsError } = await supabase
      .from('product_country_selling_prices')
      .select('id, country_id')
      .eq('product_id', productId);

    if (existingRowsError) {
      console.error('[saveSellingPrices] load existing rows error:', existingRowsError);
      setSavingSellingPrices(false);
      setSellingPriceError(existingRowsError.message || 'Failed to load existing country selling prices');
      return;
    }

    // Step 3: Delete rows that are no longer in the incoming list
    const incomingCountryIds = new Set(normalizedRows.map((row) => row.country_id));
    const rowsToDelete = (existingRows || []).filter((row: any) => !incomingCountryIds.has(String(row.country_id)));
    if (rowsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('product_country_selling_prices')
        .delete()
        .in('id', rowsToDelete.map((row: any) => row.id));
      if (deleteError) {
        console.error('[saveSellingPrices] delete error:', deleteError);
        setSavingSellingPrices(false);
        setSellingPriceError(deleteError.message || 'Failed to remove deleted country selling prices');
        return;
      }
    }

    // Step 4: Upsert incoming rows
    const rowsToUpsert = normalizedRows.map((row) => ({
      product_id: productId,
      country_id: row.country_id,
      variant_id: null as string | null,
      selling_price: row.selling_price,
      markup_percent: row.markup_percent,
      markup_mrp: row.markup_mrp,
    }));

    if (rowsToUpsert.length > 0) {
      const { data: upsertedRows, error: upsertError } = await supabase
        .from('product_country_selling_prices')
        .upsert(rowsToUpsert, { onConflict: 'product_id,country_id,variant_id' })
        .select('id, country_id');

      if (upsertError) {
        console.error('[saveSellingPrices] upsert error:', upsertError, 'rows attempted:', rowsToUpsert);
        setSavingSellingPrices(false);
        setSellingPriceError(`Failed to save country prices: ${upsertError.message}`);
        return;
      }

      if (!Array.isArray(upsertedRows) || upsertedRows.length !== rowsToUpsert.length) {
        console.error('[saveSellingPrices] upsert row count mismatch — expected:', rowsToUpsert.length, 'got:', upsertedRows?.length, upsertedRows);
        setSavingSellingPrices(false);
        setSellingPriceError(`Only ${upsertedRows?.length ?? 0} of ${rowsToUpsert.length} country price rows were saved. Check admin permissions and retry.`);
        return;
      }
    }

    setSuccess(`Selling prices saved successfully${rowsToUpsert.length > 0 ? ` (${rowsToUpsert.length} country price${rowsToUpsert.length > 1 ? 's' : ''})` : ''}`);
    setSavingSellingPrices(false);
    closeSellingPriceModal();
    await fetchProducts();
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error: e, count } = await fetchProductsFromDB({
        category: categoryFilter || undefined,
        approvalStatus: approvalFilter || undefined,
        search: debouncedSearch || undefined,
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
        excludeDrafts: true,
      });
      if (e) {
        setError(e);
      } else {
        setProducts(data as Product[]);
        setPagination(prev => ({ ...prev, total: count }));
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (productId: string) => {
    try {
      setActionLoading(productId);
      const res = await approveProduct(productId);
      if (res.success) {
        setSuccess('Product approved successfully');
        await fetchProducts();
        await loadApprovalCounts();
      } else {
        setError(res.error || 'Failed to approve product');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve product');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (productId: string) => {
    try {
      setActionLoading(productId);
      const res = await rejectProduct(productId);
      if (res.success) {
        setSuccess('Product rejected');
        await fetchProducts();
        await loadApprovalCounts();
      } else {
        setError(res.error || 'Failed to reject product');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reject product');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (productId: string) => {
    try {
      setActionLoading(productId);
      const res = await toggleProductStatus(productId);
      if (res.success) {
        setSuccess('Product status updated');
        await fetchProducts();
      } else {
        setError(res.error || 'Failed to update product status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update product status');
    } finally {
      setActionLoading(null);
    }
  };

  // Debounce search input to avoid a DB call on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Re-fetch on filter changes
  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, approvalFilter, categoryFilter, pagination.page]);

  // Client-side filtering (already filtered server-side, but keep for snappy UX)
  const filteredProducts = products;

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  // NOTE: do NOT early-return on `loading` here. Doing so unmounts the search input
  // on every keystroke (each keystroke -> fetch -> loading=true) and the user loses
  // focus. Render the loading state inline within the list instead.

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 size={16} /> {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Product Approval</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review seller listings, check images and details, set prices, then approve or reject.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => { fetchProducts(); loadApprovalCounts(); }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => navigate('/admin/products/new')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-400 transition-colors text-sm font-medium"
          >
            <Plus size={18} /> Add New Product
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold mb-1">How to approve a product</p>
        <ol className="list-decimal list-inside space-y-0.5 text-amber-800">
          <li>Open the <strong>Pending</strong> tab and click <strong>View</strong> on a listing.</li>
          <li>Check images, identifiers, pricing, variants, and seller details.</li>
          <li>Set <strong>Prices</strong> if needed, then <strong>Approve</strong> or <strong>Reject</strong>.</li>
        </ol>
      </div>

      <div className="flex flex-col lg:flex-row flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => {
                setApprovalFilter(status === 'all' ? '' : status);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                (status === 'all' ? !approvalFilter : approvalFilter === status)
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)} ({approvalCounts[status] ?? 0})
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 lg:ml-auto w-full lg:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, SKU, HSN, brand..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-400"
          >
            <option value="">All Categories</option>
            {categoryList.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-gray-500 -mt-2">
        Showing page {pagination.page} · {pagination.total} product{pagination.total === 1 ? '' : 's'} total
        {loading && <span className="ml-2">(loading…)</span>}
      </p>

      {/* Products Table (desktop) */}
      <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Product Name</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Price</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Stock</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Approval</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-2 sm:px-4 md:px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4">
                    <TableSkeleton rows={8} columns={7} className="border-0" />
                  </td>
                </tr>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const missingFields = checkProductMissingFields(product);
                  const displayCurrency = resolveCountryCurrency(
                    product.origin_country_id || product.default_selling_country_id,
                    product.currency || 'INR'
                  );
                  const pid = product.productId || product.id;
                  const approval = product.approval_status || 'pending';
                  return (
                  <tr key={pid} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-3">
                        {product.images && product.images[0] && (
                          <img src={product.images[0]} alt={product.name} className="w-10 h-10 object-cover rounded" />
                        )}
                        <div>
                          <div>{product.name}</div>
                          {product.sku && <div className="text-xs text-gray-500">SKU: {product.sku}</div>}
                          {missingFields && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.keys(missingFields).map(key => (
                                <span key={key} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                  MISSING {MISSING_LABELS[key] || key}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">{product.category_name || categoryList.find(c => c.id === product.category)?.name || 'N/A'}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm font-semibold text-gray-900">
                      {formatPrice(product.price || 0, displayCurrency)}
                      {product.discount_price && (
                        <div className="text-xs text-green-600">{formatPrice(product.discount_price, displayCurrency)}</div>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-600">{product.stock || 0}</td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${APPROVAL_BADGE[approval] || APPROVAL_BADGE.draft}`}>
                        {approval.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        product.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {product.is_active ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <ProductActionBtn icon={<Eye size={15} />} title="View details" onClick={() => { setSelectedProduct(product); setShowDetails(true); }} />
                          <ProductActionBtn icon={<CreditCard size={15} />} title="Manage prices" cls="text-purple-600 hover:bg-purple-50" onClick={() => openSellingPriceModal(product)} />
                          {approval === 'pending' && (
                            <>
                              <ProductActionBtn
                                icon={<CheckCircle2 size={15} />}
                                title={missingFields ? `Blocked: missing ${Object.keys(missingFields).map(k => MISSING_LABELS[k]).join(', ')}` : 'Approve'}
                                cls="text-green-600 hover:bg-green-50"
                                disabled={actionLoading === pid || !!missingFields}
                                onClick={() => handleApprove(pid)}
                              />
                              <ProductActionBtn
                                icon={<XCircle size={15} />}
                                title="Reject"
                                cls="text-red-600 hover:bg-red-50"
                                disabled={actionLoading === pid}
                                onClick={() => handleReject(pid)}
                              />
                            </>
                          )}
                          <ProductActionBtn
                            icon={<Package size={15} />}
                            title={product.is_active ? 'Disable product' : 'Enable product'}
                            cls="text-orange-600 hover:bg-orange-50"
                            disabled={actionLoading === pid}
                            onClick={() => handleToggleStatus(pid)}
                          />
                        </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No products found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Products list (mobile / tablet) */}
      <div className="lg:hidden space-y-3">
        {loading && filteredProducts.length === 0 ? (
          <ListSkeleton rows={6} withThumb />
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">No products found</div>
        ) : (
          filteredProducts.map((product) => {
            const missingFields = checkProductMissingFields(product);
            const displayCurrency = resolveCountryCurrency(
              product.origin_country_id || product.default_selling_country_id,
              product.currency || 'INR'
            );
            const pid = product.productId || product.id;
            const approval = product.approval_status || 'pending';
            return (
              <div key={pid} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                <div className="flex items-start gap-3 min-w-0">
                  {product.images && product.images[0] && (
                    <img src={product.images[0]} alt={product.name} className="w-14 h-14 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 break-words line-clamp-2">{product.name}</p>
                    {product.sku && <p className="text-[11px] text-gray-500 truncate">SKU: {product.sku}</p>}
                    <p className="text-[11px] text-gray-500 truncate">
                      {product.category_name || categoryList.find(c => c.id === product.category)?.name || 'N/A'}
                    </p>
                  </div>
                </div>

                {missingFields && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.keys(missingFields).map(key => (
                      <span key={key} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                        MISSING {MISSING_LABELS[key] || key}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-2 min-w-0">
                  <div className="truncate">
                    <span className="text-gray-400">Price:</span>{' '}
                    <span className="font-semibold text-gray-900">{formatPrice(product.price || 0, displayCurrency)}</span>
                  </div>
                  <div className="truncate">
                    <span className="text-gray-400">Stock:</span>{' '}
                    <span className="text-gray-700">{product.stock || 0}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${APPROVAL_BADGE[approval] || APPROVAL_BADGE.draft}`}>
                    {approval.toUpperCase()}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    product.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {product.is_active ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1 pt-2 border-t border-gray-100 mt-3">
                  <ProductActionBtn icon={<Eye size={15} />} title="View" onClick={() => { setSelectedProduct(product); setShowDetails(true); }} />
                  <ProductActionBtn icon={<CreditCard size={15} />} title="Prices" cls="text-purple-600 hover:bg-purple-50" onClick={() => openSellingPriceModal(product)} />
                  {approval === 'pending' && (
                    <>
                      <ProductActionBtn
                        icon={<CheckCircle2 size={15} />}
                        title="Approve"
                        cls="text-green-600 hover:bg-green-50"
                        disabled={actionLoading === pid || !!missingFields}
                        onClick={() => handleApprove(pid)}
                      />
                      <ProductActionBtn
                        icon={<XCircle size={15} />}
                        title="Reject"
                        cls="text-red-600 hover:bg-red-50"
                        disabled={actionLoading === pid}
                        onClick={() => handleReject(pid)}
                      />
                    </>
                  )}
                  <ProductActionBtn
                    icon={<Package size={15} />}
                    title={product.is_active ? 'Disable' : 'Enable'}
                    cls="text-orange-600 hover:bg-orange-50"
                    disabled={actionLoading === pid}
                    onClick={() => handleToggleStatus(pid)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white rounded-xl border border-gray-200 p-3 sm:p-4 gap-3">
          <button
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
            disabled={pagination.page === 1}
            className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm w-full sm:w-auto"
          >
            Previous
          </button>

          <span className="text-sm text-gray-600">
            Page {pagination.page} of {totalPages}
          </span>

          <button
            onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
            disabled={pagination.page === totalPages}
            className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm w-full sm:w-auto"
          >
            Next
          </button>
        </div>
      )}

      {/* Product Details Modal */}
      {/* mobile scroll fix: dvh respects browser chrome; items-start anchors top; pb-24 reserves space for fixed MobileNav */}
      {showDetails && selectedProduct && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto overscroll-contain" onClick={() => setShowDetails(false)}>
          <div
            className="bg-white shadow-xl w-full sm:rounded-2xl max-w-5xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">Product Approval Review</h2>
                <p className="text-sm text-gray-500 truncate mt-0.5">{selectedProduct.name}</p>
              </div>
              <button onClick={() => setShowDetails(false)} className="p-1 hover:bg-gray-100 rounded-lg shrink-0" aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 pb-24 sm:pb-6">
              {(() => {
                const selectedDisplayCurrency = resolveCountryCurrency(
                  selectedProduct.origin_country_id || selectedProduct.default_selling_country_id,
                  selectedProduct.currency || 'INR'
                );
                const totalVariantStock = detailsBundle.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
                const stockToShow = detailsBundle.variants.length > 0 ? totalVariantStock : (selectedProduct.stock || 0);
                const approval = selectedProduct.approval_status || 'pending';
                const missingFields = checkProductMissingFields(selectedProduct);
                const productId = selectedProduct.productId || selectedProduct.id;
                const slug = selectedProduct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';

                return (
                  <>
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border px-4 py-3 ${APPROVAL_BADGE[approval] || APPROVAL_BADGE.draft}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <CheckCircle2 size={18} />
                        <div>
                          <p className="font-semibold capitalize">{approval}</p>
                          <p className="text-xs opacity-80 flex flex-wrap gap-2">
                            <span>{selectedProduct.is_active ? 'Active listing' : 'Inactive listing'}</span>
                            {selectedProduct.is_featured && <span>· Featured</span>}
                            <span>· Updated {formatDateTime(selectedProduct.updated_at)}</span>
                          </p>
                        </div>
                      </div>
                      {approval === 'pending' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openSellingPriceModal(selectedProduct)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white/80 text-purple-700 border border-purple-200 rounded-lg hover:bg-white"
                          >
                            <CreditCard size={14} /> Prices
                          </button>
                          <button
                            type="button"
                            onClick={async () => { await handleApprove(productId); setShowDetails(false); }}
                            disabled={actionLoading === productId || !!missingFields}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50"
                          >
                            {actionLoading === productId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => { await handleReject(productId); setShowDetails(false); }}
                            disabled={actionLoading === productId}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white/80 text-red-700 border border-red-200 rounded-lg hover:bg-white disabled:opacity-50"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}
                    </div>

                    {missingFields && approval === 'pending' && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                        <p className="font-semibold mb-1">Cannot approve until seller fixes missing fields:</p>
                        <p>{Object.keys(missingFields).map(k => MISSING_LABELS[k] || k).join(', ')}</p>
                      </div>
                    )}

                    {selectedProduct.images && selectedProduct.images.length > 0 && (
                      <section>
                        <ProductSectionHeading icon={<ImageIcon size={16} />} title={`Product images (${selectedProduct.images.length})`} />
                        <p className="text-xs text-gray-500 mt-2 mb-3">View opens in a new tab. Download saves the image file locally.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {selectedProduct.images.map((img, idx) => (
                            <ProductImageCard
                              key={idx}
                              url={img}
                              label={`Image ${idx + 1}`}
                              downloadName={`${slug}-image-${idx + 1}`}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <ProductSectionHeading icon={<Tag size={16} />} title="Identifiers" />
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mt-3">
                          <div><dt className="text-xs text-gray-500">SKU</dt><dd className="font-semibold text-gray-900 font-mono text-xs break-all">{selectedProduct.sku || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">HSN Code</dt><dd className="font-semibold text-gray-900 font-mono text-xs">{selectedProduct.hsn_code || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Brand</dt><dd className="font-semibold text-gray-900">{selectedProduct.brand || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Model Number</dt><dd className="font-semibold text-gray-900">{selectedProduct.model_number || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Condition</dt><dd className="font-semibold text-gray-900 capitalize">{(selectedProduct.item_condition || 'brand_new').replace(/_/g, ' ')}</dd></div>
                          <div><dt className="text-xs text-gray-500">Product ID</dt><dd className="font-semibold text-gray-900 font-mono text-[10px] break-all">{selectedProduct.id}</dd></div>
                        </dl>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <ProductSectionHeading icon={<Package size={16} />} title="Classification" />
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mt-3">
                          <div><dt className="text-xs text-gray-500">Category</dt><dd className="font-semibold text-gray-900">{selectedProduct.category_name || categoryList.find(c => c.id === selectedProduct.category)?.name || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Sub Category</dt><dd className="font-semibold text-gray-900">{selectedProduct.sub_category_name || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">COD Available</dt><dd className="font-semibold text-gray-900">{selectedProduct.is_cod_available ? 'Yes' : 'No'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Shipping Type</dt><dd className="font-semibold text-gray-900 capitalize">{selectedProduct.shipping_type || 'N/A'}</dd></div>
                        </dl>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <ProductSectionHeading icon={<CreditCard size={16} />} title="Pricing & inventory" />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mt-3">
                        <div><div className="text-xs text-gray-500">MRP</div><div className="font-bold text-gray-900">{selectedProduct.mrp ? formatPrice(selectedProduct.mrp, selectedDisplayCurrency) : 'N/A'}</div></div>
                        <div><div className="text-xs text-gray-500">Selling Price</div><div className="font-bold text-green-700">{formatPrice(selectedProduct.price || 0, selectedDisplayCurrency)}</div></div>
                        <div><div className="text-xs text-gray-500">Discount Price</div><div className="font-bold text-gray-900">{selectedProduct.discount_price ? formatPrice(selectedProduct.discount_price, selectedDisplayCurrency) : 'N/A'}</div></div>
                        <div><div className="text-xs text-gray-500">Stock</div><div className={`font-bold ${stockToShow > 0 ? 'text-gray-900' : 'text-red-600'}`}>{stockToShow} units</div></div>
                      </div>
                    </div>

                    {detailsBundle.variants.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <ProductSectionHeading icon={<Package size={16} />} title={`Variants (${detailsBundle.variants.length})`} />
                        <div className="overflow-x-auto mt-3">
                          <table className="w-full text-xs">
                            <thead><tr className="text-left text-gray-500 border-b border-gray-200"><th className="py-1.5 pr-3 font-semibold">SKU</th><th className="py-1.5 pr-3 font-semibold">Size</th><th className="py-1.5 pr-3 font-semibold">Color</th><th className="py-1.5 pr-3 font-semibold">Price</th><th className="py-1.5 pr-3 font-semibold">MRP</th><th className="py-1.5 font-semibold">Stock</th></tr></thead>
                            <tbody>
                              {detailsBundle.variants.map(v => (
                                <tr key={v.id} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1.5 pr-3 font-mono text-[11px] text-gray-900">{v.sku || '-'}</td>
                                  <td className="py-1.5 pr-3 text-gray-900">{v.size || v.size_value || '-'}</td>
                                  <td className="py-1.5 pr-3 text-gray-900">{v.color && v.color !== 'DEFAULT' ? v.color : '-'}</td>
                                  <td className="py-1.5 pr-3 font-semibold text-green-700">{v.price ? formatPrice(Number(v.price), selectedDisplayCurrency) : '-'}</td>
                                  <td className="py-1.5 pr-3 text-gray-700">{v.mrp ? formatPrice(Number(v.mrp), selectedDisplayCurrency) : '-'}</td>
                                  <td className={`py-1.5 font-semibold ${Number(v.stock) > 0 ? 'text-gray-900' : 'text-red-600'}`}>{v.stock ?? 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <ProductSectionHeading icon={<Building2 size={16} />} title="Seller details" />
                        {detailsBundle.seller?.is_verified && <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Verified</span>}
                      </div>
                      {detailsLoading ? (
                        <div className="text-xs text-gray-500">Loading…</div>
                      ) : detailsBundle.seller ? (
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                          <div><dt className="text-xs text-gray-500">Name</dt><dd className="font-semibold text-gray-900">{detailsBundle.seller.full_name || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Email</dt><dd className="font-semibold text-gray-900 break-all">{detailsBundle.seller.email || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Phone</dt><dd className="font-semibold text-gray-900">{detailsBundle.seller.phone || 'N/A'}</dd></div>
                          <div><dt className="text-xs text-gray-500">Joined</dt><dd className="font-semibold text-gray-900">{formatDateTime(detailsBundle.seller.created_at)}</dd></div>
                          {detailsBundle.seller.shop_address && (
                            <div className="sm:col-span-2"><dt className="text-xs text-gray-500">Shop Address</dt><dd className="text-gray-900">{detailsBundle.seller.shop_address}</dd></div>
                          )}
                          <div className="sm:col-span-2"><dt className="text-xs text-gray-500">Seller ID</dt><dd className="font-mono text-[10px] text-gray-700 break-all">{selectedProduct.seller_id}</dd></div>
                        </dl>
                      ) : (
                        <div className="text-xs text-gray-500">Seller profile not available.</div>
                      )}
                    </div>

                    {selectedProduct.description && (
                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <ProductSectionHeading icon={<FileText size={16} />} title="Description" />
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-3">{selectedProduct.description}</p>
                      </div>
                    )}

                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <ProductSectionHeading icon={<Clock size={16} />} title="Activity" />
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm mt-3">
                        <div><dt className="text-xs text-gray-500">Created</dt><dd className="font-semibold text-gray-900">{formatDateTime(selectedProduct.created_at)}</dd></div>
                        <div><dt className="text-xs text-gray-500">Last Updated</dt><dd className="font-semibold text-gray-900">{formatDateTime(selectedProduct.updated_at)}</dd></div>
                      </dl>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap justify-end gap-2">
              {selectedProduct.approval_status === 'pending' && (
                <>
                  <button
                    type="button"
                    onClick={() => openSellingPriceModal(selectedProduct)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50"
                  >
                    <CreditCard size={14} /> Prices
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await handleReject(selectedProduct.productId || selectedProduct.id); setShowDetails(false); }}
                    disabled={actionLoading === (selectedProduct.productId || selectedProduct.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const pid = selectedProduct.productId || selectedProduct.id;
                      await handleApprove(pid);
                      setShowDetails(false);
                    }}
                    disabled={actionLoading === (selectedProduct.productId || selectedProduct.id) || !!checkProductMissingFields(selectedProduct)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50"
                  >
                    {actionLoading === (selectedProduct.productId || selectedProduct.id) ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Approve
                  </button>
                </>
              )}
              <button onClick={() => setShowDetails(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Selling Prices Modal */}
      {/* mobile scroll fix: dvh respects browser chrome; items-start anchors top; pb-28 reserves space for fixed MobileNav so Save/Cancel stay reachable */}
      {showSellingPriceModal && sellingPriceProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white rounded-xl border-2 border-gray-800 max-w-5xl w-full max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] overflow-y-auto overscroll-contain px-4 sm:px-6 pt-4 sm:pt-6 pb-28 sm:pb-6">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Selling Prices</h2>
              <button
                onClick={closeSellingPriceModal}
                className="text-gray-500 hover:text-gray-800 text-3xl leading-none"
                disabled={savingSellingPrices}
              >
                ×
              </button>
            </div>

            {sellingPriceError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <span className="text-sm text-red-800">{sellingPriceError}</span>
                <button
                  onClick={() => setSellingPriceError(null)}
                  className="text-red-600 hover:text-red-800"
                  disabled={savingSellingPrices}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="border-2 border-gray-700 rounded-2xl p-4 sm:p-5 mb-5">
              <div className="flex items-center justify-end mb-3">
                <div className="px-3 py-2 border border-gray-500 rounded text-sm bg-gray-50 font-semibold text-gray-800">
                  Currency (from Origin Country): {defaultSellingCurrency}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-28 h-28 rounded-2xl border-2 border-gray-700 overflow-hidden bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                  {sellingPriceProduct.images && sellingPriceProduct.images[0] ? (
                    <img
                      src={sellingPriceProduct.images[0]}
                      alt={sellingPriceProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    'PRODUCT IMAGE'
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product Name</p>
                  <p className="text-xl font-semibold text-gray-900">{sellingPriceProduct.name}</p>
                  <p className="text-sm text-gray-700 uppercase">
                    Category: {sellingPriceProduct.category_name || categoryList.find(c => c.id === sellingPriceProduct.category)?.name || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-700 uppercase">
                    Selling Price: {formatPrice(Number(defaultSellingPrice || 0), defaultSellingCurrency)}
                  </p>
                  <p className="text-sm text-gray-700 uppercase">
                    Weight: {formatWeightInKg(sellingPriceProduct.package_weight, sellingPriceProduct.package_weight_unit_id)} KG | Package Size: {sellingPriceProduct.package_length || 'L'}*{sellingPriceProduct.package_width || 'W'}*{sellingPriceProduct.package_height || 'H'}
                  </p>
                 </div>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
               <div>
                 <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Product Origin Country</label>
                 <input
                   type="text"
                   readOnly
                   value={countryOptions.find((country) => country.id === sellingPriceProduct.origin_country_id)?.country_name || 'N/A'}
                   className="w-full px-3 py-2 border border-gray-500 rounded text-sm bg-gray-50"
                 />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Default Selling Country</label>
                 <select
                   value={defaultSellingCountryId}
                   onChange={(e) => setDefaultSellingCountryId(e.target.value)}
                   className="w-full px-3 py-2 border border-gray-500 rounded text-sm"
                   disabled={savingSellingPrices}
                 >
                   <option value="">Select Country</option>
                   {countryOptions.map((country) => (
                     <option key={country.id} value={country.id}>
                       {country.country_name}
                     </option>
                   ))}
                 </select>
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Default Price : (Selling Price)</label>
                 <input
                   type="number"
                   min="0"
                   step="0.01"
                   placeholder="12.49"
                   value={defaultSellingPrice}
                   onChange={(e) => setDefaultSellingPrice(e.target.value)}
                   className="w-full px-3 py-2 border border-gray-500 rounded text-sm bg-white"
                   disabled={savingSellingPrices}
                 />
               </div>
             </div>

             <p className="text-xs text-amber-800 mb-4">
               Enter prices in full currency units (example: <strong>12.49</strong>). Do not enter minor units like 1249 pence/paise.
             </p>

             {suggestMajorUnitValue(defaultSellingPrice) && (
               <p className="text-xs text-red-700 mb-4">
                 This default price looks like minor units. If intended, use {suggestMajorUnitValue(defaultSellingPrice)} {defaultSellingCurrency}.
               </p>
             )}

             <div className="border border-gray-300 rounded-lg p-3 sm:p-4">
               <p className="text-sm font-semibold text-gray-900 mb-3">Country-wise Selling Prices</p>

               <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-2 sm:gap-3 mb-3 items-end">
                 <div>
                   <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Country</label>
                   <select
                     value={newCountryId}
                     onChange={(e) => setNewCountryId(e.target.value)}
                     className="w-full px-3 py-2 border border-gray-500 rounded text-sm"
                     disabled={savingSellingPrices}
                   >
                     <option value="">Select Country</option>
                     {countryOptions.map((country) => (
                       <option key={country.id} value={country.id}>
                         {country.country_name}
                       </option>
                     ))}
                   </select>
                 </div>

                 <div>
                   <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Markup %</label>
                   <input
                     type="number"
                     step="0.01"
                     value={newCountryMarkup}
                     onChange={(e) => {
                       setNewCountryMarkup(e.target.value);
                       const parsedMarkup = Number(e.target.value);
                       const base = Number(defaultSellingPrice || sellingPriceProduct.price || 0);
                       if (Number.isFinite(parsedMarkup) && base > 0) {
                         setNewCountryPrice(((base * (100 + parsedMarkup)) / 100).toFixed(2));
                       }
                       const mrpBase = Number(sellingPriceProduct?.mrp || 0);
                       if (Number.isFinite(parsedMarkup) && mrpBase > 0) {
                         setNewCountryMrp(((mrpBase * (100 + parsedMarkup)) / 100).toFixed(2));
                       }
                     }}
                     className="w-full px-3 py-2 border border-gray-500 rounded text-sm"
                     disabled={savingSellingPrices}
                   />
                 </div>

                 <div>
                   <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Markup MRP</label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     placeholder="0.00"
                     value={newCountryMrp}
                     onChange={(e) => setNewCountryMrp(e.target.value)}
                     className="w-full px-3 py-2 border border-gray-500 rounded text-sm"
                     disabled={savingSellingPrices}
                   />
                 </div>

                 <div>
                   <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Markup Selling Price</label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     placeholder="12.49"
                     value={newCountryPrice}
                     onChange={(e) => {
                       setNewCountryPrice(e.target.value);
                       const parsedPrice = Number(e.target.value);
                       const calcMarkup = Number.isFinite(parsedPrice) ? calculateMarkup(parsedPrice) : '';
                       setNewCountryMarkup(calcMarkup);
                       const mrpBase = Number(sellingPriceProduct?.mrp || 0);
                       const parsedMarkup = Number(calcMarkup);
                       if (calcMarkup !== '' && Number.isFinite(parsedMarkup) && mrpBase > 0) {
                         setNewCountryMrp(((mrpBase * (100 + parsedMarkup)) / 100).toFixed(2));
                       }
                     }}
                     className="w-full px-3 py-2 border border-gray-500 rounded text-sm"
                     disabled={savingSellingPrices}
                   />
                 </div>

                 <button
                   onClick={addCountrySellingPriceRow}
                   className="px-4 py-2 rounded bg-indigo-700 text-white text-sm font-semibold hover:bg-indigo-800"
                   disabled={savingSellingPrices}
                 >
                   Add
                 </button>
               </div>

               {countrySellingPrices.length > 0 && (
                 <div className="space-y-2 pt-2 border-t border-gray-200">
                   <div className="hidden lg:grid lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-2 sm:gap-3 px-1">
                     <span className="text-xs font-semibold text-gray-500 uppercase">Markup Country</span>
                     <span className="text-xs font-semibold text-gray-500 uppercase">Markup %</span>
                     <span className="text-xs font-semibold text-gray-500 uppercase">Markup MRP</span>
                     <span className="text-xs font-semibold text-gray-500 uppercase">Markup Selling Price</span>
                     <span />
                   </div>
                   {countrySellingPrices.map((row, index) => (
                     <div key={`${row.id || 'new'}-${index}`} className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-2 sm:gap-3 items-end">
                       <select
                         value={row.country_id}
                         onChange={(e) => updateCountrySellingPriceRow(index, 'country_id', e.target.value)}
                         className="w-full px-3 py-2 border border-gray-400 rounded text-sm"
                         disabled={savingSellingPrices}
                       >
                         <option value="">Select Country</option>
                         {countryOptions.map((country) => (
                           <option key={country.id} value={country.id}>
                             {country.country_name}
                           </option>
                         ))}
                       </select>

                       <input
                         type="number"
                         step="0.01"
                         placeholder="Markup %"
                         value={row.markup_percent || ''}
                         onChange={(e) => updateCountrySellingPriceRow(index, 'markup_percent', e.target.value)}
                         className="w-full px-3 py-2 border border-gray-400 rounded text-sm"
                         disabled={savingSellingPrices}
                       />

                       <input
                         type="number"
                         min="0"
                         step="0.01"
                         placeholder="MRP"
                         value={row.markup_mrp || ''}
                         onChange={(e) => updateCountrySellingPriceRow(index, 'markup_mrp', e.target.value)}
                         className="w-full px-3 py-2 border border-gray-400 rounded text-sm"
                         disabled={savingSellingPrices}
                       />

                       <input
                         type="number"
                         min="0"
                         step="0.01"
                         placeholder="Selling Price"
                         value={row.selling_price}
                         onChange={(e) => updateCountrySellingPriceRow(index, 'selling_price', e.target.value)}
                         className="w-full px-3 py-2 border border-gray-400 rounded text-sm"
                         disabled={savingSellingPrices}
                       />

                       <button
                         onClick={() => removeCountrySellingPriceRow(index)}
                         className="px-4 py-2 rounded bg-red-100 text-red-700 text-sm font-semibold border border-red-300 hover:bg-red-200"
                         disabled={savingSellingPrices}
                       >
                         Remove
                       </button>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             <div className="mt-7 flex justify-end gap-3">
               <button
                 onClick={closeSellingPriceModal}
                 className="px-7 py-2 rounded-full bg-indigo-700 text-white text-sm font-semibold hover:bg-indigo-800"
                 disabled={savingSellingPrices}
               >
                 Cancel
               </button>
               <button
                 onClick={saveSellingPrices}
                 className="px-7 py-2 rounded-full bg-indigo-700 text-white text-sm font-semibold hover:bg-indigo-800 disabled:opacity-60"
                 disabled={savingSellingPrices}
               >
                   {savingSellingPrices ? 'Saving...' : 'Save'}
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

const ProductActionBtn: React.FC<{
  icon: React.ReactNode;
  title: string;
  cls?: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, title, cls = 'text-gray-500 hover:bg-gray-100', disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
  >
    {icon}
  </button>
);

const ProductSectionHeading: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 uppercase tracking-wide">
    <span className="text-amber-600">{icon}</span>
    {title}
  </div>
);

const ProductImageCard: React.FC<{ url: string; label: string; downloadName: string }> = ({ url, label, downloadName }) => {
  const [viewLoading, setViewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const ext = (() => {
    try {
      const pathname = new URL(url).pathname;
      const part = pathname.split('.').pop();
      if (part && part.length <= 5) return part;
    } catch { /* relative url */ }
    return 'jpg';
  })();

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col min-w-0">
      <div className="bg-gray-50 h-36 flex items-center justify-center overflow-hidden border-b border-gray-100">
        <img src={url} alt={label} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="p-3 flex flex-col gap-2">
        <p className="font-semibold text-gray-900 text-sm">{label}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={viewLoading || downloadLoading}
            onClick={() => {
              setViewLoading(true);
              window.open(url, '_blank', 'noopener,noreferrer');
              setViewLoading(false);
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {viewLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            View
          </button>
          <button
            type="button"
            disabled={viewLoading || downloadLoading}
            onClick={async () => {
              setDownloadLoading(true);
              await downloadProductImage(url, `${downloadName}.${ext}`);
              setDownloadLoading(false);
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {downloadLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
