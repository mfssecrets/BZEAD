import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2, Truck } from 'lucide-react';
import { TableSkeleton } from '../../../components/common/Skeleton';
import { supabase } from '../../../lib/supabase';

const WEIGHT_UNITS = ['GM', 'KG', 'LB', 'OZ'] as const;

type WeightUnit = (typeof WEIGHT_UNITS)[number];

type ShippingRateRow = {
  id: number;
  product_origin_country_id: string;
  destination_country_id: string;
  weight_band_unit: WeightUnit;
  weight_band_from: number;
  weight_band_to: number;
  currency_code: string;
  standard_shipping_amount: number;
  standard_est_delivery_date: string;
  express_shipping_amount: number;
  express_est_delivery_date: string;
  created_at?: string;
  updated_at?: string;
};

type CountryOption = {
  id: string;
  country_code: string | null;
  country_name: string | null;
  currency_code: string | null;
};

type ShippingRateForm = {
  product_origin_country_id: string;
  destination_country_id: string;
  weight_band_unit: WeightUnit;
  weight_band_from: string;
  weight_band_to: string;
  currency_code: string;
  standard_shipping_amount: string;
  standard_est_delivery_date: string;
  express_shipping_amount: string;
  express_est_delivery_date: string;
};

const DEFAULT_FORM: ShippingRateForm = {
  product_origin_country_id: '',
  destination_country_id: '',
  weight_band_unit: 'KG',
  weight_band_from: '',
  weight_band_to: '',
  currency_code: 'INR',
  standard_shipping_amount: '',
  standard_est_delivery_date: '',
  express_shipping_amount: '',
  express_est_delivery_date: '',
};

