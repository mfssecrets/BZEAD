#!/usr/bin/env node
/**
 * End-to-end build script for the Bzead buyer Android app.
 * 1. Builds the buyer-only web app.
 * 2. Syncs assets into the Android project.
 * 3. Optionally builds a debug APK or release AAB.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_APP_DIR = path.resolve(ROOT, '../Bzeadstore-main');
const ANDROID_DIR = path.join(ROOT, 'android');

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function checkAndroidSdk() {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const localProps = path.join(ANDROID_DIR, 'local.properties');

  if (!androidHome && !existsSync(localProps)) {
    console.error('\n❌ Android SDK not found.');
    console.error('   Set ANDROID_HOME or copy android/local.properties.example to android/local.properties');
    process.exit(1);
  }
}

function main() {
  const target = process.argv[2] || 'debug';

  if (!existsSync(WEB_APP_DIR)) {
    throw new Error(`Web app directory not found: ${WEB_APP_DIR}`);
  }

  // 1. Build buyer web app
  run('npm run build:buyer', WEB_APP_DIR);

  // 1b. Strip files that should not ship inside the APK/AAB
  run('node scripts/prepare-assets.mjs', ROOT);

  const distBuyer = path.join(WEB_APP_DIR, 'dist-buyer');
  if (!existsSync(distBuyer)) {
    throw new Error(`Buyer build output missing: ${distBuyer}`);
  }

  // 2. Sync into Android project
  run('npx cap sync', ROOT);

  // 3. Ensure custom plugins remain registered after sync
  run('node scripts/restore-plugins.mjs', ROOT);

  // 4. Build native package
  checkAndroidSdk();
  if (target === 'release') {
    run('./gradlew bundleRelease', ANDROID_DIR);
    console.log('\n✅ Release AAB:');
    console.log(path.join(ANDROID_DIR, 'app/build/outputs/bundle/release/app-release.aab'));
  } else {
    run('./gradlew assembleDebug', ANDROID_DIR);
    console.log('\n✅ Debug APK:');
    console.log(path.join(ANDROID_DIR, 'app/build/outputs/apk/debug/app-debug.apk'));
  }
}

main();
