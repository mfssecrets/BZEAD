/**
 * AdminSellerWarehouses — Single Pickup Location per Seller (Admin Review Panel)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists every seller-submitted pickup location (one row per seller, enforced
 * by DB unique constraint on seller_id). For each row admin can:
 *
 *   • View — every saved field, fully populated seller identity.
 *   • Edit — patch any field inline before pushing to Shiprocket.
 *   • Sync to Shiprocket — calls the existing add_pickup_location edge fn,
 *       on success marks status='synced', writes shiprocket_pickup_id,
 *       sends 'warehouse_approved' notification to the seller.
 *   • Reject — requires a reason; marks status='rejected', writes
 *       'warehouse_rejected' notification with the reason so the seller
 *       gets pinged and can modify + resubmit.
 *
 * Seller name resolution is strict: profiles.full_name → email username →
 * phone → uuid prefix. We NEVER render "Unnamed seller".
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, Search, Warehouse, CheckCircle2, AlertCircle, XCircle, Pencil,
  Send, MapPin, Phone, Mail, User as UserIcon, Clock, X, Save,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../utils/logger';
import { addPickupLocation } from '../../../lib/shiprocketOpsService';
import { TableSkeleton } from '../../../components/common/Skeleton';

type Status = 'pending' | 'synced' | 'rejected';

interface ProfileEmbed {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface PickupRow {
  id: string;
  seller_id: string;
  pickup_location_name: string;
  status: Status;
  rejection_reason: string | null;
  rejected_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // address
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  pin_code: string | null;
  country: string | null;
  // contact
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  // optional
  lat: number | null;
  long: number | null;
  address_type: string | null;
  vendor_name: string | null;
  gstin: string | null;
  is_hyperlocal: boolean | null;
  working_days: string[] | null;
  use_pickup_as_return: boolean | null;
  return_address: string | null;
  return_city: string | null;
  return_pin: string | null;
  return_state: string | null;
  return_country: string | null;
  warehouse_type: string | null;
  // sync state
  shiprocket_synced: boolean | null;
  shiprocket_pickup_id: number | string | null;
  shippo_synced: boolean | null;
  shippo_address_id: string | null;
  provider: string | null;
  is_verified: boolean | null;
  last_sync_error: string | null;
  last_sync_attempt_at: string | null;
  last_synced_at: string | null;
  // embedded profile
  profiles: ProfileEmbed | null;
}

const fmt = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
};

const sellerDisplayName = (row: PickupRow): string => {
  const fn = row.profiles?.full_name?.trim();
  if (fn) return fn;
  const email = row.profiles?.email?.trim();
  if (email && email.includes('@')) return email.split('@')[0];
  const phone = row.profiles?.phone?.trim();
  if (phone) return phone;
  const contact = row.contact_name?.trim();
  if (contact) return contact;
  return `Seller ${row.seller_id.slice(0, 8)}`;
};

const STATUS_BADGE: Record<Status, { bg: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-800', icon: Clock, label: 'Pending Approval' },
  synced: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle2, label: 'Synced to Shiprocket' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle, label: 'Rejected' },
};

const SELECT_COLUMNS =
  'id, seller_id, pickup_location_name, status, rejection_reason, rejected_at, approved_at, ' +
  'created_at, updated_at, address, address_2, city, state, pin_code, country, ' +
  'contact_name, contact_phone, contact_email, lat, long, address_type, vendor_name, gstin, ' +
  'is_hyperlocal, working_days, use_pickup_as_return, return_address, return_city, return_pin, ' +
  'return_state, return_country, warehouse_type, shiprocket_synced, shiprocket_pickup_id, ' +
  'shippo_synced, shippo_address_id, provider, is_verified, last_sync_error, ' +
  'last_sync_attempt_at, last_synced_at, ' +
  'profiles!seller_pickup_locations_seller_id_fkey(id, full_name, email, phone)';

const AdminSellerWarehouses: React.FC = () => {
  const [rows, setRows] = useState<PickupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<PickupRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectErr, setRejectErr] = useState('');
  const [editFor, setEditFor] = useState<PickupRow | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<PickupRow>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('seller_pickup_locations')
        .select(SELECT_COLUMNS)
        .order('created_at', { ascending: false });

      if (err) throw new Error(err.message);
      setRows((data as unknown as PickupRow[]) || []);
    } catch (e) {
      logger.error(e as Error, { context: 'AdminSellerWarehouses.load' });
      setError('Could not load seller warehouses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        sellerDisplayName(r),
        r.profiles?.email, r.profiles?.phone,
        r.pickup_location_name, r.city, r.pin_code, r.state, r.country,
        r.address, r.address_2, r.contact_name, r.contact_phone,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  // ─── Reject ──────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectFor) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setRejectErr('Please provide a clear reason (min 5 characters).');
      return;
    }
    setRejectErr('');
    try {
      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from('seller_pickup_locations')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          rejected_at: now,
          is_verified: false,
          shiprocket_synced: false,
          last_sync_error: null,
          updated_at: now,
        })
        .eq('id', rejectFor.id);
      if (upErr) throw new Error(upErr.message);

      await supabase.from('notifications').insert({
        user_id: rejectFor.seller_id,
        type: 'warehouse_rejected',
        title: 'Warehouse Rejected',
        message: `Your pickup location was rejected: ${reason}`,
        metadata: {
          warehouse_id: rejectFor.id,
          pickup_location_name: rejectFor.pickup_location_name,
          rejection_reason: reason,
          link: '/seller/warehouse',
        },
        is_read: false,
      });

      setRejectFor(null);
      setRejectReason('');
      await load();
    } catch (e) {
      logger.error(e as Error, { context: 'AdminSellerWarehouses.reject' });
      setRejectErr('Could not reject. Please try again.');
    }
  };

  // ─── Sync to Shiprocket ──────────────────────────────────────────────
  const handleSync = async (row: PickupRow) => {
    setSyncingId(row.id);
    try {
      const payload = {
        pickup_location: row.pickup_location_name,
        name: row.contact_name || sellerDisplayName(row),
        email: row.contact_email || row.profiles?.email || '',
        phone: row.contact_phone || row.profiles?.phone || '',
        address: row.address || '',
        address_2: row.address_2 || '',
        city: row.city || '',
        state: row.state || '',
        country: row.country || 'India',
        pin_code: row.pin_code || '',
        lat: row.lat ?? undefined,
        long: row.long ?? undefined,
        address_type: row.address_type || undefined,
        vendor_name: row.vendor_name || undefined,
        gstin: row.gstin || undefined,
      };

      const result = await addPickupLocation({
        sellerId: row.seller_id,
        requestData: payload,
      });

      if (result.error) {
        await supabase
          .from('seller_pickup_locations')
          .update({
            last_sync_error: result.error,
            last_sync_attempt_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        await load();
        setError(`Shiprocket sync failed: ${result.error}`);
        return;
      }

      const d = (result.data || {}) as Record<string, unknown>;
      const pickupId =
        (d.pickup_id as number | string | null) ??
        (d.id as number | string | null) ??
        null;

      const now = new Date().toISOString();
      await supabase
        .from('seller_pickup_locations')
        .update({
          status: 'synced',
          shiprocket_synced: true,
          shiprocket_pickup_id: pickupId,
          is_verified: true,
          approved_at: now,
          rejection_reason: null,
          rejected_at: null,
          last_sync_error: null,
          last_sync_attempt_at: now,
          last_synced_at: now,
          updated_at: now,
        })
        .eq('id', row.id);

      await supabase.from('notifications').insert({
        user_id: row.seller_id,
        type: 'warehouse_approved',
        title: 'Warehouse Approved',
        message: `Your pickup location "${row.pickup_location_name}" is now active. You can start fulfilling orders.`,
        metadata: {
          warehouse_id: row.id,
          pickup_location_name: row.pickup_location_name,
          shiprocket_pickup_id: pickupId,
          link: '/seller/dashboard',
        },
        is_read: false,
      });

      await load();
    } catch (e) {
      logger.error(e as Error, { context: 'AdminSellerWarehouses.sync' });
      setError('Could not sync. Please try again.');
    } finally {
      setSyncingId(null);
    }
  };

  // ─── Edit ────────────────────────────────────────────────────────────
  const startEdit = (row: PickupRow) => {
    setEditFor(row);
    setEditDraft({
      pickup_location_name: row.pickup_location_name,
      address: row.address || '',
      address_2: row.address_2 || '',
      city: row.city || '',
      state: row.state || '',
      pin_code: row.pin_code || '',
      country: row.country || 'India',
      contact_name: row.contact_name || '',
      contact_phone: row.contact_phone || '',
      contact_email: row.contact_email || '',
      address_type: row.address_type || '',
      vendor_name: row.vendor_name || '',
      gstin: row.gstin || '',
      lat: row.lat,
      long: row.long,
    });
    setEditErr('');
  };

  const saveEdit = async () => {
    if (!editFor) return;
    setEditSaving(true);
    setEditErr('');
    try {
      const { error: upErr } = await supabase
        .from('seller_pickup_locations')
        .update({ ...editDraft, updated_at: new Date().toISOString() })
        .eq('id', editFor.id);
      if (upErr) throw new Error(upErr.message);
      setEditFor(null);
      setEditDraft({});
      await load();
    } catch (e) {
      logger.error(e as Error, { context: 'AdminSellerWarehouses.saveEdit' });
      setEditErr('Could not save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, synced: 0, rejected: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seller Warehouses</h1>
          <p className="text-sm text-gray-500">
            Review, edit, and push seller pickup locations to Shiprocket. One warehouse per seller.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by seller name, email, code, city, pincode…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(['all', 'pending', 'synced', 'rejected'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border ${
                statusFilter === k
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {k.charAt(0).toUpperCase() + k.slice(1)} ({counts[k as keyof typeof counts]})
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={16} className="text-red-500 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-500"><X size={14} /></button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading seller warehouses...</span>
          <TableSkeleton rows={8} columns={5} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <Warehouse className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-gray-500">No seller warehouses found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => {
            const badge = STATUS_BADGE[row.status];
            const BadgeIcon = badge.icon;
            const isSyncing = syncingId === row.id;
            return (
              <div key={row.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                {/* Card header */}
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4 pb-4 border-b border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <UserIcon size={16} className="text-gray-400" />
                      <h3 className="text-base font-bold text-gray-900 truncate">{sellerDisplayName(row)}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                        <BadgeIcon size={11} /> {badge.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      {row.profiles?.email && <span className="inline-flex items-center gap-1"><Mail size={11} />{row.profiles.email}</span>}
                      {row.profiles?.phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{row.profiles.phone}</span>}
                      <span className="font-mono">{row.pickup_location_name}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => startEdit(row)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    {row.status !== 'rejected' && (
                      <button
                        onClick={() => { setRejectFor(row); setRejectReason(''); setRejectErr(''); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    )}
                    {row.status !== 'synced' && (
                      <button
                        onClick={() => handleSync(row)}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSyncing ? <><Loader2 size={12} className="animate-spin" /> Syncing…</> : <><Send size={12} /> Sync to Shiprocket</>}
                      </button>
                    )}
                  </div>
                </div>

                {/* Rejection reason */}
                {row.status === 'rejected' && row.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-[11px] font-semibold text-red-800 uppercase mb-1">
                      Rejected on {fmt(row.rejected_at)}
                    </p>
                    <p className="text-sm text-red-800 whitespace-pre-wrap">{row.rejection_reason}</p>
                  </div>
                )}

                {/* Last sync error */}
                {row.last_sync_error && row.status !== 'synced' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-[11px] font-semibold text-amber-800 uppercase mb-1">
                      Last sync attempt: {fmt(row.last_sync_attempt_at)}
                    </p>
                    <p className="text-sm text-amber-800 break-words">{row.last_sync_error}</p>
                  </div>
                )}

                {/* Details grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <Section title="Address" icon={<MapPin size={14} />}>
                    <Field label="Line 1" value={row.address} />
                    {row.address_2 && <Field label="Line 2" value={row.address_2} />}
                    <Field label="City" value={row.city} />
                    <Field label="State" value={row.state} />
                    <Field label="Pincode" value={row.pin_code} />
                    <Field label="Country" value={row.country} />
                    {row.address_type && <Field label="Type" value={row.address_type} />}
                  </Section>

                  <Section title="Contact" icon={<UserIcon size={14} />}>
                    <Field label="Name" value={row.contact_name} />
                    <Field label="Phone" value={row.contact_phone} />
                    <Field label="Email" value={row.contact_email} />
                    {row.vendor_name && <Field label="Vendor" value={row.vendor_name} />}
                    {row.gstin && <Field label="GSTIN" value={row.gstin} />}
                    {(row.lat || row.long) && <Field label="Lat / Long" value={`${row.lat ?? '—'}, ${row.long ?? '—'}`} />}
                  </Section>

                  {(row.working_days?.length || row.is_hyperlocal !== null) && (
                    <Section title="Operations" icon={<Warehouse size={14} />}>
                      <Field label="Hyperlocal" value={row.is_hyperlocal ? 'Yes' : 'No'} />
                      <Field label="Working Days" value={(row.working_days || []).join(', ') || '—'} />
                    </Section>
                  )}

                  <Section title="Return Address" icon={<MapPin size={14} />}>
                    <Field label="Same as pickup" value={row.use_pickup_as_return ? 'Yes' : 'No'} />
                    <Field label="Address" value={row.return_address} />
                    <Field label="City" value={row.return_city} />
                    <Field label="Pincode" value={row.return_pin} />
                    <Field label="State" value={row.return_state} />
                    <Field label="Country" value={row.return_country} />
                  </Section>
                </div>

                {/* Footer meta */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-gray-500">
                  <span>Created: {fmt(row.created_at)}</span>
                  <span>Updated: {fmt(row.updated_at)}</span>
                  {row.approved_at && <span className="text-green-700">Approved: {fmt(row.approved_at)}</span>}
                  {row.shiprocket_pickup_id && <span className="font-mono">SR ID: {row.shiprocket_pickup_id}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Reject modal ─── */}
      {rejectFor && (
        <Modal title="Reject Warehouse" onClose={() => setRejectFor(null)}>
          <p className="text-sm text-gray-600 mb-3">
            Rejecting <strong>{sellerDisplayName(rejectFor)}</strong>'s pickup location.
            They will receive a notification with your reason.
          </p>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="e.g. Pincode does not match the city. Please correct and resubmit."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500"
          />
          {rejectErr && <p className="text-xs text-red-600 mt-2">{rejectErr}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setRejectFor(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={handleReject} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg">Reject &amp; Notify Seller</button>
          </div>
        </Modal>
      )}

      {/* ─── Edit modal ─── */}
      {editFor && (
        <Modal title={`Edit Warehouse — ${sellerDisplayName(editFor)}`} onClose={() => setEditFor(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {([
              ['pickup_location_name', 'Pickup Code'],
              ['contact_name', 'Contact Name'],
              ['contact_phone', 'Contact Phone'],
              ['contact_email', 'Contact Email'],
              ['address', 'Address Line 1'],
              ['address_2', 'Address Line 2'],
              ['city', 'City'],
              ['state', 'State'],
              ['pin_code', 'Pincode'],
              ['country', 'Country'],
              ['address_type', 'Address Type'],
              ['vendor_name', 'Vendor Name'],
              ['gstin', 'GSTIN'],
              ['lat', 'Latitude'],
              ['long', 'Longitude'],
            ] as Array<[keyof PickupRow, string]>).map(([key, label]) => (
              <div key={String(key)} className={key === 'address' || key === 'address_2' ? 'sm:col-span-2' : ''}>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">{label}</label>
                <input
                  value={(editDraft as Record<string, unknown>)[key as string] == null ? '' : String((editDraft as Record<string, unknown>)[key as string])}
                  onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
          </div>
          {editErr && <p className="text-xs text-red-600 mt-3">{editErr}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setEditFor(null)} disabled={editSaving} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button
              onClick={saveEdit}
              disabled={editSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {editSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
      {icon} {title}
    </div>
    <div className="space-y-1">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => (
  <div className="flex gap-2 text-xs">
    <span className="text-gray-500 min-w-[80px]">{label}:</span>
    <span className="text-gray-900 break-words flex-1">{value || '—'}</span>
  </div>
);

const Modal: React.FC<{ title: string; children: React.ReactNode; onClose: () => void }> = ({ title, children, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>
      <div className="p-5 overflow-y-auto">{children}</div>
    </div>
  </div>
);

export default AdminSellerWarehouses;
