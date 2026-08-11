/**
 * Single source of truth for the public website origin.
 *
 * - The Capacitor WebView serves the bundled app from `https://localhost`
 *   (see capacitor.config.ts `server.androidScheme`). That origin is an
 *   internal implementation detail and MUST NEVER be exposed to users
 *   (share links, copy-link, social share, deep links, canonical/SEO,
 *   browser opens, email redirect URLs, etc.).
 *
 * - Every user-facing URL generation MUST resolve through `BASE_URL` (or the
 *   `buildAppRedirect()` helper in `utils/authEnv.ts` which is layered on
 *   top of this). This guarantees `https://bzead.com` is the only host a
 *   user ever sees, regardless of platform (web, Android, iOS).
 *
 * - This does NOT change Capacitor's internal WebView origin or routing.
 */
export const BASE_URL: string = (() => {
  const raw = (import.meta.env.VITE_PUBLIC_APP_URL?.trim()
    || import.meta.env.VITE_DOMAIN?.trim()
    || 'https://bzead.com');
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://bzead.com';
  }
})();

/** Join `BASE_URL` with a path, ensuring exactly one slash between them. */
export function withBase(path: string = '/'): string {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL.replace(/\/+$/, '')}${safePath}`;
}
