import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Loader2, Plus, Trash2, Save, X, Globe, Pencil } from 'lucide-react';
import { TableSkeleton } from '../../../components/common/Skeleton';

/* ── Types ──────────────────────────────────────────────── */

interface RateRow {
  id: string;
  country_code: string;
  country_name: string;
  service_type: string;
  weight_min_kg: number;
  weight_max_kg: number;
  rate_inr: number;
  expected_delivery_days: number;
  is_active: boolean;
}

interface CountryOption {
  country_code: string;
  country_name: string;
}

interface NewRate {
  country_code: string;
  country_name: string;
  service_type: string;
  weight_min_kg: string;
  weight_max_kg: string;
  rate_inr: string;
  expected_delivery_days: string;
}

const SERVICE_TYPES = [
  { value: 'dlv_saver', label: 'DLV Saver' },
  { value: 'express', label: 'Express' },
  { value: 'deferred_express', label: 'Deferred Express' },
  { value: 'document', label: 'Document' },
];

const WEIGHT_BANDS = [
  { min: 0, max: 0.5, label: '0–0.5 kg' },
  { min: 0.5, max: 1, label: '0.5–1 kg' },
  { min: 1, max: 2, label: '1–2 kg' },
  { min: 2, max: 3, label: '2–3 kg' },
  { min: 3, max: 5, label: '3–5 kg' },
  { min: 5, max: 10, label: '5–10 kg' },
  { min: 10, max: 20, label: '10–20 kg' },
  { min: 20, max: 50, label: '20–50 kg' },
];

const DEFAULT_NEW: NewRate = {
  country_code: '',
  country_name: '',
  service_type: 'dlv_saver',
  weight_min_kg: '0',
  weight_max_kg: '0.5',
  rate_inr: '',
  expected_delivery_days: '11',
};

/* ── Main Page ──────────────────────────────────────────── */

