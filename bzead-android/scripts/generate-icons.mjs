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

const PLAY_STORE = { size: 512, out: path.join(ROOT, 'bzead-android/android/app/src/main/play-store-icon.png') };

const SPLASH = {
  mdpi: { w: 320, h: 480 },
  hdpi: { w: 480, h: 720 },
  xhdpi: { w: 640, h: 960 },
  xxhdpi: { w: 960, h: 1440 },
  xxxhdpi: { w: 1280, h: 1920 },
};

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function generateLauncherIcons() {
  const img = sharp(SOURCE).resize(192, 192, { fit: 'contain', background: { r: 30, g: 41, b: 59 } });

  for (const [density, size] of Object.entries(DENSITIES)) {
    const dir = path.join(RES_DIR, `mipmap-${density}`);
    await ensureDir(dir);

    // Legacy rounded square (Android < 26)
    await img
      .clone()
      .resize(size, size, { fit: 'contain', background: { r: 30, g: 41, b: 59 } })
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));

    await img
      .clone()
      .resize(size, size, { fit: 'contain', background: { r: 30, g: 41, b: 59 } })
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // Round icon
    await img
      .clone()
      .resize(size, size, { fit: 'contain', background: { r: 30, g: 41, b: 59 } })
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));
  }

  // Play Store icon
  await ensureDir(path.dirname(PLAY_STORE.out));
  await sharp(SOURCE)
    .resize(PLAY_STORE.size, PLAY_STORE.size, { fit: 'contain', background: { r: 30, g: 41, b: 59 } })
    .png()
    .toFile(PLAY_STORE.out);

  console.log('✅ Launcher icons generated');
}

async function generateSplash() {
  for (const [density, { w, h }] of Object.entries(SPLASH)) {
    const dir = path.join(RES_DIR, `drawable-${density}`);
    await ensureDir(dir);

    // Create a slate-900 background with centered logo at 25% width
    const logoSize = Math.round(Math.min(w, h) * 0.25);
    const logo = await sharp(SOURCE).resize(logoSize, logoSize, { fit: 'contain', background: { r: 30, g: 41, b: 59 } }).toBuffer();

    await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 30, g: 41, b: 59 } },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(path.join(dir, 'splash.png'));
  }
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
