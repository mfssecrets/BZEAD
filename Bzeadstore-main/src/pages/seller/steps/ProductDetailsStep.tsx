import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Trash2, Palette } from 'lucide-react';
import { uploadProductImage } from '../../../lib/productService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  fetchMeasurementUnits,
  fetchPackingTypes,
  type MeasurementUnit,
  type PackingType,
} from '../../../lib/shippingDataService';
import { resolveVariantTheme, type VariantTheme } from '../../../config/variantThemeConfig';
import { useVariantPresetsVersion } from '../../../lib/variantSizePresetsService';

export interface SizeVariant {
  id: string;
  size: string;
  sizeSystem: string;
  sizeValue: string;
  sizeUnit: string;
  customUnit?: string;
  price: string;
  stock: string;
}

export interface ColorVariant {
  id: string;
  color: string;
  colorHex: string;
  sku: string;
  price: string;
  stock: string;
}

export interface VariantCombination {
  id: string;
  sizeSystem: string;
  sizeValue: string;
  sizeUnit: string;
  color: string;
  colorHex: string;
  sku: string;
  price: string;
  mrp: string;
  stock: string;
  images: string[];
}

export interface SpecRow {
  id: string;
  key: string;
  value: string;
}

export interface HighlightRow {
  id: string;
  text: string;
}

export interface ProductDetailsData {
  sizeVariants: SizeVariant[];
  colorVariants: ColorVariant[];
  variantCombinations: VariantCombination[];
  highlights: HighlightRow[];
  specifications: SpecRow[];
  packingTypeId: string;
  packageWeight: string;
  packageWeightUnitId: string;
  packageLength: string;
  packageLengthUnitId: string;
  packageWidth: string;
  packageWidthUnitId: string;
  packageHeight: string;
  packageHeightUnitId: string;
}

interface Props {
  data: ProductDetailsData;
  onChange: (data: ProductDetailsData) => void;
  disabled?: boolean;
  baseMrp?: string;
  baseSellingPrice?: string;
  productTypeSlug?: string;
  subCategorySlug?: string;
  categorySlug?: string;
}

let counter = 0;
const uid = () => `pd-${++counter}`;

const sanitizeDecimal = (value: string) => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const parts = normalized.split('.');
  return parts.length <= 2 ? normalized : `${parts[0]}.${parts.slice(1).join('')}`;
};

const sanitizeInteger = (value: string) => value.replace(/[^0-9]/g, '');

const sanitizeSku = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);

const CUSTOM_SIZE_VALUE = '__CUSTOM__';
const FREE_SIZE_VALUE = '__FREE__';

