import { useState } from 'react';
import { triggerBuyerApkDownload } from '../../lib/appDownload';

/** Single-line web-only prompt: label + Download button (direct APK). */
export function AppDownloadStrip() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      await triggerBuyerApkDownload();
    } catch {
      setError('Download failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-y-2 border-amber-300 bg-[#FFFBEB]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <p className="text-sm font-bold text-gray-900 sm:text-base">Download Android App</p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="flex-shrink-0 rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-70"
        >
          {busy ? '…' : 'Download'}
        </button>
      </div>
      {error && (
        <p className="mx-auto max-w-7xl px-4 pb-2 text-xs text-red-600 sm:px-6 lg:px-8">{error}</p>
      )}
    </div>
  );
}
