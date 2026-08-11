#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function loadLocalEnvIfNeeded() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) return;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    const raw = await readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex <= 0) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim();
      if (!key) continue;
      if (process.env[key] == null || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional here; fallback to process env and existing skip behavior.
  }
}

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let SITE_URL = 'https://www.bzead.com';
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const SHARE_DIR = path.join(DIST_DIR, 'share');

const PAGE_SIZE = 500;

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolveImageUrl(product) {
  const image = String(product?.image_url || '').trim()
    || (Array.isArray(product?.images) && product.images.length > 0 ? String(product.images[0] || '').trim() : '');

  if (!image) return `${SITE_URL}/images/logo/bzead-logo.png`;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${SITE_URL}${image.startsWith('/') ? '' : '/'}${image}`;
}

/** og:image via Supabase edge function — resized JPEG, works for every product without Amplify routing. */
function resolveSocialImageUrl(slug, fallbackImageUrl) {
  const s = String(slug || '').trim();
  if (s && SUPABASE_URL) {
    const base = SUPABASE_URL.replace(/\/+$/, '');
    return `${base}/functions/v1/product-og-image?slug=${encodeURIComponent(s)}`;
  }
  return fallbackImageUrl || `${SITE_URL}/images/logo/bzead-logo.png`;
}

function buildShareHtml(product) {
  const slug = String(product.slug || '').trim();
  const title = String(product.name || 'BZEAD Product').trim() || 'BZEAD Product';
  const description = String(product.short_description || product.description || title).trim().slice(0, 200);
  const image = resolveSocialImageUrl(slug, resolveImageUrl(product));
  const productUrl = `${SITE_URL}/products/${encodeURIComponent(slug)}`;
  const shareUrl = `${SITE_URL}/share/${encodeURIComponent(slug)}`;
  const price = product?.price == null ? '' : String(product.price);
  const currency = String(product?.currency || 'INR');
  const brand = String(product?.brand || '').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} - BZEAD</title>
  <meta name="description" content="${esc(description)}" />

  <meta property="og:type" content="product" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:secure_url" content="${esc(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta property="og:site_name" content="BZEAD" />
  ${price ? `<meta property="product:price:amount" content="${esc(price)}" />` : ''}
  ${currency ? `<meta property="product:price:currency" content="${esc(currency)}" />` : ''}
  ${brand ? `<meta property="product:brand" content="${esc(brand)}" />` : ''}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta name="twitter:image:src" content="${esc(image)}" />
  <link rel="image_src" href="${esc(image)}" />
  <meta property="og:image:alt" content="${esc(title)}" />

  <meta http-equiv="refresh" content="0;url=${esc(productUrl)}" />
  <link rel="canonical" href="${esc(productUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(productUrl)}">${esc(title)}</a>...</p>
</body>
</html>`;
}

async function fetchProductsPage(offset, withStatusFilter) {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/products`);
  endpoint.searchParams.set('select', 'slug,name,short_description,description,price,currency,brand,image_url,images');
  endpoint.searchParams.set('slug', 'not.is.null');
  endpoint.searchParams.set('order', 'created_at.desc');
  endpoint.searchParams.set('limit', String(PAGE_SIZE));
  endpoint.searchParams.set('offset', String(offset));
  if (withStatusFilter) endpoint.searchParams.set('status', 'eq.active');

  const res = await fetch(endpoint.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase products fetch failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchAllProducts() {
  const all = [];
  let offset = 0;
  let withStatusFilter = true;

  for (;;) {
    let page = [];
    try {
      page = await fetchProductsPage(offset, withStatusFilter);
    } catch (err) {
      if (withStatusFilter && /column .*status|status does not exist|PGRST|42703/i.test(String(err))) {
        withStatusFilter = false;
        offset = 0;
        all.length = 0;
        continue;
      }
      throw err;
    }

    if (page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function main() {
  await loadLocalEnvIfNeeded();

  SUPABASE_URL = String(process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  SUPABASE_ANON_KEY = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  SITE_URL = String(process.env.VITE_PUBLIC_APP_URL || process.env.VITE_DOMAIN || 'https://bzead.com')
    .trim()
    .replace(/\/+$/, '');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[share-pages] Skipped: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    return;
  }

  const products = await fetchAllProducts();
  const seen = new Set();

  await rm(SHARE_DIR, { recursive: true, force: true });
  await mkdir(SHARE_DIR, { recursive: true });

  for (const product of products) {
    const slug = String(product?.slug || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const targetDir = path.join(SHARE_DIR, slug);
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, 'index.html'), buildShareHtml(product), 'utf8');
  }

  const shareRootHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0;url=${SITE_URL}" />
  <title>BZEAD</title>
</head>
<body>
  <p>Redirecting to <a href="${SITE_URL}">${SITE_URL}</a>...</p>
</body>
</html>`;
  await writeFile(path.join(SHARE_DIR, 'index.html'), shareRootHtml, 'utf8');

  console.log(`[share-pages] Generated ${seen.size} static share pages in dist/share`);
}

main().catch((err) => {
  console.error('[share-pages] Failed:', err);
  process.exit(1);
});