const ShippingManagementPage: React.FC = () => {
  const [rows, setRows] = useState<ShippingRateRow[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRate, setNewRate] = useState<ShippingRateForm>({ ...DEFAULT_FORM });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ShippingRateRow>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const clearFlash = useCallback(() => {
    window.setTimeout(() => {
      setSuccess('');
      setError('');
    }, 3500);
  }, []);

  const countryById = useMemo(() => {
    const index = new Map<string, CountryOption>();
    for (const country of countries) {
      index.set(country.id, country);
    }
    return index;
  }, [countries]);

  const countryIdSet = useMemo(() => new Set(countries.map((c) => c.id)), [countries]);

  const currencyOptions = useMemo(() => {
    const unique = new Set(
      countries
        .map((c) => String(c.currency_code || '').trim().toUpperCase())
        .filter((code) => code.length === 3),
    );
    if (unique.size === 0) {
      return ['INR'];
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [countries]);

  const currencySet = useMemo(() => new Set(currencyOptions), [currencyOptions]);

  const formatCountryLabel = (countryId: string) => {
    const country = countryById.get(countryId);
    if (!country) return countryId;
    const name = String(country.country_name || '').trim();
    const code = String(country.country_code || '').trim().toUpperCase();
    if (name && code) return `${name} (${code})`;
    if (name) return name;
    if (code) return code;
    return countryId;
  };

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data, error: fetchError } = await supabase
      .from('product_origin_destination_shipping_rates')
      .select('*')
      .order('product_origin_country_id', { ascending: true })
      .order('destination_country_id', { ascending: true })
      .order('weight_band_unit', { ascending: true })
      .order('weight_band_from', { ascending: true })
      .order('weight_band_to', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
    } else {
      setRows((data || []) as ShippingRateRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  useEffect(() => {
    const fetchCountries = async () => {
      const { data, error: countriesError } = await supabase
        .from('countries')
        .select('id, country_code, country_name, currency_code')
        .eq('is_active', true)
        .order('country_name', { ascending: true });

      if (countriesError) {
        setError(countriesError.message);
        return;
      }

      setCountries((data || []) as CountryOption[]);
    };

    fetchCountries();
  }, []);

  useEffect(() => {
    if (countries.length === 0) return;

    const india = countries.find((c) => {
      const code = String(c.country_code || '').trim().toUpperCase();
      const name = String(c.country_name || '').trim().toUpperCase();
      return code === 'IND' || name === 'INDIA';
    });

    setNewRate((prev) => {
      const next = { ...prev };

      if (!next.product_origin_country_id && india) {
        next.product_origin_country_id = india.id;
      }

      if (!currencySet.has(next.currency_code) && currencyOptions.length > 0) {
        next.currency_code = currencyOptions.includes('INR') ? 'INR' : currencyOptions[0];
      }

      return next;
    });
  }, [countries, currencyOptions, currencySet]);

  const totalRoutes = useMemo(() => {
    const routeKeys = new Set(rows.map((r) => `${r.product_origin_country_id}|${r.destination_country_id}`));
    return routeKeys.size;
  }, [rows]);

  const resetAddForm = () => {
    setNewRate({ ...DEFAULT_FORM, currency_code: currencyOptions.includes('INR') ? 'INR' : currencyOptions[0] || 'INR' });
    setShowAddForm(false);
  };

  const parseDecimal = (value: string): number => Number.parseFloat(String(value || '').trim());
  const isValidEta = (value: string): boolean => {
    const normalized = String(value || '').trim();
    return normalized.length > 0 && normalized.length <= 120;
  };

  const validateCreateForm = (form: ShippingRateForm): string => {
    const fromValue = parseDecimal(form.weight_band_from);
    const toValue = parseDecimal(form.weight_band_to);
    const standardAmount = parseDecimal(form.standard_shipping_amount);
    const expressAmount = parseDecimal(form.express_shipping_amount);
    const unit = String(form.weight_band_unit || '').trim().toUpperCase();
    const currencyCode = String(form.currency_code || '').trim().toUpperCase();

    if (!countryIdSet.has(form.product_origin_country_id)) return 'Product origin country must be selected from Countries table.';
    if (!countryIdSet.has(form.destination_country_id)) return 'Destination country must be selected from Countries table.';
    if (!WEIGHT_UNITS.includes(unit as WeightUnit)) return 'Weight band unit must be one of GM, KG, LB, OZ.';
    if (Number.isNaN(fromValue) || fromValue < 0) return 'Weight band FROM must be a valid number >= 0.';
    if (Number.isNaN(toValue) || toValue <= fromValue) return 'Weight band TO must be a valid number greater than FROM.';
    if (!currencySet.has(currencyCode)) return 'Currency must be selected from admin currency options.';
    if (Number.isNaN(standardAmount) || standardAmount < 0) return 'Standard shipping amount must be a valid non-negative number.';
    if (Number.isNaN(expressAmount) || expressAmount < 0) return 'Express shipping amount must be a valid non-negative number.';
    if (!isValidEta(form.standard_est_delivery_date)) return 'Standard estimated delivery date is required (max 120 chars).';
    if (!isValidEta(form.express_est_delivery_date)) return 'Express estimated delivery date is required (max 120 chars).';

    return '';
  };

  const handleCreate = async () => {
    setError('');
    setSuccess('');

    const validationError = validateCreateForm(newRate);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    const payload = {
      product_origin_country_id: newRate.product_origin_country_id,
      destination_country_id: newRate.destination_country_id,
      weight_band_unit: String(newRate.weight_band_unit).toUpperCase(),
      weight_band_from: parseDecimal(newRate.weight_band_from),
      weight_band_to: parseDecimal(newRate.weight_band_to),
      currency_code: String(newRate.currency_code).trim().toUpperCase(),
      standard_shipping_amount: parseDecimal(newRate.standard_shipping_amount),
      standard_est_delivery_date: String(newRate.standard_est_delivery_date).trim(),
      express_shipping_amount: parseDecimal(newRate.express_shipping_amount),
      express_est_delivery_date: String(newRate.express_est_delivery_date).trim(),
    };

    const { error: insertError } = await supabase
      .from('product_origin_destination_shipping_rates')
      .insert(payload);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSuccess('Shipping rate created successfully.');
    resetAddForm();
    setSaving(false);
    await fetchRates();
    clearFlash();
  };

  const startEdit = (row: ShippingRateRow) => {
    setEditingId(row.id);
    setEditDraft({ ...row });
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const originCountryId = String(editDraft.product_origin_country_id || '').trim();
    const destinationCountryId = String(editDraft.destination_country_id || '').trim();
    const unit = String(editDraft.weight_band_unit || '').trim().toUpperCase();
    const fromValue = Number(editDraft.weight_band_from);
    const toValue = Number(editDraft.weight_band_to);
    const currencyCode = String(editDraft.currency_code || '').trim().toUpperCase();
    const standardAmount = Number(editDraft.standard_shipping_amount);
    const expressAmount = Number(editDraft.express_shipping_amount);
    const standardEta = String(editDraft.standard_est_delivery_date || '').trim();
    const expressEta = String(editDraft.express_est_delivery_date || '').trim();

    if (!countryIdSet.has(originCountryId)) {
      setError('Product origin country must be selected from Countries table.');
      return;
    }
    if (!countryIdSet.has(destinationCountryId)) {
      setError('Destination country must be selected from Countries table.');
      return;
    }
    if (!WEIGHT_UNITS.includes(unit as WeightUnit)) {
      setError('Weight band unit must be one of GM, KG, LB, OZ.');
      return;
    }
    if (Number.isNaN(fromValue) || fromValue < 0) {
      setError('Weight band FROM must be a valid number >= 0.');
      return;
    }
    if (Number.isNaN(toValue) || toValue <= fromValue) {
      setError('Weight band TO must be a valid number greater than FROM.');
      return;
    }
    if (!currencySet.has(currencyCode)) {
      setError('Currency must be selected from admin currency options.');
      return;
    }
    if (Number.isNaN(standardAmount) || standardAmount < 0) {
      setError('Standard shipping amount must be valid.');
      return;
    }
    if (Number.isNaN(expressAmount) || expressAmount < 0) {
      setError('Express shipping amount must be valid.');
      return;
    }
    if (!isValidEta(standardEta)) {
      setError('Standard estimated delivery date is required (max 120 chars).');
      return;
    }
    if (!isValidEta(expressEta)) {
      setError('Express estimated delivery date is required (max 120 chars).');
      return;
    }

    setSaving(true);
    setError('');

    const updates = {
      product_origin_country_id: originCountryId,
      destination_country_id: destinationCountryId,
      weight_band_unit: unit,
      weight_band_from: fromValue,
      weight_band_to: toValue,
      currency_code: currencyCode,
      standard_shipping_amount: standardAmount,
      standard_est_delivery_date: standardEta,
      express_shipping_amount: expressAmount,
      express_est_delivery_date: expressEta,
    };

    const { error: updateError } = await supabase
      .from('product_origin_destination_shipping_rates')
      .update(updates)
      .eq('id', editingId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSuccess('Shipping rate updated successfully.');
    setSaving(false);
    cancelEdit();
    await fetchRates();
    clearFlash();
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError('');
    setSuccess('');

    const { error: deleteError } = await supabase
      .from('product_origin_destination_shipping_rates')
      .delete()
      .eq('id', id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    setSuccess('Shipping rate deleted.');
    setDeletingId(null);
    await fetchRates();
    clearFlash();
  };

  const rateCurrencyLabel = String(newRate.currency_code || 'INR').trim().toUpperCase() || 'INR';

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Truck size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Shipping Management</h1>
              <p className="text-sm text-gray-500">Manage shipping by origin, destination, weight unit/range, and selected currency.</p>
            </div>
          </div>

          <button
            type="button"
            data-no-global-confirm="true"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} />
            {showAddForm ? 'Close Form' : 'Add Shipping Rate'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Total Records</p>
            <p className="text-lg font-semibold text-gray-900">{rows.length}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Total Routes</p>
            <p className="text-lg font-semibold text-gray-900">{totalRoutes}</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      ) : null}
      {success ? (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{success}</div>
      ) : null}

      {showAddForm ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Create Shipping Rate Row</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <select
              value={newRate.product_origin_country_id}
              onChange={(e) => setNewRate((prev) => ({ ...prev, product_origin_country_id: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Product Origin Country</option>
              {countries.map((country) => (
                <option key={`origin-${country.id}`} value={country.id}>
                  {formatCountryLabel(country.id)}
                </option>
              ))}
            </select>

            <select
              value={newRate.destination_country_id}
              onChange={(e) => setNewRate((prev) => ({ ...prev, destination_country_id: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Destination Country</option>
              {countries.map((country) => (
                <option key={`destination-${country.id}`} value={country.id}>
                  {formatCountryLabel(country.id)}
                </option>
              ))}
            </select>

            <select
              value={newRate.weight_band_unit}
              onChange={(e) => setNewRate((prev) => ({ ...prev, weight_band_unit: e.target.value as WeightUnit }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {WEIGHT_UNITS.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>

            <input
              type="number"
              step="0.001"
              min="0"
              value={newRate.weight_band_from}
              onChange={(e) => setNewRate((prev) => ({ ...prev, weight_band_from: e.target.value }))}
              placeholder="Weight Band FROM"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />

            <input
              type="number"
              step="0.001"
              min="0"
              value={newRate.weight_band_to}
              onChange={(e) => setNewRate((prev) => ({ ...prev, weight_band_to: e.target.value }))}
              placeholder="Weight Band TO"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />

            <select
              value={newRate.currency_code}
              onChange={(e) => setNewRate((prev) => ({ ...prev, currency_code: e.target.value.toUpperCase() }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {currencyOptions.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              min="0"
              value={newRate.standard_shipping_amount}
              onChange={(e) => setNewRate((prev) => ({ ...prev, standard_shipping_amount: e.target.value }))}
              placeholder={`Standard Shipping ${rateCurrencyLabel}`}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />

            <input
              value={newRate.standard_est_delivery_date}
              onChange={(e) => setNewRate((prev) => ({ ...prev, standard_est_delivery_date: e.target.value }))}
              placeholder="Standard ETA (e.g. 5-8 days)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />

            <input
              type="number"
              step="0.01"
              min="0"
              value={newRate.express_shipping_amount}
              onChange={(e) => setNewRate((prev) => ({ ...prev, express_shipping_amount: e.target.value }))}
              placeholder={`Express Shipping ${rateCurrencyLabel}`}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />

            <input
              value={newRate.express_est_delivery_date}
              onChange={(e) => setNewRate((prev) => ({ ...prev, express_est_delivery_date: e.target.value }))}
              placeholder="Express ETA (e.g. 2-4 days)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <button
              type="button"
              data-no-global-confirm="true"
              disabled={saving}
              onClick={handleCreate}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-4" role="status" aria-live="polite">
            <span className="sr-only">Loading shipping rates...</span>
            <TableSkeleton rows={8} columns={8} className="border-0" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">No shipping rows found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Origin</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Destination</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Unit</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Weight From</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Weight To</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Currency</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Standard Shipping</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Standard ETA</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Express Shipping</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Express ETA</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isEditing = editingId === row.id;
                  const draft = isEditing ? editDraft : row;

                  return (
                    <tr key={row.id} className="border-t border-gray-200">
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={String(draft.product_origin_country_id || '')}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, product_origin_country_id: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
                          >
                            <option value="">Select origin</option>
                            {countries.map((country) => (
                              <option key={`row-origin-${row.id}-${country.id}`} value={country.id}>
                                {formatCountryLabel(country.id)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="block px-2 py-1.5">{formatCountryLabel(row.product_origin_country_id)}</span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={String(draft.destination_country_id || '')}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, destination_country_id: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
                          >
                            <option value="">Select destination</option>
                            {countries.map((country) => (
                              <option key={`row-destination-${row.id}-${country.id}`} value={country.id}>
                                {formatCountryLabel(country.id)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="block px-2 py-1.5">{formatCountryLabel(row.destination_country_id)}</span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={String(draft.weight_band_unit || '')}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, weight_band_unit: e.target.value as WeightUnit }))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
                          >
                            {WEIGHT_UNITS.map((unit) => (
                              <option key={`${row.id}-${unit}`} value={unit}>{unit}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="block px-2 py-1.5">{String(row.weight_band_unit || '')}</span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          disabled={!isEditing}
                          type="number"
                          min="0"
                          step="0.001"
                          value={String(draft.weight_band_from ?? '')}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, weight_band_from: Number(e.target.value) }))}
                          className={`w-full border rounded-lg px-2 py-1.5 ${isEditing ? 'border-gray-300 bg-white' : 'border-transparent bg-transparent'}`}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          disabled={!isEditing}
                          type="number"
                          min="0"
                          step="0.001"
                          value={String(draft.weight_band_to ?? '')}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, weight_band_to: Number(e.target.value) }))}
                          className={`w-full border rounded-lg px-2 py-1.5 ${isEditing ? 'border-gray-300 bg-white' : 'border-transparent bg-transparent'}`}
                        />
                      </td>

                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={String(draft.currency_code || '')}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, currency_code: e.target.value.toUpperCase() }))}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
                          >
                            {currencyOptions.map((currency) => (
                              <option key={`row-currency-${row.id}-${currency}`} value={currency}>{currency}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="block px-2 py-1.5">{String(row.currency_code || '')}</span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          disabled={!isEditing}
                          type="number"
                          min="0"
                          step="0.01"
                          value={String(draft.standard_shipping_amount ?? '')}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, standard_shipping_amount: Number(e.target.value) }))}
                          className={`w-full border rounded-lg px-2 py-1.5 ${isEditing ? 'border-gray-300 bg-white' : 'border-transparent bg-transparent'}`}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          disabled={!isEditing}
                          value={String(draft.standard_est_delivery_date || '')}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, standard_est_delivery_date: e.target.value }))}
                          className={`w-full border rounded-lg px-2 py-1.5 ${isEditing ? 'border-gray-300 bg-white' : 'border-transparent bg-transparent'}`}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          disabled={!isEditing}
                          type="number"
                          min="0"
                          step="0.01"
                          value={String(draft.express_shipping_amount ?? '')}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, express_shipping_amount: Number(e.target.value) }))}
                          className={`w-full border rounded-lg px-2 py-1.5 ${isEditing ? 'border-gray-300 bg-white' : 'border-transparent bg-transparent'}`}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          disabled={!isEditing}
                          value={String(draft.express_est_delivery_date || '')}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, express_est_delivery_date: e.target.value }))}
                          className={`w-full border rounded-lg px-2 py-1.5 ${isEditing ? 'border-gray-300 bg-white' : 'border-transparent bg-transparent'}`}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                data-no-global-confirm="true"
                                disabled={saving}
                                onClick={handleSaveEdit}
                                className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-2.5 py-1.5 rounded-lg"
                              >
                                <Save size={14} /> Save
                              </button>
                              <button
                                type="button"
                                data-no-global-confirm="true"
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1 bg-gray-200 hover:bg-gray-300 text-gray-900 px-2.5 py-1.5 rounded-lg"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                data-no-global-confirm="true"
                                onClick={() => startEdit(row)}
                                className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                data-no-global-confirm="true"
                                disabled={deletingId === row.id}
                                onClick={() => handleDelete(row.id)}
                                className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-2.5 py-1.5 rounded-lg"
                              >
                                {deletingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShippingManagementPage;
