#!/usr/bin/env node
/**
 * Generate Android adaptive + legacy launcher icons from /workspaces/BZEAD/logo.png
 * using sharp. Output goes to android/app/src/main/res/.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = '/workspaces/BZEAD';
const SOURCE = path.join(ROOT, 'logo.png');
const RES_DIR = path.join(ROOT, 'bzead-android/android/app/src/main/res');

const DENSITIES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

// Adaptive foreground layer must be the full 108dp canvas at each density.
const FOREGROUND_DENSITIES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

const PLAY_STORE = { size: 512, out: path.join(ROOT, 'bzead-android/android/app/src/main/play-store-icon.png') };

// Splash uses a dedicated logo asset (yellow chip wordmark) instead of the launcher logo.
const SPLASH_SOURCE = path.join(ROOT, 'splashscreenlogo.png');

// Radial gradient, centered at 50% 50%: #5de0e6 (center) -> #0078a6 (edge).
const GRADIENT_CENTER = '#5de0e6';
const GRADIENT_EDGE = '#0078a6';
// Solid fallback approximating the gradient, used where a flat color is required
// (the Android 12+ native windowSplashScreenBackground attribute only accepts a color).
const GRADIENT_FALLBACK_COLOR = '#1996b8';

// Portrait-locked app: drawable-port-<density> is what's actually shown, but the
// generic drawable-<density> buckets are kept in sync as a fallback.
const SPLASH_PORTRAIT = {
  mdpi: { w: 320, h: 480 },
  hdpi: { w: 480, h: 800 },
  xhdpi: { w: 720, h: 1280 },
  xxhdpi: { w: 960, h: 1600 },
  xxxhdpi: { w: 1280, h: 1920 },
};

const SPLASH_LANDSCAPE = {
  mdpi: { w: 480, h: 320 },
  hdpi: { w: 800, h: 480 },
  xhdpi: { w: 1280, h: 720 },
  xxhdpi: { w: 1600, h: 960 },
  xxxhdpi: { w: 1920, h: 1280 },
};

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function generateLauncherIcons() {
  // Fill the entire launcher icon with the logo. We use a circular mask so the
  // logo is full-bleed inside the adaptive launcher shape.
  const backgroundColor = { r: 30, g: 41, b: 59 };

  // Trim transparent padding from source once, reuse buffer for all densities.
  const trimmedBuf = await sharp('/workspaces/BZEAD/logo.png')
    .trim()
    .toBuffer();

  for (const [density, size] of Object.entries(DENSITIES)) {
    const dir = path.join(RES_DIR, `mipmap-${density}`);
    await ensureDir(dir);

    // Full-bleed square logo with background fill (trim whitespace first).
    const fullBleed = sharp(trimmedBuf)
      .resize(size, size, { fit: 'cover' })
      .flatten({ background: backgroundColor });

    // Legacy rounded square (Android < 26)
    await fullBleed.png().toFile(path.join(dir, 'ic_launcher.png'));

    // Round icon: same full-bleed content inside a circular mask.
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
    );
    await fullBleed
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // Adaptive foreground: trim whitespace first so the logo fills the full
    // 108dp canvas instead of appearing as a small centred square.
    const fgSize = FOREGROUND_DENSITIES[density];
    await sharp(trimmedBuf)
      .resize(fgSize, fgSize, { fit: 'cover' })
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  // Play Store icon
  await ensureDir(path.dirname(PLAY_STORE.out));
  await sharp(trimmedBuf)
    .resize(PLAY_STORE.size, PLAY_STORE.size, { fit: 'cover' })
    .flatten({ background: backgroundColor })
    .png()
    .toFile(PLAY_STORE.out);

  console.log('✅ Launcher icons generated (full-bleed)');
}

async function radialGradientBuffer(w, h) {
  // CSS-style "circle at 50% 50%" radial gradient rasterized via SVG.
  const r = Math.round(Math.sqrt(w * w + h * h) / 2);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="${r}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${GRADIENT_CENTER}"/>
        <stop offset="100%" stop-color="${GRADIENT_EDGE}"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateSplashSet(densityMap) {
  for (const [density, { w, h }] of Object.entries(densityMap)) {
    for (const dirName of [`drawable-${density}`, `drawable-port-${density}`]) {
      const dir = path.join(RES_DIR, dirName);
      await ensureDir(dir);

      const background = await radialGradientBuffer(w, h);
      const logoSize = Math.round(Math.min(w, h) * 0.34);
      const logo = await sharp(SPLASH_SOURCE).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();

      await sharp(background)
        .composite([{ input: logo, gravity: 'center' }])
        .png()
        .toFile(path.join(dir, 'splash.png'));
    }
  }
}

async function generateSplashLandscape() {
  for (const [density, { w, h }] of Object.entries(SPLASH_LANDSCAPE)) {
    const dir = path.join(RES_DIR, `drawable-land-${density}`);
    await ensureDir(dir);

    const background = await radialGradientBuffer(w, h);
    const logoSize = Math.round(Math.min(w, h) * 0.34);
    const logo = await sharp(SPLASH_SOURCE).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();

    await sharp(background)
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(path.join(dir, 'splash.png'));
  }
}

async function generateSplashIcon() {
  // Android 12+ native system splash icon (windowSplashScreenAnimatedIcon):
  // transparent canvas, logo confined to the inner ~66% safe zone so it never
  // gets clipped, no baked-in background (windowSplashScreenBackground paints
  // the solid fallback color behind it instead).
  const dir = path.join(RES_DIR, 'drawable');
  await ensureDir(dir);

  const canvas = 960;
  const safeZone = Math.round(canvas * 0.66);
  const logo = await sharp(SPLASH_SOURCE)
    .resize(safeZone, safeZone, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'splash.png'));

  console.log('✅ Android 12+ splash icon generated');
}

async function generateSplash() {
  await generateSplashSet(SPLASH_PORTRAIT);
  await generateSplashLandscape();
  await generateSplashIcon();
  console.log('✅ Splash screens generated');
}

async function generateAdaptiveXml() {
  const anyDpiV26 = path.join(RES_DIR, 'mipmap-anydpi-v26');
  await ensureDir(anyDpiV26);

  const launcherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

  await writeFile(path.join(anyDpiV26, 'ic_launcher.xml'), launcherXml);
  await writeFile(path.join(anyDpiV26, 'ic_launcher_round.xml'), launcherXml);
  console.log('✅ Adaptive icon XML written');
}

async function main() {
  if (!existsSync(SOURCE)) {
    throw new Error(`Source icon not found: ${SOURCE}`);
  }
  await generateLauncherIcons();
  await generateSplash();
  await generateAdaptiveXml();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
