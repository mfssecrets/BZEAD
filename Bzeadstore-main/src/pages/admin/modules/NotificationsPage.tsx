import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import NotificationInbox from '../../../components/common/NotificationInbox';
import type { ReadFilterKey } from '../../../components/common/NotificationInbox';
import { supabase } from '../../../lib/supabase';
import {
  deleteNotification,
  getNotifications,
  markNotificationRead,
} from '../../../lib/adminService';

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  is_read: boolean;
}

const NotificationsPage: React.FC = () => {
  const { user, currentAuthUser } = useAuth();
  const navigate = useNavigate();
  const adminId = user?.id || currentAuthUser?.userId || '';

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilterKey>('all');

  const [testTargetId, setTestTargetId] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await getNotifications(adminId);
      if (loadError) throw new Error(loadError);
      setNotifications((data || []) as AdminNotification[]);
    } catch (err) {
      console.error('Failed to load admin notifications:', err);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    if (!adminId) {
      navigate('/seller/login');
      return;
    }
    loadNotifications();
  }, [adminId, navigate, loadNotifications]);

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const { success } = await markNotificationRead(id);
    if (!success) await loadNotifications();
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await Promise.all(unread.map((n) => markNotificationRead(n.id)));
  };

  const handleDelete = async (id: string) => {
    const { success } = await deleteNotification(id, adminId || undefined);
    if (success) setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleItemClick = (id: string) => {
    const n = notifications.find((item) => item.id === id);
    if (!n || n.is_read) return;
    void handleMarkRead(id);
  };

  const handleSendTestPush = async () => {
    setTestBusy(true);
    setTestResult(null);
    try {
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      if (sessErr || !session?.access_token) {
        setTestResult({ ok: false, message: 'You must be logged in to send a test push.' });
        return;
      }
      const recipientUserId = testTargetId.trim() || undefined;
      const { data, error: invokeErr } = await supabase.functions.invoke('test-push', {
        body: recipientUserId ? { recipientUserId } : {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeErr) {
        setTestResult({ ok: false, message: invokeErr.message || 'Function call failed.' });
        return;
      }
      const payload = (data || {}) as { success?: boolean; error?: string; recipients?: number; note?: string };
      if (payload.success === false) {
        setTestResult({ ok: false, message: payload.error || 'OneSignal dispatch failed.' });
        return;
      }
      const recipients = Number(payload.recipients || 0);
      setTestResult({
        ok: true,
        message: recipients > 0
          ? `OneSignal accepted the push — ${recipients} subscribed device(s) targeted.`
          : (payload.note || 'OneSignal accepted the request but no subscribed device was found for this user.'),
      });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test push failed.' });
    } finally {
      setTestBusy(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const filtered = useMemo(() => notifications.filter((n) => {
    if (readFilter === 'unread') return !n.is_read;
    if (readFilter === 'read') return n.is_read;
    return true;
  }), [notifications, readFilter]);

  const inboxItems = filtered.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    createdAt: n.created_at,
    isRead: n.is_read,
  }));

  const testPushPanel = (
    <div className="mb-3 bg-white border border-gray-200 rounded-sm shadow-sm p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
          <Send size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900">Test push delivery</h3>
          <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500">
            Leave empty to send to yourself, or paste a user UUID.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={testTargetId}
              onChange={(e) => setTestTargetId(e.target.value)}
              placeholder="Recipient user UUID (optional)"
              className="flex-1 rounded-sm border border-gray-300 px-3 py-2 text-sm focus:border-[#2874f0] focus:outline-none focus:ring-1 focus:ring-[#2874f0]"
              disabled={testBusy}
            />
            <button
              type="button"
              onClick={handleSendTestPush}
              disabled={testBusy}
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#2874f0] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {testBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {testBusy ? 'Sending…' : 'Send test push'}
            </button>
          </div>
          {testResult && (
            <p className={`mt-2 text-xs font-medium ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {testResult.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <NotificationInbox
      unreadCount={unreadCount}
      readFilter={readFilter}
      onReadFilterChange={setReadFilter}
      items={inboxItems}
      loading={loading}
      error={error}
      onRetry={loadNotifications}
      onRefresh={loadNotifications}
      onMarkAllRead={unreadCount > 0 ? handleMarkAllRead : undefined}
      onItemClick={handleItemClick}
      onItemDelete={handleDelete}
      emptyTitle="No admin notifications"
      emptyMessage="System alerts and platform updates will appear here."
      toolbarExtra={testPushPanel}
    />
  );
};

export default NotificationsPage;
