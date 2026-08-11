import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { TableSkeleton } from '../../../components/common/Skeleton';
import { getSystemHealth } from '../../../lib/adminService';
import { supabase } from '../../../lib/supabase';
import { confirmOnce } from '../../../utils/confirmOnce';

type DataRow = Record<string, unknown>;
type FieldValue = string | number | boolean | null;
type PayloadMode = 'create' | 'update';
type FieldKind = 'string' | 'number' | 'boolean' | 'datetime' | 'json';

type FieldMeta = {
  key: string;
  label: string;
  kind: FieldKind;
};

type TableGroup = {
  label: string;
  tables: string[];
};

const ROWS_PER_PAGE = 10;

const TABLE_GROUPS: TableGroup[] = [
  {
    label: 'Master Data',
    tables: [
      'business_types',
      'categories',
      'countries',
      'states',
      'measurement_units',
      'packing_types',
      'domestic_courier_type',
      'international_courier_type',
      'domestic_shippingcharge_type',
      'tax_rules',
    ],
  },
  {
    label: 'User & Profile',
    tables: ['profiles', 'user_addresses', 'user_location_cache', 'notifications', 'wishlists'],
  },
  {
    label: 'Seller & KYC',
    tables: ['seller_kyc', 'seller_kyc_documents', 'seller_payouts', 'withdrawals'],
  },
  {
    label: 'Product Catalog',
    tables: ['products', 'product_variants', 'product_colors', 'reviews', 'sponsored_products'],
  },
  {
    label: 'Shipping & Delivery Rules',
    tables: [
      'product_international_shipping',
    ],
  },
  {
    label: 'Shiprocket Operations',
    tables: [
      'shiprocket_shipments',
    ],
  },
  {
    label: 'Cart, Orders & Payments',
    tables: ['cart_items', 'orders', 'order_items', 'payment_intents', 'payment_refunds'],
  },
  {
    label: 'Promotions & Offers',
    tables: ['promotions', 'banners', 'offer_rules'],
  },
  {
    label: 'Accounts & Finance',
    tables: [
      'account_heads',
      'daybook_entries',
      'bank_book_entries',
      'expense_entries',
      'membership_plans',
      'platform_costs',
      'platform_commission_rules',
    ],
  },
  {
    label: 'Admin, Audit & Support',
    tables: ['audit_logs', 'complaints', 'product_input_snapshots'],
  },
];

const ALL_TABLES = TABLE_GROUPS.flatMap((group) => group.tables);

const BACKEND_MANAGED_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'inserted_at',
  'modified_at',
]);

const getPrettyName = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const isCodeField = (field: string) => field === 'code' || field.endsWith('_code');
const isBackendManagedField = (field: string) => BACKEND_MANAGED_FIELDS.has(field) || isCodeField(field);

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const detectFieldKind = (value: unknown): FieldKind => {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value && typeof value === 'object') return 'json';
  if (typeof value === 'string') {
    const isIsoDate = /^\d{4}-\d{2}-\d{2}([t\s]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(z|[+-]\d{2}:\d{2})?)?$/i.test(value);
    if (isIsoDate) return 'datetime';
  }
  return 'string';
};