const ProductDetailsStep: React.FC<Props> = ({ data, onChange, disabled, baseMrp = '', baseSellingPrice = '', productTypeSlug, subCategorySlug, categorySlug }) => {
  const { user } = useAuth();
  const [packingTypes, setPackingTypes] = useState<PackingType[]>([]);
  const [weightUnits, setWeightUnits] = useState<MeasurementUnit[]>([]);
  const [dimensionUnits, setDimensionUnits] = useState<MeasurementUnit[]>([]);
  const [volumeUnits, setVolumeUnits] = useState<MeasurementUnit[]>([]);
  const [countUnits, setCountUnits] = useState<MeasurementUnit[]>([]);
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);
  const variantFileRef = useRef<HTMLInputElement>(null);
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);

  const presetsVersion = useVariantPresetsVersion();
  const theme: VariantTheme = useMemo(
    () => resolveVariantTheme(productTypeSlug, subCategorySlug, categorySlug),
    [productTypeSlug, subCategorySlug, categorySlug, presetsVersion],
  );

  // Size section is always offered. When the category theme does not define
  // preset sizes, sellers still get Free Size and Custom (with unit) options
  // so every listing can capture pack size / capacity / etc.
  const hasSizes = true;
  const hasColor = theme.hasColor;
  const colorLabel = theme.colorLabel || 'Color';

  useEffect(() => {
    fetchPackingTypes().then(({ data: rows }) => setPackingTypes(rows));
    fetchMeasurementUnits('weight').then(({ data: rows }) => setWeightUnits(rows));
    fetchMeasurementUnits('dimension').then(({ data: rows }) => setDimensionUnits(rows));
    fetchMeasurementUnits('volume').then(({ data: rows }) => setVolumeUnits(rows));
    fetchMeasurementUnits('count').then(({ data: rows }) => setCountUnits(rows));
  }, []);

  useEffect(() => {
    if (!data.packingTypeId && packingTypes.length > 0) {
      onChange({ ...data, packingTypeId: packingTypes[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packingTypes, data.packingTypeId]);

    const COMMON_FALLBACK_UNITS = [
      { value: 'CM', label: 'Centimeter (CM)' },
      { value: 'MM', label: 'Millimeter (MM)' },
      { value: 'M', label: 'Meter (M)' },
      { value: 'IN', label: 'Inch (IN)' },
      { value: 'FT', label: 'Feet (FT)' },
      { value: 'G', label: 'Gram (G)' },
      { value: 'KG', label: 'Kilogram (KG)' },
      { value: 'LB', label: 'Pound (LB)' },
      { value: 'OZ', label: 'Ounce (OZ)' },
      { value: 'ML', label: 'Milliliter (ML)' },
      { value: 'L', label: 'Liter (L)' },
      { value: 'PCS', label: 'Pieces (PCS)' },
      { value: 'PAIR', label: 'Pair (PAIR)' },
      { value: 'PACK', label: 'Pack (PACK)' },
    ] as const;
  useEffect(() => {
    if (weightUnits.length === 0) return;
    const patch: Partial<ProductDetailsData> = {};
    if (!data.packageWeightUnitId) patch.packageWeightUnitId = weightUnits[0].id;
    if (Object.keys(patch).length > 0) {
      onChange({ ...data, ...patch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightUnits, data.packageWeightUnitId]);

  useEffect(() => {
    if (dimensionUnits.length === 0) return;
    const patch: Partial<ProductDetailsData> = {};
    if (!data.packageLengthUnitId) patch.packageLengthUnitId = dimensionUnits[0].id;
    if (!data.packageWidthUnitId) patch.packageWidthUnitId = dimensionUnits[0].id;
    if (!data.packageHeightUnitId) patch.packageHeightUnitId = dimensionUnits[0].id;
    if (Object.keys(patch).length > 0) {
      onChange({ ...data, ...patch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensionUnits, data.packageLengthUnitId, data.packageWidthUnitId, data.packageHeightUnitId]);

  const update = (patch: Partial<ProductDetailsData>) => onChange({ ...data, ...patch });

  const selectedWeightUnitName = useMemo(
    () => weightUnits.find((unit) => unit.id === data.packageWeightUnitId)?.name || 'Unit',
    [weightUnits, data.packageWeightUnitId]
  );

  const sizeUnitOptions = useMemo(() => {
    const unitMap = new Map<string, string>();
    [...dimensionUnits, ...weightUnits, ...volumeUnits, ...countUnits].forEach((unit) => {
      const value = String(unit.code || unit.name || '').trim().toUpperCase();
      if (!value) return;
      const label = String(unit.name || unit.code || value).trim();
      if (!unitMap.has(value)) unitMap.set(value, label);
    });

    // Defense in depth: if any DB fetch fails or a unit is missing from the
    // master table, the hardcoded fallback guarantees the dropdown still has
    // every common option (ML, L, PCS, PAIR, PACK, etc.) so sellers can
    // always pick a unit and the form never blocks a listing.
    COMMON_FALLBACK_UNITS.forEach((unit) => {
      if (!unitMap.has(unit.value)) {
        unitMap.set(unit.value, unit.label);
      }
    });

    return [
      { value: 'NONE', label: 'No Unit' },
      ...Array.from(unitMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [dimensionUnits, weightUnits, volumeUnits, countUnits]);

  const addSize = () => {
    const defaultValue = theme.sizes.length > 0 ? theme.sizes[0].value : CUSTOM_SIZE_VALUE;
    const firstDbUnit = sizeUnitOptions.find((unit) => unit.value !== 'NONE')?.value || 'NONE';
    update({
      sizeVariants: [...data.sizeVariants, {
        id: uid(),
        size: '',
        sizeSystem: theme.sizeLabel || 'Size',
        sizeValue: defaultValue,
        sizeUnit: 'NONE',
        customUnit: firstDbUnit,
        price: '',
        stock: '',
      }],
    });
  };

  const addColor = () => {
    const newId = uid();
    update({
      colorVariants: [...data.colorVariants, {
        id: newId,
        color: '',
        colorHex: '',
        sku: '',
        price: '',
        stock: '',
      }],
    });
  };

  // Color picker modal state
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [pickerHex, setPickerHex] = useState<string>('#000000');
  const [pickerHexInput, setPickerHexInput] = useState<string>('000000');

  const openColorPicker = (rowId: string, currentHex: string) => {
    const safe = /^#[0-9A-Fa-f]{6}$/.test(currentHex) ? currentHex : '#000000';
    setPickerForId(rowId);
    setPickerHex(safe);
    setPickerHexInput(safe.replace('#', '').toUpperCase());
  };

  const closeColorPicker = () => {
    setPickerForId(null);
  };

  const applyColorPicker = () => {
    if (!pickerForId) return;
    const hex = /^#[0-9A-Fa-f]{6}$/.test(pickerHex) ? pickerHex.toLowerCase() : '#000000';
    update({
      colorVariants: data.colorVariants.map((item) =>
        item.id === pickerForId ? { ...item, colorHex: hex } : item,
      ),
    });
    setPickerForId(null);
  };

  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex);
    if (!m) return { r: 0, g: 0, b: 0 };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  };

  const setHexFromRgb = (r: number, g: number, b: number) => {
    const cl = (v: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(v) ? v : 0)));
    const next = `#${cl(r).toString(16).padStart(2, '0')}${cl(g).toString(16).padStart(2, '0')}${cl(b).toString(16).padStart(2, '0')}`.toUpperCase();
    setPickerHex(next);
    setPickerHexInput(next.replace('#', ''));
  };

  const syncCombinations = () => {
    const validSizes = data.sizeVariants
      .map((sizeRow) => ({
        sizeSystem: theme.sizeLabel || 'Size',
        sizeValue: sizeRow.sizeValue === CUSTOM_SIZE_VALUE
          ? String(sizeRow.size || '').trim()
          : sizeRow.sizeValue.trim(),
        sizeUnit: sizeRow.sizeValue === CUSTOM_SIZE_VALUE
          ? String(sizeRow.customUnit || sizeRow.sizeUnit || 'NONE').trim().toUpperCase() || 'NONE'
          : String(sizeRow.sizeUnit || 'NONE').trim().toUpperCase() || 'NONE',
      }))
      .filter((sizeRow) => sizeRow.sizeValue);

    const validColors = data.colorVariants
      .map((colorRow) => ({ color: colorRow.color.trim(), colorHex: colorRow.colorHex || '#000000' }))
      .filter((colorRow) => colorRow.color);

    const sizes = validSizes.length > 0 ? validSizes : [{ sizeSystem: theme.sizeLabel || 'Size', sizeValue: 'DEFAULT', sizeUnit: 'NONE' }];
    const colors = validColors.length > 0 ? validColors : [{ color: 'DEFAULT', colorHex: '#000000' }];

    const existingMap = new Map(data.variantCombinations.map((variant) => [
      `${variant.sizeSystem}|${variant.sizeValue}|${variant.sizeUnit}|${variant.color}`,
      variant,
    ]));

    const generated: VariantCombination[] = [];
    let index = 0;
    for (const sizeRow of sizes) {
      for (const colorRow of colors) {
        index += 1;
        const key = `${sizeRow.sizeSystem}|${sizeRow.sizeValue}|${sizeRow.sizeUnit}|${colorRow.color}`;
        const existing = existingMap.get(key);
        generated.push({
          id: existing?.id || uid(),
          sizeSystem: sizeRow.sizeSystem,
          sizeValue: sizeRow.sizeValue,
          sizeUnit: sizeRow.sizeUnit,
          color: colorRow.color,
          colorHex: colorRow.colorHex,
          sku: existing?.sku || `VR${Date.now().toString().slice(-6)}${String(index).padStart(3, '0')}`,
          price: existing?.price || baseSellingPrice || '',
          mrp: existing?.mrp || baseMrp || '',
          stock: existing?.stock || '',
          images: existing?.images || [],
        });
      }
    }

    update({ variantCombinations: generated });
  };

  const skuList = data.variantCombinations.map((variant) => sanitizeSku(variant.sku)).filter(Boolean);
  const duplicateSku = new Set(skuList).size !== skuList.length;
  const fallbackMrp = parseFloat(baseMrp || '0');
  const invalidPriceAgainstMrp = data.variantCombinations.some((variant) => {
    const price = parseFloat(variant.price || '0');
    const variantMrp = parseFloat(variant.mrp || '0') || fallbackMrp;
    return variantMrp > 0 && price > variantMrp;
  });

  const pickerRgb = hexToRgb(pickerHex);

  return (
    <div className="space-y-6">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Product Variants</h3>

      <div className={`grid grid-cols-1 ${hasSizes && hasColor ? 'lg:grid-cols-2' : ''} gap-4`}>
        {hasSizes && (
          <div className="border border-gray-200 rounded-sm p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">{theme.sizeLabel || 'Size'}</h4>
              <button type="button" onClick={addSize} disabled={disabled} className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-xs font-semibold hover:bg-blue-700">+ Add {theme.sizeLabel || 'Size'}</button>
            </div>

            {/* Size chart reference */}
            {theme.sizes.length > 0 && theme.sizes[0].chart && (
              <details className="mb-3">
                <summary className="text-xs text-blue-600 cursor-pointer font-medium">View International Size Chart</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-[11px] border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left border-b">{theme.sizeLabel || 'Size'}</th>
                        {theme.sizes[0].chart?.india !== undefined && <th className="px-2 py-1 text-left border-b">India</th>}
                        {theme.sizes[0].chart?.us !== undefined && <th className="px-2 py-1 text-left border-b">US</th>}
                        {theme.sizes[0].chart?.eu !== undefined && <th className="px-2 py-1 text-left border-b">EU</th>}
                        {theme.sizes[0].chart?.jp !== undefined && <th className="px-2 py-1 text-left border-b">JP</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {theme.sizes.map((s) => (
                        <tr key={s.value} className="border-b border-gray-100">
                          <td className="px-2 py-1 font-medium">{s.label}</td>
                          {s.chart?.india !== undefined && <td className="px-2 py-1">{s.chart.india}</td>}
                          {s.chart?.us !== undefined && <td className="px-2 py-1">{s.chart.us}</td>}
                          {s.chart?.eu !== undefined && <td className="px-2 py-1">{s.chart.eu}</td>}
                          {s.chart?.jp !== undefined && <td className="px-2 py-1">{s.chart.jp}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="space-y-2">
              {data.sizeVariants.map((row) => (
                <div key={row.id} className="relative space-y-2 border border-gray-100 rounded-sm p-2 pr-10">
                  <button
                    type="button"
                    onClick={() => update({ sizeVariants: data.sizeVariants.filter((item) => item.id !== row.id) })}
                    disabled={disabled}
                    aria-label="Remove size"
                    title="Remove"
                    className="absolute top-1 right-1 inline-flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-sm w-8 h-8 z-10"
                  ><Trash2 size={14} /></button>
                  {(() => {
                    const predefinedValues = new Set(theme.sizes.map((s) => s.value));
                    const isFreeSize = row.sizeValue === 'Free Size';
                    const isCustomTyped = row.sizeValue === CUSTOM_SIZE_VALUE
                      || (!!row.sizeValue && !predefinedValues.has(row.sizeValue) && !isFreeSize);
                    const selectedModeValue = isFreeSize
                      ? FREE_SIZE_VALUE
                      : (isCustomTyped || theme.sizes.length === 0)
                        ? CUSTOM_SIZE_VALUE
                        : '__PRESET__';
                    const selectedPresetValue = !isFreeSize && !isCustomTyped ? row.sizeValue : '';

                    return (
                      <>
                        <div>
                          <select
                            value={selectedModeValue}
                            onChange={(e) => {
                              const selected = e.target.value;
                              update({
                                sizeVariants: data.sizeVariants.map((item) => {
                                  if (item.id !== row.id) return item;
                                  if (selected === '__PRESET__') {
                                    const firstPreset = theme.sizes[0]?.value || '';
                                    return {
                                      ...item,
                                      sizeValue: firstPreset,
                                      size: firstPreset,
                                      sizeUnit: 'NONE',
                                      customUnit: 'NONE',
                                    };
                                  }
                                  if (selected === FREE_SIZE_VALUE) {
                                    return {
                                      ...item,
                                      sizeValue: 'Free Size',
                                      size: 'Free Size',
                                      sizeUnit: 'NONE',
                                      customUnit: 'NONE',
                                    };
                                  }
                                  if (selected === CUSTOM_SIZE_VALUE) {
                                    const firstDbUnit = sizeUnitOptions.find((unit) => unit.value !== 'NONE')?.value || 'NONE';
                                    return {
                                      ...item,
                                      sizeValue: CUSTOM_SIZE_VALUE,
                                      size: item.size && item.size !== 'Free Size' ? item.size : '',
                                      sizeUnit: item.sizeUnit && item.sizeUnit !== 'NONE' ? item.sizeUnit : firstDbUnit,
                                      customUnit: item.customUnit && item.customUnit !== 'NONE' ? item.customUnit : firstDbUnit,
                                    };
                                  }
                                  return item;
                                }),
                              });
                            }}
                            disabled={disabled}
                            className="w-full border border-gray-200 rounded-sm px-2 py-2 text-xs"
                          >
                            {theme.sizes.length > 0 && (
                              <option value="__PRESET__">Preset {theme.sizeLabel || 'Size'}</option>
                            )}
                            <option value={FREE_SIZE_VALUE}>Free Size</option>
                            <option value={CUSTOM_SIZE_VALUE}>Custom</option>
                          </select>
                        </div>

                        {selectedModeValue === '__PRESET__' && (
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <select
                              value={selectedPresetValue}
                              onChange={(e) => update({
                                sizeVariants: data.sizeVariants.map((item) => item.id === row.id
                                  ? {
                                    ...item,
                                    sizeValue: e.target.value,
                                    size: e.target.value,
                                    sizeUnit: 'NONE',
                                    customUnit: 'NONE',
                                  }
                                  : item),
                              })}
                              disabled={disabled}
                              className="col-span-12 border border-gray-200 rounded-sm px-2 py-2 text-xs"
                            >
                              <option value="">Select {theme.sizeLabel || 'Size'}</option>
                              {theme.sizes.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {selectedModeValue === FREE_SIZE_VALUE && (
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <input
                              value="Free Size"
                              readOnly
                              className="col-span-12 border border-gray-200 bg-gray-50 rounded-sm px-2 py-2 text-xs"
                            />
                          </div>
                        )}

                        {selectedModeValue === CUSTOM_SIZE_VALUE && (
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <input
                              value={row.sizeValue === CUSTOM_SIZE_VALUE ? row.size : row.sizeValue}
                              onChange={(e) => update({
                                sizeVariants: data.sizeVariants.map((item) => item.id === row.id
                                  ? {
                                    ...item,
                                    sizeValue: CUSTOM_SIZE_VALUE,
                                    size: e.target.value,
                                  }
                                  : item),
                              })}
                              placeholder={`Enter custom ${theme.sizeLabel || 'size'}`}
                              disabled={disabled}
                              className="col-span-8 border border-gray-200 rounded-sm px-2 py-2 text-xs"
                            />
                            <select
                              value={(row.customUnit || row.sizeUnit || 'NONE').toUpperCase()}
                              onChange={(e) => update({
                                sizeVariants: data.sizeVariants.map((item) => item.id === row.id
                                  ? {
                                    ...item,
                                    sizeValue: CUSTOM_SIZE_VALUE,
                                    customUnit: e.target.value,
                                    sizeUnit: e.target.value,
                                  }
                                  : item),
                              })}
                              disabled={disabled}
                              className="col-span-4 border border-gray-200 rounded-sm px-2 py-2 text-xs"
                            >
                              {sizeUnitOptions
                                .filter((unit) => unit.value !== 'NONE')
                                .map((unit) => (
                                  <option key={unit.value} value={unit.value}>{unit.label}</option>
                                ))}
                            </select>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasColor && (
          <div className="border border-gray-200 rounded-sm p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">{colorLabel}</h4>
              <button type="button" onClick={addColor} disabled={disabled} className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-xs font-semibold hover:bg-blue-700">+ Add {colorLabel}</button>
            </div>
            <div className="space-y-2">
              {data.colorVariants.map((row) => {
                const needsPick = !row.colorHex;
                return (
                  <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      value={row.color}
                      onChange={(e) => update({ colorVariants: data.colorVariants.map((item) => item.id === row.id ? { ...item, color: e.target.value } : item) })}
                      onBlur={() => { if (row.color.trim() && !row.colorHex) openColorPicker(row.id, row.colorHex || '#000000'); }}
                      placeholder={`${colorLabel} name`}
                      disabled={disabled}
                      className="col-span-6 sm:col-span-6 border border-gray-200 rounded-sm px-2 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => openColorPicker(row.id, row.colorHex || '#000000')}
                      disabled={disabled}
                      className={`col-span-4 sm:col-span-4 inline-flex items-center justify-center gap-1.5 border rounded-sm px-2 py-2 text-[11px] font-medium hover:bg-gray-50 ${needsPick ? 'border-red-300 text-red-600 bg-red-50' : 'border-gray-200 text-gray-700'}`}
                      title={needsPick ? 'Pick a color (required)' : 'Change color'}
                    >
                      {row.colorHex ? (
                        <span className="inline-block w-4 h-4 rounded-sm border border-gray-300" style={{ backgroundColor: row.colorHex }} />
                      ) : (
                        <Palette size={14} />
                      )}
                      <span>{row.colorHex ? row.colorHex.toUpperCase() : 'Pick color'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => update({ colorVariants: data.colorVariants.filter((item) => item.id !== row.id) })}
                      disabled={disabled}
                      aria-label="Remove color"
                      title="Remove"
                      className="col-span-2 sm:col-span-2 inline-flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-sm px-2 py-2"
                    ><Trash2 size={14} /></button>
                  </div>
                );
              })}
              {data.colorVariants.length === 0 && (
                <p className="text-[11px] text-gray-500">No {colorLabel.toLowerCase()} added yet. Click "Add {colorLabel}" above.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {(hasSizes || hasColor) && (
        <div className="space-y-1">
          <div className="flex justify-end">
            <button type="button" onClick={syncCombinations} disabled={disabled} className="px-4 py-2 bg-blue-600 text-white rounded-sm text-sm font-semibold hover:bg-blue-700">Generate Variant Combinations</button>
          </div>
          {data.variantCombinations.length === 0 && (data.sizeVariants.length > 0 || data.colorVariants.length > 0) && (
            <p className="text-[11px] text-red-600 text-right">Click "Generate Variant Combinations" to continue.</p>
          )}
        </div>
      )}

      {data.variantCombinations.length > 0 && (
        <div className="border border-gray-200 rounded-sm overflow-hidden">
          <div className="bg-blue-50 px-4 py-2.5 text-sm font-semibold text-gray-900">Variant Rows</div>

          {/* Hidden file input for variant images */}
          <input
            ref={variantFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              const targetId = pendingVariantId;
              if (!files.length || !targetId || !user?.id) return;
              setUploadingVariantId(targetId);
              try {
                const urls: string[] = [];
                for (const file of files.slice(0, 5)) {
                  const url = await uploadProductImage(file, user.id);
                  urls.push(url);
                }
                update({
                  variantCombinations: data.variantCombinations.map((item) =>
                    item.id === targetId
                      ? { ...item, images: [...item.images, ...urls].slice(0, 10) }
                      : item
                  ),
                });
              } finally {
                setUploadingVariantId(null);
                setPendingVariantId(null);
                if (variantFileRef.current) variantFileRef.current.value = '';
              }
            }}
          />

          <div className="divide-y divide-gray-200">
            {data.variantCombinations.map((variant) => {
              const sizePart = variant.sizeValue && variant.sizeValue !== 'DEFAULT' ? variant.sizeValue : '';
              const colorPart = variant.color && variant.color !== 'DEFAULT' ? variant.color : '';
              const label = [colorPart, sizePart].filter(Boolean).join(' / ') || 'Default';
              const priceNum = parseFloat(variant.price || '0');
              const mrpNum = parseFloat(variant.mrp || '0');
              const stockNum = parseInt(variant.stock || '0');
              const rowErrors: string[] = [];
              if (!String(variant.sku || '').trim()) rowErrors.push('SKU missing');
              if (!Number.isFinite(priceNum) || priceNum <= 0) rowErrors.push('Selling Price required');
              if (!Number.isFinite(mrpNum) || mrpNum <= 0) rowErrors.push('MRP required');
              if (priceNum > 0 && mrpNum > 0 && priceNum > mrpNum) rowErrors.push('Selling Price cannot exceed MRP');
              if (!Number.isFinite(stockNum) || stockNum < 0 || !variant.stock) rowErrors.push('Stock required');

              return (
                <div key={variant.id} className="px-4 py-3 space-y-2">
                  <div className="text-xs font-semibold text-gray-900">{label}</div>

                  {/* Each label is paired with its own input so the heading always
                      sits directly above its box — on mobile (2 cols) and desktop (4 cols). */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-2.5">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">SKU <span className="text-gray-400 normal-case font-normal">(auto)</span></label>
                      <input value={variant.sku} readOnly tabIndex={-1} title="Auto-generated SKU" className="w-full border border-gray-200 bg-gray-50 text-gray-600 rounded-sm px-2 py-1.5 text-xs cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Selling Price (₹) <span className="text-red-500">*</span></label>
                      <input value={variant.price} onChange={(e) => update({ variantCombinations: data.variantCombinations.map((item) => item.id === variant.id ? { ...item, price: sanitizeDecimal(e.target.value) } : item) })} placeholder="e.g. 399" disabled={disabled} className="w-full border border-gray-200 rounded-sm px-2 py-1.5 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">MRP (₹) <span className="text-red-500">*</span></label>
                      <input value={variant.mrp} onChange={(e) => update({ variantCombinations: data.variantCombinations.map((item) => item.id === variant.id ? { ...item, mrp: sanitizeDecimal(e.target.value) } : item) })} placeholder="e.g. 500" disabled={disabled} className="w-full border border-gray-200 rounded-sm px-2 py-1.5 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Stock <span className="text-red-500">*</span></label>
                      <input value={variant.stock} onChange={(e) => update({ variantCombinations: data.variantCombinations.map((item) => item.id === variant.id ? { ...item, stock: sanitizeInteger(e.target.value) } : item) })} placeholder="e.g. 25" disabled={disabled} className="w-full border border-gray-200 rounded-sm px-2 py-1.5 text-xs" />
                    </div>
                  </div>

                  {rowErrors.length > 0 && (
                    <div className="text-[11px] text-red-600">
                      <strong>{label}:</strong> {rowErrors.join(' · ')}
                    </div>
                  )}

                  {/* Row 2: Per-variant images */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {variant.images.map((url, i) => (
                      <div key={i} className="relative w-12 h-12 rounded border border-gray-200 overflow-hidden group">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => update({ variantCombinations: data.variantCombinations.map((item) => item.id === variant.id ? { ...item, images: item.images.filter((_, idx) => idx !== i) } : item) })}
                          className="absolute -top-0.5 -right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md hover:bg-red-700"
                        >✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={disabled || uploadingVariantId === variant.id || variant.images.length >= 10}
                      onClick={() => {
                        setPendingVariantId(variant.id);
                        variantFileRef.current?.click();
                      }}
                      className="w-12 h-12 rounded border-2 border-dashed border-gray-300 text-gray-400 text-lg flex items-center justify-center hover:border-blue-400 hover:text-blue-500 disabled:opacity-40"
                    >
                      {uploadingVariantId === variant.id ? '…' : '+'}
                    </button>
                    <span className="text-[10px] text-gray-400">{variant.images.length}/10</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {duplicateSku && <p className="text-xs text-red-600">Duplicate SKU found. Every variant SKU must be unique.</p>}
      {invalidPriceAgainstMrp && <p className="text-xs text-red-600">One or more variant Selling Prices exceed their MRP. Selling Price must be less than or equal to MRP.</p>}

      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Add a Product Highlight <span className="text-red-600">*</span>
        </label>
        {(() => {
          const text = (data.highlights[0]?.text ?? '').slice(0, 400);
          const remaining = 400 - text.length;
          return (
            <>
              <textarea
                value={text}
                maxLength={400}
                onChange={(e) => {
                  const next = e.target.value.slice(0, 400);
                  update({ highlights: next.trim() ? [{ id: data.highlights[0]?.id || uid(), text: next }] : [] });
                }}
                rows={4}
                disabled={disabled}
                placeholder="Write a short paragraph about what makes this product special (max 400 characters)."
                className="w-full border border-gray-200 rounded-sm px-3 py-2 text-xs"
              />
              <div className="flex items-center justify-between mt-1">
                <p className={`text-[11px] ${text.trim().length === 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {text.trim().length === 0 ? 'Product highlight is required.' : 'A clear highlight helps buyers decide faster.'}
                </p>
                <p className={`text-[11px] ${remaining <= 20 ? 'text-orange-600' : 'text-gray-400'}`}>{text.length}/400</p>
              </div>
            </>
          );
        })()}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          Add Product Specification <span className="text-red-600">*</span>
        </label>
        <div className="space-y-2">
          {data.specifications.map((spec) => (
            <div key={spec.id} className="grid grid-cols-12 gap-2">
              <input value={spec.key} onChange={(e) => update({ specifications: data.specifications.map((item) => item.id === spec.id ? { ...item, key: e.target.value } : item) })} placeholder="Attribute (e.g. Material)" disabled={disabled} className="col-span-5 border border-gray-200 rounded-sm px-2 py-2 text-xs" />
              <input value={spec.value} onChange={(e) => update({ specifications: data.specifications.map((item) => item.id === spec.id ? { ...item, value: e.target.value } : item) })} placeholder="Value (e.g. Cotton)" disabled={disabled} className="col-span-5 border border-gray-200 rounded-sm px-2 py-2 text-xs" />
              <button
                type="button"
                onClick={() => update({ specifications: data.specifications.filter((item) => item.id !== spec.id) })}
                disabled={disabled}
                aria-label="Remove specification"
                title="Remove"
                className="col-span-2 inline-flex items-center justify-center bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-sm px-2 py-2"
              ><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => update({ specifications: [...data.specifications, { id: uid(), key: '', value: '' }] })} disabled={disabled} className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-xs font-semibold hover:bg-blue-700">+ Add Specification</button>
          {data.specifications.filter((s) => s.key.trim() && s.value.trim()).length === 0 && (
            <p className="text-[11px] text-red-600">At least one specification (attribute &amp; value) is required.</p>
          )}
        </div>
      </div>

      <div>
        <div className="bg-blue-700 text-white text-center font-bold text-sm sm:text-base px-3 py-2.5 rounded-t-sm uppercase tracking-wide">
          Product Packing Details
        </div>
        <div className="border border-blue-700 border-t-0 rounded-b-sm p-3 sm:p-4 space-y-3">
          <div className="bg-blue-700 text-white text-center text-[11px] sm:text-xs font-semibold px-3 py-2 rounded-md">
            Enter correct package weight and dimensions to avoid delivery issues and extra shipping charges.
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1">
              Packing Type <span className="text-red-600">*</span>
            </label>
            <select
              value={data.packingTypeId}
              onChange={(e) => update({ packingTypeId: e.target.value })}
              disabled={disabled}
              className="w-full border border-gray-200 rounded-sm px-2 py-2 text-xs"
            >
              <option value="">Select packing type</option>
              {packingTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2 mb-1">
              <div className="text-xs font-semibold text-gray-900">
                Package Weight <span className="text-red-600">*</span>
              </div>
              <div className="text-xs font-semibold text-gray-900">
                Package Unit <span className="text-red-600">*</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={data.packageWeight}
                onChange={(e) => update({ packageWeight: sanitizeDecimal(e.target.value) })}
                placeholder="Weight value"
                disabled={disabled}
                className="border border-gray-200 rounded-sm px-2 py-2 text-xs"
              />
              <select
                value={data.packageWeightUnitId}
                onChange={(e) => update({ packageWeightUnitId: e.target.value })}
                disabled={disabled}
                className="border border-gray-200 rounded-sm px-2 py-2 text-xs"
              >
                <option value="">Select unit</option>
                {weightUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Shipping rate calculations normalize weight into kilograms.</p>
          </div>

          <div className="space-y-2">
            {([
              { label: 'Package Length', value: data.packageLength, unitId: data.packageLengthUnitId, vKey: 'packageLength' as const, uKey: 'packageLengthUnitId' as const },
              { label: 'Package Width', value: data.packageWidth, unitId: data.packageWidthUnitId, vKey: 'packageWidth' as const, uKey: 'packageWidthUnitId' as const },
              { label: 'Package Height', value: data.packageHeight, unitId: data.packageHeightUnitId, vKey: 'packageHeight' as const, uKey: 'packageHeightUnitId' as const },
            ]).map((row) => (
              <div key={row.vKey}>
                <div className="grid grid-cols-2 gap-2 mb-1">
                  <div className="text-xs font-semibold text-gray-900">
                    {row.label} <span className="text-red-600">*</span>
                  </div>
                  <div className="text-xs font-semibold text-gray-900">
                    Unit <span className="text-red-600">*</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={row.value}
                    onChange={(e) => update({ [row.vKey]: sanitizeDecimal(e.target.value) } as Partial<ProductDetailsData>)}
                    placeholder={row.label}
                    disabled={disabled}
                    className="border border-gray-200 rounded-sm px-2 py-2 text-xs"
                  />
                  <select
                    value={row.unitId}
                    onChange={(e) => update({ [row.uKey]: e.target.value } as Partial<ProductDetailsData>)}
                    disabled={disabled}
                    className="border border-gray-200 rounded-sm px-2 py-2 text-xs"
                  >
                    <option value="">Select unit</option>
                    {dimensionUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-gray-500 mt-1">Current weight unit: {selectedWeightUnitName}.</p>
          </div>
        </div>
      </div>

      {pickerForId !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3" onClick={closeColorPicker}>
          <div className="bg-white rounded-md shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">Pick a Color</h4>
              <button type="button" onClick={closeColorPicker} className="text-gray-500 hover:text-gray-700" aria-label="Close"><X size={16} /></button>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <input
                type="color"
                value={pickerHex}
                onChange={(e) => { setPickerHex(e.target.value.toUpperCase()); setPickerHexInput(e.target.value.replace('#', '').toUpperCase()); }}
                className="w-16 h-16 border border-gray-200 rounded-sm cursor-pointer"
              />
              <div className="flex-1">
                <div className="w-full h-16 rounded-sm border border-gray-200" style={{ backgroundColor: pickerHex }} />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">Color Code (HEX)</label>
              <div className="flex items-center border border-gray-200 rounded-sm overflow-hidden">
                <span className="px-2 py-2 bg-gray-50 text-xs text-gray-500">#</span>
                <input
                  value={pickerHexInput}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
                    setPickerHexInput(clean);
                    if (clean.length === 6) setPickerHex(`#${clean}`);
                  }}
                  placeholder="RRGGBB"
                  className="flex-1 px-2 py-2 text-xs outline-none uppercase tracking-wider"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {(['r', 'g', 'b'] as const).map((channel) => (
                <div key={channel}>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1 uppercase">{channel}</label>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={pickerRgb[channel]}
                    onChange={(e) => {
                      const v = parseInt(e.target.value || '0', 10);
                      const next = { ...pickerRgb, [channel]: Math.max(0, Math.min(255, Number.isFinite(v) ? v : 0)) };
                      setHexFromRgb(next.r, next.g, next.b);
                    }}
                    className="w-full border border-gray-200 rounded-sm px-2 py-2 text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeColorPicker}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-sm"
              >Cancel</button>
              <button
                type="button"
                onClick={applyColorPicker}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-sm"
              >Select</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetailsStep;
