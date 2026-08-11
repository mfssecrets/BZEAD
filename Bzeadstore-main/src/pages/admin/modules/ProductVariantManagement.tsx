import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Copy } from 'lucide-react';
import * as adminApiService from '../../../lib/adminService';
import { supabase } from '../../../lib/supabase';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { confirmOnce } from '../../../utils/confirmOnce';
import { TableSkeleton } from '../../../components/common/Skeleton';

interface Variant {
  id: string;
  productId: string;
  sku: string;
  sellerCode?: string;
  color?: string;
  sizeSystem?: string;
  sizeValue?: string;
  price: number;
  stock: number;
  images?: VariantImage[];
  createdAt: string;
}

interface VariantImage {
  id: string;
  variantId: string;
  url: string;
  position: number;
}

interface Color {
  id: string;
  name: string;
  hex?: string;
}

interface ProductOption {
  id: string;
  name: string;
  currency: string;
}

const APPAREL_SIZE_SYSTEMS = [
  'INTL_ALPHA',
  'EU_NUMERIC',
  'US_NUMERIC',
  'UK_NUMERIC',
  'WAIST',
  'SHOE_US',
  'SHOE_UK',
  'SHOE_EU',
  'KIDS_AGE',
  'FREE_SIZE',
];

const SIZE_VALUES = {
  INTL_ALPHA: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  EU_NUMERIC: ['36', '38', '40', '42', '44', '46', '48'],
  US_NUMERIC: ['0', '2', '4', '6', '8', '10', '12'],
  UK_NUMERIC: ['6', '8', '10', '12', '14', '16', '18'],
  WAIST: ['28', '30', '32', '34', '36', '38', '40'],
  SHOE_US: ['5', '6', '7', '8', '9', '10', '11', '12', '13'],
  SHOE_UK: ['3', '4', '5', '6', '7', '8', '9', '10', '11'],
  SHOE_EU: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  KIDS_AGE: ['0-3M', '3-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '5Y'],
  FREE_SIZE: ['FREE'],
};

export const ProductVariantManagement: React.FC = () => {
  const { formatPrice } = useCurrency();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddVariant, setShowAddVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [showAddColor, setShowAddColor] = useState(false);
  const [newColor, setNewColor] = useState({ name: '', hex: '#000000' });
  const [formData, setFormData] = useState<Partial<Variant>>({
    sku: '',
    sellerCode: '',
    color: '',
    sizeSystem: 'INTL_ALPHA',
    sizeValue: '',
    price: 0,
    stock: 0,
  });

  // Load products list on mount
  useEffect(() => {
    const loadProducts = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, currency')
        .order('name')
        .limit(200);
      setProducts((data || []).map((p: any) => ({ id: p.id, name: p.name, currency: p.currency || 'INR' })));
    };
    loadProducts();
  }, []);

  // Load colors on mount
  useEffect(() => {
    const loadColors = async () => {
      const { data } = await adminApiService.getProductColors();
      setColors((data || []).map((c: any) => ({ id: c.id, name: c.name, hex: c.hex })));
    };
    loadColors();
  }, []);

  // Load variants when product selected
  const loadVariants = useCallback(async () => {
    if (!selectedProductId) {
      setVariants([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await adminApiService.getProductVariants(selectedProductId);
      if (err) throw new Error(err);
      setVariants(
        (data || []).map((v: any) => ({
          id: v.id,
          productId: v.product_id,
          sku: v.sku || '',
          sellerCode: v.seller_code,
          color: v.color,
          sizeSystem: v.size_system,
          sizeValue: v.size_value,
          price: v.price || 0,
          stock: v.stock || 0,
          createdAt: v.created_at,
        }))
      );
    } catch {
      setError('Failed to load variants');
    } finally {
      setLoading(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);

  const generateSKU = () => {
    const timestamp = Date.now().toString().slice(-4);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `SKU-${timestamp}-${random}`;
  };

  const handleAddVariant = async () => {
    if (!formData.price || !formData.stock || !formData.sizeValue || !selectedProductId) {
      alert('Please select a product and fill all required fields');
      return;
    }
    try {
      const payload = {
        product_id: selectedProductId,
        sku: formData.sku || generateSKU(),
        seller_code: formData.sellerCode || null,
        color: formData.color || null,
        size_system: formData.sizeSystem || null,
        size_value: formData.sizeValue,
        price: formData.price,
        stock: formData.stock,
      };

      if (editingVariant) {
        const { data, error: err } = await adminApiService.updateProductVariant(editingVariant.id, payload);
        if (err) throw new Error(err);
        setVariants(variants.map((v) => (v.id === editingVariant.id ? { ...v, ...data as any } : v)));
        setEditingVariant(null);
      } else {
        const { data, error: err } = await adminApiService.createProductVariant(payload);
        if (err) throw new Error(err);
        await loadVariants(); // Refresh the full list
        void data;
      }

      setFormData({ sku: '', sellerCode: '', color: '', sizeSystem: 'INTL_ALPHA', sizeValue: '', price: 0, stock: 0 });
      setShowAddVariant(false);
    } catch {
      alert('Failed to save variant');
    }
  };

  const handleDeleteVariant = async (id: string) => {
    if (!confirmOnce('Delete this variant?')) return;
    try {
      const { error: err } = await adminApiService.deleteProductVariant(id);
      if (err) throw new Error(err);
      setVariants(variants.filter((v) => v.id !== id));
    } catch {
      alert('Failed to delete variant');
    }
  };

  const handleAddColor = async () => {
    if (!newColor.name) {
      alert('Enter color name');
      return;
    }
    try {
      const { data, error: err } = await adminApiService.createProductColor({ name: newColor.name, hex: newColor.hex });
      if (err) throw new Error(err);
      setColors([...colors, { id: (data as any).id, name: newColor.name, hex: newColor.hex }]);
      setNewColor({ name: '', hex: '#000000' });
      setShowAddColor(false);
    } catch {
      alert('Failed to add color');
    }
  };

  const handleCopySKU = (sku: string) => {
    navigator.clipboard.writeText(sku);
  };

  const sizeOptions = SIZE_VALUES[formData.sizeSystem as keyof typeof SIZE_VALUES] || [];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Product Variants</h1>
            <p className="text-gray-600">Manage product variants with different colors, sizes, and prices</p>
          </div>
          <button
            onClick={() => setShowAddVariant(true)}
            disabled={!selectedProductId}
            className="flex items-center gap-2 bg-blue-600 text-gray-900 px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Plus className="h-5 w-5" />
            Add Variant
          </button>
        </div>

        {/* Product Selector */}
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow mb-8">
          <label className="block text-sm font-semibold text-gray-900 mb-2">Select Product</label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select a product --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
        )}

        {loading && (
          <div className="mb-6" role="status" aria-live="polite">
            <span className="sr-only">Loading variants...</span>
            <TableSkeleton rows={8} columns={6} />
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{variants.length}</div>
            <div className="text-gray-600">Total Variants</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <div className="text-xl sm:text-2xl font-bold text-green-600">
              {variants.reduce((sum, v) => sum + v.stock, 0)}
            </div>
            <div className="text-gray-600">Total Stock</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <div className="text-xl sm:text-2xl font-bold text-purple-600">{colors.length}</div>
            <div className="text-gray-600">Colors</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <div className="text-xl sm:text-2xl font-bold text-orange-600">
              {formatPrice(Math.max(...variants.map((v) => v.price)), products.find(p => p.id === selectedProductId)?.currency || 'INR')}
            </div>
            <div className="text-gray-600">Max Price</div>
          </div>
        </div>

        {/* Variants Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4 sm:mb-8">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">SKU</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Color</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Size</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Price</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Stock</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {variants.map((variant) => (
                <tr key={variant.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">{variant.sku}</span>
                      <button
                        onClick={() => handleCopySKU(variant.sku)}
                        className="text-gray-500 hover:text-gray-600"
                        title="Copy SKU"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {variant.color && (
                        <div
                          className="w-6 h-6 rounded border border-gray-300"
                          style={{
                            backgroundColor: colors.find((c) => c.name === variant.color)?.hex || '#ccc',
                          }}
                        />
                      )}
                      <span className="text-gray-900">{variant.color || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-900">
                      {variant.sizeValue} {variant.sizeSystem && `(${variant.sizeSystem})`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-semibold">{formatPrice(variant.price, products.find(p => p.id === selectedProductId)?.currency || 'INR')}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        variant.stock > 20
                          ? 'bg-green-100 text-green-800'
                          : variant.stock > 0
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {variant.stock} units
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingVariant(variant);
                          setFormData(variant);
                          setShowAddVariant(true);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button onClick={() => handleDeleteVariant(variant.id)} className="text-red-600 hover:text-red-900">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Colors Management */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <div className="flex justify-between items-center mb-3 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Colors</h2>
              <button
                onClick={() => setShowAddColor(true)}
                className="flex items-center gap-2 bg-green-600 text-gray-900 px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Color
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {colors.map((color) => (
                <div key={color.id} className="flex flex-col items-center gap-2">
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300 shadow"
                    style={{ backgroundColor: color.hex || '#ccc' }}
                  />
                  <span className="text-sm text-gray-900 font-semibold text-center">{color.name}</span>
                  <span className="text-xs text-gray-500 font-mono">{color.hex}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Size Systems Reference */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6">Size Systems</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {APPAREL_SIZE_SYSTEMS.map((system) => (
                <div key={system} className="border rounded-lg p-3">
                  <div className="text-sm font-semibold text-gray-900 mb-2">{system}</div>
                  <div className="text-xs text-gray-600">
                    {(SIZE_VALUES[system as keyof typeof SIZE_VALUES] || []).slice(0, 3).join(', ')}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Variant Modal */}
      {showAddVariant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6">
              {editingVariant ? 'Edit Variant' : 'Add New Variant'}
            </h2>

            <div className="space-y-6">
              {/* SKU */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">SKU</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.sku || ''}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Auto-generated or enter custom"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setFormData({ ...formData, sku: generateSKU() })}
                    className="bg-gray-600 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm"
                  >
                    Generate
                  </button>
                </div>
              </div>

              {/* Seller Code */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Seller Code (Optional)</label>
                <input
                  type="text"
                    value={formData.sellerCode || ''}
                    onChange={(e) => setFormData({ ...formData, sellerCode: e.target.value })}
                    placeholder="e.g., SC-001"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Color</label>
                <select
                  value={formData.color || ''}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Color</option>
                  {colors.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Size System & Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Size System</label>
                  <select
                    value={formData.sizeSystem || 'INTL_ALPHA'}
                    onChange={(e) => setFormData({ ...formData, sizeSystem: e.target.value, sizeValue: '' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {APPAREL_SIZE_SYSTEMS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Size Value</label>
                  <select
                    value={formData.sizeValue || ''}
                    onChange={(e) => setFormData({ ...formData, sizeValue: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Size</option>
                    {sizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Price & Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Price</label>
                  <input
                    type="number"
                    value={formData.price || 0}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    placeholder="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Stock</label>
                  <input
                    type="number"
                    value={formData.stock || 0}
                    onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
                    placeholder="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-6">
                <button
                  onClick={handleAddVariant}
                  className="flex-1 bg-blue-600 text-gray-900 px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  {editingVariant ? 'Update Variant' : 'Add Variant'}
                </button>
                <button
                  onClick={() => {
                    setShowAddVariant(false);
                    setEditingVariant(null);
                    setFormData({
                      sku: '',
                      sellerCode: '',
                      color: '',
                      sizeSystem: 'INTL_ALPHA',
                      sizeValue: '',
                      price: 0,
                      stock: 0,
                    });
                  }}
                  className="flex-1 bg-gray-300 text-gray-900 px-6 py-3 rounded-lg hover:bg-gray-400 transition-colors font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Color Modal */}
      {showAddColor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-4 sm:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6">Add New Color</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Color Name</label>
                <input
                  type="text"
                  value={newColor.name}
                  onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                  placeholder="e.g., Midnight Blue"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Hex Color</label>
                <div className="flex gap-4 items-center">
                  <input
                    type="color"
                    value={newColor.hex}
                    onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })}
                    className="w-20 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newColor.hex}
                    onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })}
                    placeholder="#000000"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleAddColor}
                  className="flex-1 bg-green-600 text-gray-900 px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
                >
                  Add Color
                </button>
                <button
                  onClick={() => {
                    setShowAddColor(false);
                    setNewColor({ name: '', hex: '#000000' });
                  }}
                  className="flex-1 bg-gray-300 text-gray-900 px-6 py-3 rounded-lg hover:bg-gray-400 transition-colors font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductVariantManagement;