export default function IntlRateCardPage() {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterService, setFilterService] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newRate, setNewRate] = useState<NewRate>({ ...DEFAULT_NEW });
  const [deleteTarget, setDeleteTarget] = useState<RateRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch countries from backend
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('countries')
        .select('country_code, country_name')
        .eq('is_active', true)
        .order('country_name');
      if (data) setCountries(data as CountryOption[]);
    })();
  }, []);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('intl_rate_card')
      .select('*')
      .order('country_code', { ascending: true })
      .order('service_type', { ascending: true })
      .order('weight_min_kg', { ascending: true });

    if (filterCountry) {
      query = query.ilike('country_code', filterCountry.toUpperCase());
    }
    if (filterService) {
      query = query.eq('service_type', filterService);
    }

    const { data, error: fetchErr } = await query;
    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setRates((data || []) as RateRow[]);
    }
    setLoading(false);
  }, [filterCountry, filterService]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Auto-fill country name when country code changes in Add form
  const handleCountryCodeChange = (code: string) => {
    const match = countries.find((c) => c.country_code === code);
    setNewRate({ ...newRate, country_code: code, country_name: match?.country_name || '' });
  };

  const handleAdd = async () => {
    const code = newRate.country_code.trim().toUpperCase();
    const name = newRate.country_name.trim();
    const rate = parseFloat(newRate.rate_inr);
    const minKg = parseFloat(newRate.weight_min_kg);
    const maxKg = parseFloat(newRate.weight_max_kg);
    const days = parseInt(newRate.expected_delivery_days, 10);

    if (!code || !name || !rate || isNaN(rate) || rate < 0) {
      setError('Fill all fields with valid values');
      return;
    }
    if (isNaN(minKg) || isNaN(maxKg) || maxKg <= minKg) {
      setError('Invalid weight band');
      return;
    }
    if (isNaN(days) || days < 1) {
      setError('Expected delivery days must be at least 1');
      return;
    }

    setSaving(true);
    setError('');
    const { error: insertErr } = await supabase.from('intl_rate_card').insert({
      country_code: code,
      country_name: name,
      service_type: newRate.service_type,
      weight_min_kg: minKg,
      weight_max_kg: maxKg,
      rate_inr: rate,
      expected_delivery_days: days,
    });

    if (insertErr) {
      setError(insertErr.message);
    } else {
      setSuccess('Rate added');
      setNewRate({ ...DEFAULT_NEW });
      setShowAdd(false);
      await fetchRates();
      setTimeout(() => setSuccess(''), 3000);
    }
    setSaving(false);
  };

  const handleBulkAdd = async () => {
    const code = newRate.country_code.trim().toUpperCase();
    const name = newRate.country_name.trim();
    const days = parseInt(newRate.expected_delivery_days, 10);
    if (!code || !name) {
      setError('Select a country first');
      return;
    }

    setSaving(true);
    setError('');

    const rows = WEIGHT_BANDS.map((band) => ({
      country_code: code,
      country_name: name,
      service_type: newRate.service_type,
      weight_min_kg: band.min,
      weight_max_kg: band.max,
      rate_inr: 0,
      expected_delivery_days: isNaN(days) || days < 1 ? 11 : days,
    }));

    const { error: insertErr } = await supabase.from('intl_rate_card').insert(rows);
    if (insertErr) {
      setError(insertErr.message);
    } else {
      setSuccess(`Added ${WEIGHT_BANDS.length} weight bands for ${code}. Set rates below.`);
      setNewRate({ ...DEFAULT_NEW });
      setShowAdd(false);
      await fetchRates();
      setTimeout(() => setSuccess(''), 5000);
    }
    setSaving(false);
  };

  const handleUpdateRow = async (id: string, updates: Partial<Pick<RateRow, 'rate_inr' | 'expected_delivery_days' | 'service_type' | 'weight_min_kg' | 'weight_max_kg'>>) => {
    const { error: updateErr } = await supabase
      .from('intl_rate_card')
      .update(updates)
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
      return false;
    }
    setRates((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    return true;
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { error: updateErr } = await supabase
      .from('intl_rate_card')
      .update({ is_active: active })
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setRates((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: active } : r)));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: deleteErr } = await supabase.from('intl_rate_card').delete().eq('id', deleteTarget.id);
    if (deleteErr) {
      setError(deleteErr.message);
    } else {
      setRates((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setSuccess('Rate deleted');
      setTimeout(() => setSuccess(''), 3000);
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  // Group rates by country for display
  const grouped = new Map<string, RateRow[]>();
  rates.forEach((r) => {
    const key = `${r.country_code}|${r.country_name}`;
    const list = grouped.get(key) || [];
    list.push(r);
    grouped.set(key, list);
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Globe size={24} className="text-blue-600" />
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">International Rate Card</h1>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          data-no-global-confirm="true"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {showAdd ? <X size={16} /> : <Plus size={16} />}
          {showAdd ? 'Cancel' : 'Add Rate'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold" data-no-global-confirm="true">&times;</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Add form — Country Code from backend countries table */}
      {showAdd && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Add New Rate</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Country Code</label>
              <select
                value={newRate.country_code}
                onChange={(e) => handleCountryCodeChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {countries.map((c) => (
                  <option key={c.country_code} value={c.country_code}>{c.country_code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Country Name</label>
              <input
                value={newRate.country_name}
                readOnly
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Service Type</label>
              <select
                value={newRate.service_type}
                onChange={(e) => setNewRate({ ...newRate, service_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {SERVICE_TYPES.map((st) => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Weight Min (kg)</label>
              <input
                type="number"
                step="0.1"
                value={newRate.weight_min_kg}
                onChange={(e) => setNewRate({ ...newRate, weight_min_kg: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Weight Max (kg)</label>
              <input
                type="number"
                step="0.1"
                value={newRate.weight_max_kg}
                onChange={(e) => setNewRate({ ...newRate, weight_max_kg: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Rate (INR)</label>
              <input
                type="number"
                step="0.01"
                value={newRate.rate_inr}
                onChange={(e) => setNewRate({ ...newRate, rate_inr: e.target.value })}
                placeholder="871.18"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Delivery (days)</label>
              <input
                type="number"
                min="1"
                value={newRate.expected_delivery_days}
                onChange={(e) => setNewRate({ ...newRate, expected_delivery_days: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAdd}
              disabled={saving}
              data-no-global-confirm="true"
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Add Single Rate
            </button>
            <button
              onClick={handleBulkAdd}
              disabled={saving}
              data-no-global-confirm="true"
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add All Weight Bands (set rates later)
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
        >
          <option value="">All Countries</option>
          {countries.map((c) => (
            <option key={c.country_code} value={c.country_code}>{c.country_code} — {c.country_name}</option>
          ))}
        </select>
        <select
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Services</option>
          {SERVICE_TYPES.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 self-center">{rates.length} rates</span>
      </div>

      {/* Rate table grouped by country */}
      {loading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading rates...</span>
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : rates.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No rates found. Click &quot;Add Rate&quot; to create your first entry.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([key, countryRates]) => {
            const [code, name] = key.split('|');
            return (
              <div key={key} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">
                    {name} <span className="text-gray-400 font-normal">({code})</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                        <th className="px-4 py-2 text-left">Service</th>
                        <th className="px-4 py-2 text-left">Weight Band</th>
                        <th className="px-4 py-2 text-right">Rate (INR)</th>
                        <th className="px-4 py-2 text-center">Expected Delivery</th>
                        <th className="px-4 py-2 text-center">Active</th>
                        <th className="px-4 py-2 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countryRates.map((r) => (
                        <RateRowEditor
                          key={r.id}
                          row={r}
                          onUpdate={handleUpdateRow}
                          onToggleActive={handleToggleActive}
                          onDelete={(row) => setDeleteTarget(row)}
                          setError={setError}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-4 sm:p-6 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Confirm Delete</h2>
            <p className="text-gray-500 text-sm mb-1">
              Are you sure you want to delete this rate?
            </p>
            <p className="text-xs text-gray-400 mb-6">
              {deleteTarget.country_name} ({deleteTarget.country_code}) — {SERVICE_TYPES.find((s) => s.value === deleteTarget.service_type)?.label} — {deleteTarget.weight_min_kg}–{deleteTarget.weight_max_kg} kg — ₹{deleteTarget.rate_inr}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                data-no-global-confirm="true"
                className="px-5 py-2.5 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 font-semibold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                data-no-global-confirm="true"
                className="px-5 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Row Editor ─────────────────────────────────────────── */

function RateRowEditor({
  row,
  onUpdate,
  onToggleActive,
  onDelete,
  setError,
}: {
  row: RateRow;
  onUpdate: (id: string, updates: Partial<Pick<RateRow, 'rate_inr' | 'expected_delivery_days' | 'service_type' | 'weight_min_kg' | 'weight_max_kg'>>) => Promise<boolean>;
  onToggleActive: (id: string, active: boolean) => Promise<void>;
  onDelete: (row: RateRow) => void;
  setError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editRate, setEditRate] = useState(String(row.rate_inr));
  const [editDays, setEditDays] = useState(String(row.expected_delivery_days));
  const [editService, setEditService] = useState(row.service_type);
  const [editMinKg, setEditMinKg] = useState(String(row.weight_min_kg));
  const [editMaxKg, setEditMaxKg] = useState(String(row.weight_max_kg));
  const [saving, setSaving] = useState(false);

  const serviceLabel = SERVICE_TYPES.find((s) => s.value === row.service_type)?.label || row.service_type;

  const startEditing = () => {
    setEditRate(String(row.rate_inr));
    setEditDays(String(row.expected_delivery_days));
    setEditService(row.service_type);
    setEditMinKg(String(row.weight_min_kg));
    setEditMaxKg(String(row.weight_max_kg));
    setEditing(true);
  };

  const handleSave = async () => {
    const rate = parseFloat(editRate);
    const days = parseInt(editDays, 10);
    const minKg = parseFloat(editMinKg);
    const maxKg = parseFloat(editMaxKg);
    if (isNaN(rate) || rate < 0) { setError('Invalid rate'); return; }
    if (isNaN(days) || days < 1) { setError('Delivery days must be ≥ 1'); return; }
    if (isNaN(minKg) || isNaN(maxKg) || maxKg <= minKg) { setError('Invalid weight band'); return; }

    setSaving(true);
    const ok = await onUpdate(row.id, {
      rate_inr: rate,
      expected_delivery_days: days,
      service_type: editService,
      weight_min_kg: minKg,
      weight_max_kg: maxKg,
    });
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b border-blue-100 bg-blue-50/40">
        <td className="px-4 py-2">
          <select value={editService} onChange={(e) => setEditService(e.target.value)} className="border border-blue-300 rounded px-2 py-1 text-sm w-full">
            {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1">
            <input type="number" step="0.1" value={editMinKg} onChange={(e) => setEditMinKg(e.target.value)} className="w-16 border border-blue-300 rounded px-2 py-1 text-sm text-right" />
            <span className="text-gray-400">–</span>
            <input type="number" step="0.1" value={editMaxKg} onChange={(e) => setEditMaxKg(e.target.value)} className="w-16 border border-blue-300 rounded px-2 py-1 text-sm text-right" />
            <span className="text-xs text-gray-400">kg</span>
          </div>
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-1">
            <span className="text-gray-400">₹</span>
            <input type="number" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} className="w-24 border border-blue-300 rounded px-2 py-1 text-sm text-right" autoFocus />
          </div>
        </td>
        <td className="px-4 py-2 text-center">
          <input type="number" min="1" value={editDays} onChange={(e) => setEditDays(e.target.value)} className="w-16 border border-blue-300 rounded px-2 py-1 text-sm text-center mx-auto" />
        </td>
        <td className="px-4 py-2 text-center">
          <span className={`text-xs px-2 py-1 rounded ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-1">
            <button onClick={handleSave} disabled={saving} data-no-global-confirm="true" className="text-green-600 hover:text-green-700 p-1">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
            <button onClick={() => setEditing(false)} data-no-global-confirm="true" className="text-gray-400 hover:text-gray-600 p-1">
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-gray-100 ${!row.is_active ? 'opacity-50' : ''}`}>
      <td className="px-4 py-2.5 text-gray-700">{serviceLabel}</td>
      <td className="px-4 py-2.5 text-gray-600">{row.weight_min_kg}–{row.weight_max_kg} kg</td>
      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
        ₹{row.rate_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-2.5 text-center text-gray-600">{row.expected_delivery_days} days</td>
      <td className="px-4 py-2.5 text-center">
        <button
          onClick={() => onToggleActive(row.id, !row.is_active)}
          data-no-global-confirm="true"
          className={`text-xs px-2 py-1 rounded ${
            row.is_active
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {row.is_active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <button onClick={startEditing} data-no-global-confirm="true" className="text-blue-500 hover:text-blue-700 p-1" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(row)} data-no-global-confirm="true" className="text-red-400 hover:text-red-600 p-1" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
