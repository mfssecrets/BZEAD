const DEFAULT_SUPABASE_URL = 'https://aiiefgjfftmerayihpbv.supabase.co';

export function getBuyerApkDownloadUrl(): string {
  const supabaseUrl = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SUPABASE_URL
    || DEFAULT_SUPABASE_URL;
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/app-downloads/bzead.apk`;
}

/** Fetch APK from Supabase public storage and trigger a file download. */
export async function triggerBuyerApkDownload(): Promise<void> {
  const url = getBuyerApkDownloadUrl();
  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'bzead.apk';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
