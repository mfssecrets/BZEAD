import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Plus, Trash2, X } from 'lucide-react';
import { ListSkeleton } from '../../../components/common/Skeleton';
import { fetchProducts } from '../../../lib/productService';
import { supabase } from '../../../lib/supabase';
import type { Product } from '../../../types';
import {
  addSponsoredProducts,
  getSponsoredProductsBySection,
  removeSponsoredProduct,
  subscribeSponsoredProducts,
  type SponsoredProductDetail,
  type SponsoredSection,
} from '../../../lib/sponsoredProductsService';
import { formatFrontend12DigitId } from '../../../utils/idFormatter';

type SellerOption = { id: string; name: string };

const sectionOptions: Array<{ value: SponsoredSection; label: string }> = [
  { value: 'featured', label: 'Featured Products' },
  { value: 'trending', label: 'Trending Now' },
  { value: 'hot-deals', label: 'Hot Deals' },
];



export const SponsoredProductsManagement: React.FC = () => {
  // ── Global state ──
  const [section, setSection] = useState<SponsoredSection>('featured');
  const [sectionProducts, setSectionProducts] = useState<SponsoredProductDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Remove state ──
  const [removeTarget, setRemoveTarget] = useState<SponsoredProductDetail | null>(null);
  const [removing, setRemoving] = useState(false);

  // ── Add modal state ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [addSellerId, setAddSellerId] = useState('');
  const [sellerProducts, setSellerProducts] = useState<Product[]>([]);
  const [sellerProductsLoading, setSellerProductsLoading] = useState(false);
  const [checkedProductIds, setCheckedProductIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // ── Load section products ──
  const loadSectionProducts = useCallback(async (sec: SponsoredSection) => {
    try {
      setLoading(true);
      const products = await getSponsoredProductsBySection(sec);
      setSectionProducts(products);
    } catch {
      setError('Failed to load section products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSectionProducts(section);
  }, [section, loadSectionProducts]);

  // ── Realtime subscription ──
  useEffect(() => {
    const unsubscribe = subscribeSponsoredProducts(() => {
      void loadSectionProducts(section);
    });
    return () => { void unsubscribe(); };
  }, [section, loadSectionProducts]);

  // ── Remove handler ──
  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      setRemoving(true);
      setError(null);
      setSuccess(null);
      const result = await removeSponsoredProduct(removeTarget.section, removeTarget.productId);
      if (!result.success) {
        setError(result.error || 'Failed to remove product.');
        return;
      }
      setSuccess('Product removed from section.');
      await loadSectionProducts(section);
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  // ── Add modal: load sellers ──
  const openAddModal = async () => {
    setCheckedProductIds(new Set());
    setAddSellerId('');
    setSellerProducts([]);
    setError(null);

    // Always reload sellers fresh
    setSellersLoading(true);
    setSellers([]);
    setShowAddModal(true);

    try {
      // Simple query: get sellers who have at least one product — no KYC join needed
      const { data, error: qErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, products(count)')
        .eq('role', 'seller')
        .order('created_at', { ascending: false })
        .limit(500);

      if (qErr) {
        setError('Failed to load sellers: ' + qErr.message);
        return;
      }
      const mapped = (data || [])
        .filter((row: any) => {
          const cnt = Array.isArray(row.products) ? (row.products[0]?.count ?? 0) : 0;
          return cnt > 0;
        })
        .map((row: any) => ({
          id: row.id as string,
          name: row.full_name || row.email || 'Seller',
        }));
      setSellers(mapped);
    } catch {
      setError('Failed to load sellers.');
    } finally {
      setSellersLoading(false);
    }
  };

  // ── Load seller products when seller changes ──
  useEffect(() => {
    if (!addSellerId || !showAddModal) {
      setSellerProducts([]);
      return;
    }

    const load = async () => {
      setSellerProductsLoading(true);
      setCheckedProductIds(new Set());
      try {
        const { data } = await fetchProducts({
          sellerId: addSellerId,
          approvalStatus: 'approved',
          isActive: true,
          limit: 300,
          offset: 0,
        });
        // Filter out products already in this section
        const existingIds = new Set(sectionProducts.map((p) => p.productId));
        const filtered = ((data as Product[]) || []).filter(
          (p) => !existingIds.has(p.productId || p.id)
        );
        setSellerProducts(filtered);
      } catch {
        setError('Failed to load seller products.');
        setSellerProducts([]);
      } finally {
        setSellerProductsLoading(false);
      }
    };

    void load();
  }, [addSellerId, showAddModal, sectionProducts]);

  // ── Toggle product checkbox ──
  const toggleProduct = (productId: string) => {
    setCheckedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // ── Add products handler ──
  const handleAdd = async () => {
    if (checkedProductIds.size === 0) {
      setError('Please select at least one product.');
      return;
    }
    if (!addSellerId) {
      setError('Please select a seller.');
      return;
    }

    try {
      setAdding(true);
      setError(null);
      setSuccess(null);

      const now = new Date();
      const endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 10);

      const result = await addSponsoredProducts({
        section,
        sellerId: addSellerId,
        productIds: Array.from(checkedProductIds),
        startAt: now.toISOString(),
        endAt: endDate.toISOString(),
      });

      if (!result.success) {
        setError(result.error || 'Failed to add products.');
        return;
      }

      setSuccess(`${checkedProductIds.size} product(s) added to section.`);
      setShowAddModal(false);
      await loadSectionProducts(section);
    } finally {
      setAdding(false);
    }
  };

  const sectionLabel = sectionOptions.find((s) => s.value === section)?.label || section;

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700"><X size={16} /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700"><X size={16} /></button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-5 md:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Sponsored Products</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Manage homepage sponsored sections. Max 100 products per section.</p>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-900 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-black flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={16} /> Add Product
          </button>
        </div>

        {/* Section tabs */}
        <div className="mt-4 sm:mt-5 flex gap-1 sm:gap-2 border-b border-gray-200 overflow-x-auto">
          {sectionOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSection(opt.value)}
              className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                section === opt.value
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Section products list */}
        <div className="mt-5">
          {loading ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">Loading products...</span>
              <ListSkeleton rows={5} withThumb />
            </div>
          ) : sectionProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ImageIcon className="mx-auto h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm">No products in <strong>{sectionLabel}</strong> section.</p>
              <p className="text-xs text-gray-400 mt-1">Click "Add Product" to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {sectionProducts.length} product{sectionProducts.length !== 1 ? 's' : ''} in {sectionLabel}
              </p>
              {sectionProducts.map((item) => (
                <div
                  key={item.rowId}
                  className="flex items-center justify-between border border-gray-200 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-gray-50 transition-colors gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.productImage ? (
                      <img src={item.productImage} alt={item.productName} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <ImageIcon className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-[150px] sm:max-w-none">{item.productName}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[180px] sm:max-w-none">
                        Seller: {item.sellerName} &bull; ID: {formatFrontend12DigitId(item.productId)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(item)}
                    className="shrink-0 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove product from section"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Remove Confirmation Dialog ── */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !removing && setRemoveTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Remove Product</h4>
            <p className="text-sm text-gray-600 mb-1">
              Remove <strong>{removeTarget.productName}</strong> from <strong>{sectionLabel}</strong>?
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Seller: {removeTarget.sellerName} &bull; ID: {formatFrontend12DigitId(removeTarget.productId)}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={removing}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Product Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4" onClick={() => !adding && setShowAddModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-base sm:text-lg font-semibold text-gray-900">Add Products to {sectionLabel}</h4>
                <p className="text-xs text-gray-500 mt-1">Select a seller, pick products.</p>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 overflow-y-auto flex-1 space-y-4">
              {/* Modal-level error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 ml-2"><X size={14} /></button>
                </div>
              )}

              {/* Seller selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Seller</label>
                {sellersLoading ? (
                  <div className="flex items-center gap-2 py-2.5 px-3 text-sm text-gray-500 border border-gray-200 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading sellers...
                  </div>
                ) : (
                  <select
                    value={addSellerId}
                    onChange={(e) => setAddSellerId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                  >
                    <option value="">— Select a seller ({sellers.length}) —</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Products list */}
              {addSellerId && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Select Products ({checkedProductIds.size} selected)
                  </label>
                  {sellerProductsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading products...
                    </div>
                  ) : sellerProducts.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No available products from this seller.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                      {sellerProducts.map((product) => {
                        const id = product.productId || product.id;
                        const image = product.image_url || product.images?.[0] || '';
                        const checked = checkedProductIds.has(id);
                        return (
                          <label
                            key={id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${checked ? 'bg-blue-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProduct(id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            {image ? (
                              <img src={image} alt={product.name} className="w-10 h-10 rounded object-cover shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
                                <ImageIcon className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                              <p className="text-xs text-gray-500">
                                ₹{product.price?.toLocaleString('en-IN')} &bull; ID: {formatFrontend12DigitId(id)}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}


            </div>

            {/* Modal footer */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={adding}
                className="px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding || checkedProductIds.size === 0}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black disabled:opacity-50 flex items-center gap-2"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {adding ? 'Adding...' : `Add ${checkedProductIds.size} Product${checkedProductIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SponsoredProductsManagement;