const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), microphone=(), camera=(self), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://*.supabase.co wss://*.supabase.co https://open.er-api.com https://nominatim.openstreetmap.org; media-src 'self' https://*.supabase.co data: blob:; frame-src https://js.stripe.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'",
};

const STATIC_ASSET_PATHS = ['/assets/', '/images/', '/bimi/', '/download/'];
const STATIC_ASSET_EXTENSIONS = ['.woff2', '.woff', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.ico', '.json', '.txt'];

function isStaticAsset(pathname) {
  if (STATIC_ASSET_PATHS.some((p) => pathname.startsWith(p))) return true;
  if (STATIC_ASSET_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true;
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Social preview image proxy — resized JPEG for WhatsApp/Facebook og:image
    const ogMatch = pathname.match(/^\/og-image\/(.+?)\/?$/);
    if (ogMatch) {
      const slug = ogMatch[1];
      return fetch(
        `https://aiiefgjfftmerayihpbv.supabase.co/functions/v1/product-og-image?slug=${encodeURIComponent(slug)}`
      );
    }

    // Product pages — SSR mode: injects OG meta into SPA shell
    const productMatch = pathname.match(/^\/products\/(.+?)\/?$/);
    if (productMatch) {
      const slug = productMatch[1];
      return fetch(
        `https://aiiefgjfftmerayihpbv.supabase.co/functions/v1/product-og?slug=${encodeURIComponent(slug)}&mode=ssr`
      );
    }

    // Static assets and SPA fallback are served by the assets binding
    const response = await env.ASSETS.fetch(request);

    // Pass through redirects and responses without a body unchanged
    if (!response.body || (response.status >= 300 && response.status < 400)) {
      return response;
    }

    const headers = new Headers(response.headers);

    // Apply security headers to all responses
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      headers.set(key, value);
    });

    // Long-term cache for static assets
    if (isStaticAsset(pathname)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }

    // Ensure correct content-type for Android App Links verification
    if (pathname === '/.well-known/assetlinks.json') {
      headers.set('Content-Type', 'application/json');
      headers.set('Cache-Control', 'public, max-age=86400');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
