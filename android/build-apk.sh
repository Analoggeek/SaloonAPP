#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BOOKING_URL:?Set BOOKING_URL to the deployed HTTPS booking website}"
: "${ANDROID_HOME:?Install Android SDK Platform 35 and Build Tools 35.0.0}"
: "${ANDROID_KEYSTORE_FILE:?Set ANDROID_KEYSTORE_FILE to your release keystore}"
: "${ANDROID_KEYSTORE_PASSWORD:?Missing keystore password}"
: "${ANDROID_KEY_ALIAS:?Missing signing alias}"
: "${ANDROID_KEY_PASSWORD:?Missing key password}"

tools="$ANDROID_HOME/build-tools/35.0.0"
platform="$ANDROID_HOME/platforms/android-35/android.jar"
[[ -x "$tools/aapt2" && -f "$platform" ]] || { echo 'Android Platform 35 and Build Tools 35.0.0 are required.' >&2; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/config" "$work/res/drawable-nodpi" "$work/generated" "$work/classes" "$work/dex" android/output

node --input-type=module - "$work/config/BookingConfig.java" <<'JS'
import {writeFileSync} from 'node:fs';
import {bookingUrl,verifyBookingServer} from './android/booking-url.mjs';
const url = bookingUrl(process.env.BOOKING_URL);
await verifyBookingServer(url);
writeFileSync(process.argv[2], `package com.maisonnoir.booking; final class BookingConfig { static final String URL = ${JSON.stringify(url.href)}; }\n`);
JS
cp public/app-icons/icon-192.png "$work/res/drawable-nodpi/icon.png"
"$tools/aapt2" compile --dir "$work/res" -o "$work/resources.zip"
"$tools/aapt2" link -o "$work/unsigned.apk" --manifest android/src/main/AndroidManifest.xml \
  -I "$platform" --java "$work/generated" --min-sdk-version 23 --target-sdk-version 35 \
  --version-code "${ANDROID_VERSION_CODE:-1}" --version-name "${ANDROID_VERSION_NAME:-1.0.0}" "$work/resources.zip"
mapfile -t generated < <(find "$work/generated" -name '*.java' -type f)
javac --release 8 -cp "$platform" -d "$work/classes" android/src/main/java/com/maisonnoir/booking/*.java "$work/config/BookingConfig.java" "${generated[@]}"
jar cf "$work/classes.jar" -C "$work/classes" .
"$tools/d8" --lib "$platform" --min-api 23 --output "$work/dex" "$work/classes.jar"
zip -j -q "$work/unsigned.apk" "$work/dex/classes.dex"
"$tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"
"$tools/apksigner" sign --ks "$ANDROID_KEYSTORE_FILE" --ks-key-alias "$ANDROID_KEY_ALIAS" \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD \
  --out android/output/maison-noir-booking.apk "$work/aligned.apk"
"$tools/apksigner" verify --verbose android/output/maison-noir-booking.apk