const getFieldSampleValue = (rows: DataRow[], field: string): unknown => {
  for (const row of rows) {
    const value = row[field];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
};

const buildFieldMeta = (rows: DataRow[], keyColumn: string): FieldMeta[] => {
  if (rows.length === 0) return [];
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys
    .filter((key) => key !== keyColumn)
    .filter((key) => !isBackendManagedField(key))
    .map((key) => ({
      key,
      label: getPrettyName(key),
      kind: detectFieldKind(getFieldSampleValue(rows, key)),
    }));
};

const normalizeDateTimeLocal = (value: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const initializeFormValues = (fields: FieldMeta[], row?: DataRow | null): Record<string, FieldValue> => {
  const values: Record<string, FieldValue> = {};
  fields.forEach((field) => {
    const source = row ? row[field.key] : null;
    if (source === null || source === undefined) {
      values[field.key] = field.kind === 'boolean' ? false : '';
      return;
    }
    if (field.kind === 'json') values[field.key] = JSON.stringify(source, null, 2);
    else if (field.kind === 'datetime') values[field.key] = normalizeDateTimeLocal(String(source));
    else values[field.key] = source as FieldValue;
  });
  return values;
};

const normalizeForCompare = (kind: FieldKind, value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  if (kind === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (kind === 'boolean') return Boolean(value);
  if (kind === 'json') {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  }
  if (kind === 'datetime') {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toPayload = (
  fields: FieldMeta[],
  values: Record<string, FieldValue>,
  mode: PayloadMode,
  baseRow?: DataRow | null
): DataRow | null => {
  const payload: DataRow = {};

  for (const field of fields) {
    const rawValue = values[field.key];

    if (field.kind === 'boolean') {
      payload[field.key] = Boolean(rawValue);
      continue;
    }

    const text = String(rawValue ?? '').trim();
    if (!text) {
      if (mode === 'create') continue;
      if (baseRow && (baseRow[field.key] === null || baseRow[field.key] === undefined || String(baseRow[field.key]).trim() === '')) {
        continue;
      }
      payload[field.key] = null;
      continue;
    }

    if (field.kind === 'number') {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) return null;
      payload[field.key] = numeric;
      continue;
    }

    if (field.kind === 'json') {
      try {
        payload[field.key] = JSON.parse(text);
      } catch {
        return null;
      }
      continue;
    }

    if (field.kind === 'datetime') {
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) return null;
      payload[field.key] = date.toISOString();
      continue;
    }

    payload[field.key] = text;
  }

  if (mode === 'update' && baseRow) {
    const changedOnly: DataRow = {};
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(payload, field.key)) continue;
      const nextValue = normalizeForCompare(field.kind, payload[field.key]);
      const currentValue = normalizeForCompare(field.kind, baseRow[field.key]);
      if (JSON.stringify(nextValue) !== JSON.stringify(currentValue)) {
        changedOnly[field.key] = payload[field.key];
      }
    }
    return changedOnly;
  }

  return payload;
};

const formatActionError = (err: unknown, action: 'insert' | 'update' | 'delete' | 'fetch') => {
  const fallback = action === 'insert'
    ? 'Insert failed'
    : action === 'update'
      ? 'Update failed'
      : action === 'delete'
        ? 'Delete failed'
        : 'Fetch failed';
  const message = err instanceof Error ? err.message : fallback;
  if (/row-level security|permission denied|not allowed/i.test(message)) {
    return `${message} Check RLS policies for this table and ensure admin role has write access.`;
  }
  return message;
};

const getSuggestedKeyColumn = (rows: DataRow[]) => {
  const candidates = ['id', 'code', 'country_code', 'name'];
  const first = rows[0] || {};
  return candidates.find((column) => Object.prototype.hasOwnProperty.call(first, column)) || 'id';
};

const RowFormModal: React.FC<{
  title: string;
  fields: FieldMeta[];
  values: Record<string, FieldValue>;
  onChange: React.Dispatch<React.SetStateAction<Record<string, FieldValue>>>;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
}> = ({ title, fields, values, onChange, onClose, onSubmit, submitLabel, disabled }) => {
  const renderInput = (field: FieldMeta) => {
    const value = values[field.key] ?? '';

    if (field.kind === 'boolean') {
      return (
        <select
          value={String(Boolean(value))}
          onChange={(e) => onChange((prev) => ({ ...prev, [field.key]: e.target.value === 'true' }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }

    if (field.kind === 'number') {
      return (
        <input
          type="number"
          value={String(value ?? '')}
          onChange={(e) => onChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      );
    }

    if (field.kind === 'datetime') {
      return (
        <input
          type="datetime-local"
          value={String(value ?? '')}
          onChange={(e) => onChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      );
    }

    if (field.kind === 'json') {
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono"
        />
      );
    }

    return (
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {fields.length === 0 ? (
            <p className="text-sm text-gray-500">No editable columns found for this table.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs text-gray-600">{field.label}</label>
                  {renderInput(field)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 sm:py-4 border-t flex justify-end">
          <button
            onClick={onSubmit}
            disabled={disabled || fields.length === 0}
            className="px-3 sm:px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 text-sm sm:text-base"
          >
            <Save size={14} /> {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const [dbStatus, setDbStatus] = useState<string>('checking...');
  const [selectedTable, setSelectedTable] = useState<string>(ALL_TABLES[0]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loadingRows, setLoadingRows] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [keyColumn, setKeyColumn] = useState<string>('id');
  const [editingRow, setEditingRow] = useState<DataRow | null>(null);
  const [editingKeyValue, setEditingKeyValue] = useState<string>('');
  const [editingKeyRaw, setEditingKeyRaw] = useState<unknown>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [createFormValues, setCreateFormValues] = useState<Record<string, FieldValue>>({});
  const [editFormValues, setEditFormValues] = useState<Record<string, FieldValue>>({});

  const fieldMeta = useMemo(() => buildFieldMeta(rows, keyColumn), [rows, keyColumn]);
  const hasNextPage = page * ROWS_PER_PAGE < totalRows;

  useEffect(() => {
    setCreateFormValues(initializeFormValues(fieldMeta));
  }, [fieldMeta, selectedTable]);

  useEffect(() => {
    if (editingRow) {
      setEditFormValues(initializeFormValues(fieldMeta, editingRow));
    }
  }, [editingRow, fieldMeta]);

  const loadRows = async (showLoader: boolean = true) => {
    try {
      if (showLoader) setLoadingRows(true);
      const from = (page - 1) * ROWS_PER_PAGE;
      const to = from + ROWS_PER_PAGE - 1;

      const { data, error: tableError, count } = await supabase
        .from(selectedTable)
        .select('*', { count: 'exact' })
        .range(from, to);

      if (tableError) throw new Error(tableError.message || `Failed to load ${selectedTable}`);

      const parsedRows = (data || []) as DataRow[];
      setRows(parsedRows);
      setTotalRows(count || 0);
      setKeyColumn(getSuggestedKeyColumn(parsedRows));
      setError(null);
    } catch (err) {
      setRows([]);
      setTotalRows(0);
      setError(formatActionError(err, 'fetch'));
    } finally {
      if (showLoader) setLoadingRows(false);
    }
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await getSystemHealth();
        setDbStatus(
          health.dbStatus === 'healthy'
            ? 'All backend connections are properly configured.'
            : 'Some connections may have issues.'
        );
      } catch {
        setDbStatus('Unable to verify connections.');
      }
    };
    void checkHealth();
  }, []);

  useEffect(() => {
    void loadRows(true);

    const channel = supabase
      .channel(`admin-settings-${selectedTable}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: selectedTable }, () => {
        void loadRows(false);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, page]);

  const openAddModal = () => {
    setCreateFormValues(initializeFormValues(fieldMeta));
    setShowAddModal(true);
  };

  const openEditModal = (row: DataRow) => {
    const keyValue = row[keyColumn];
    if (keyValue === undefined || keyValue === null) {
      setError(`Selected row does not contain key column "${keyColumn}".`);
      return;
    }
    setEditingRow(row);
    setEditingKeyRaw(keyValue);
    setEditingKeyValue(String(keyValue));
    setEditFormValues(initializeFormValues(fieldMeta, row));
    setShowEditModal(true);
  };

  const handleInsert = async () => {
    const payload = toPayload(fieldMeta, createFormValues, 'create');
    if (!payload) {
      setError('Invalid input values. Please check number/date/json fields.');
      return;
    }
    if (Object.keys(payload).length === 0) {
      setError('Provide at least one value before adding a row.');
      return;
    }

    try {
      setSaving(true);
      const { error: insertError } = await supabase.from(selectedTable).insert(payload);
      if (insertError) throw new Error(insertError.message || 'Insert failed');
      setSuccess(`New row added to ${selectedTable}.`);
      setTimeout(() => setSuccess(null), 2500);
      setShowAddModal(false);
      setError(null);
      await loadRows(false);
    } catch (err) {
      setError(formatActionError(err, 'insert'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingRow) {
      setError('Select a row to edit first.');
      return;
    }

    const payload = toPayload(fieldMeta, editFormValues, 'update', editingRow);
    if (!payload) {
      setError('Invalid input values. Please check number/date/json fields.');
      return;
    }
    if (Object.keys(payload).length === 0) {
      setError('No editable changes detected.');
      return;
    }

    try {
      setSaving(true);
      const eqValue = editingKeyRaw ?? editingKeyValue;
      const { error: updateError } = await supabase
        .from(selectedTable)
        .update(payload)
        .eq(keyColumn, eqValue as never);

      if (updateError) throw new Error(updateError.message || 'Update failed');
      setSuccess(`Row updated in ${selectedTable}.`);
      setTimeout(() => setSuccess(null), 2500);
      setShowEditModal(false);
      setError(null);
      await loadRows(false);
    } catch (err) {
      setError(formatActionError(err, 'update'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: DataRow) => {
    const keyValue = row[keyColumn];
    if (keyValue === undefined || keyValue === null) {
      setError(`Selected row does not contain key column "${keyColumn}".`);
      return;
    }

    const confirmed = confirmOnce('Delete this row permanently?');
    if (!confirmed) return;

    try {
      setSaving(true);
      const { error: deleteError } = await supabase
        .from(selectedTable)
        .delete()
        .eq(keyColumn, keyValue as never);
      if (deleteError) throw new Error(deleteError.message || 'Delete failed');
      setSuccess(`Row deleted from ${selectedTable}.`);
      setTimeout(() => setSuccess(null), 2500);
      setError(null);
      await loadRows(false);
    } catch (err) {
      setError(formatActionError(err, 'delete'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-600">System status: {dbStatus}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <aside className="bg-white rounded-lg shadow p-4 lg:col-span-1 max-h-[80vh] overflow-y-auto">
          <h3 className="font-semibold text-gray-900 mb-3">Tables</h3>
          <div className="space-y-3">
            {TABLE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{group.label}</p>
                <div className="space-y-1">
                  {group.tables.map((table) => (
                    <button
                      key={table}
                      onClick={() => {
                        setSelectedTable(table);
                        setPage(1);
                        setShowAddModal(false);
                        setShowEditModal(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        selectedTable === table
                          ? 'bg-black text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                      }`}
                    >
                      {getPrettyName(table)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="bg-white rounded-lg shadow p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{getPrettyName(selectedTable)}</h3>
              <p className="text-xs text-gray-500">Rows per page: {ROWS_PER_PAGE} | Total: {totalRows}</p>
            </div>
            <button
              onClick={() => void loadRows(true)}
              className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-2"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {loadingRows ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">Loading rows...</span>
              <TableSkeleton rows={8} columns={3} />
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Key</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Details</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? (
                    rows.map((row, idx) => (
                      <tr key={`${String(row[keyColumn] || 'row')}-${idx}`} className="border-b align-top">
                        <td className="px-3 py-2 text-xs text-gray-700 break-all w-56">{formatCellValue(row[keyColumn])}</td>
                        <td className="px-3 py-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(row).map(([k, v]) => (
                              <div key={k} className="text-xs bg-gray-50 rounded px-2 py-1">
                                <span className="font-semibold text-gray-700">{getPrettyName(k)}: </span>
                                <span className="text-gray-600 break-all">{formatCellValue(v)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 w-32">
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditModal(row)}
                              className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              onClick={() => void handleDelete(row)}
                              className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100 flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">No rows found for this table.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={openAddModal}
              className="px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800 text-sm flex items-center gap-2"
            >
              <Plus size={14} /> Add Row
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-600">Page {page}</span>
              <button
                onClick={() => setPage((p) => (hasNextPage ? p + 1 : p))}
                disabled={!hasNextPage}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {showAddModal && (
        <RowFormModal
          title={`Add Row • ${getPrettyName(selectedTable)}`}
          fields={fieldMeta}
          values={createFormValues}
          onChange={setCreateFormValues}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleInsert}
          submitLabel="Add Row"
          disabled={saving}
        />
      )}

      {showEditModal && (
        <RowFormModal
          title={`Edit Row • ${getPrettyName(selectedTable)} (${editingKeyValue})`}
          fields={fieldMeta}
          values={editFormValues}
          onChange={setEditFormValues}
          onClose={() => setShowEditModal(false)}
          onSubmit={handleUpdate}
          submitLabel="Update Row"
          disabled={saving}
        />
      )}
    </div>
  );
};

export default SettingsPage;
