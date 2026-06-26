# Glowbloom — Project Lumen, Phase 1

An original memory game: restore light to a sleeping world by remembering and
recreating fading patterns of light. Core loop: **Reveal → Fade → Recall → Bloom.**

This repo is a monorepo:

```
glowbloom/
  app/        Flutter client (Android + iOS) — game, offline cache, stats, leaderboards, ads
  backend/    Node.js + Express + Prisma API over PostgreSQL
  docs/       Store ASO/SEO pack and other docs
  .github/    CI: Android build + backend check
```

## What's implemented (v0.1)

- Glowbloom core loop with Level, Light (score), **Radiance multiplier**, and lives.
- **Offline-first**: every run is saved to a local SQLite cache (sqflite) and synced
  to Postgres when signed in and online.
- **Stats dashboard**: highest level, best score, total light, rounds played, and an
  improvement-trend sparkline.
- **Leaderboards**: top performers for **today / this week / this month / overall**,
  plus your own rank.
- **Google AdMob**: banner on home + rewarded ad at game-over (uses Google TEST ad
  units out of the box; swap in your real units before release).
- Auth per the approved decisions: email mandatory + verified, mobile optional,
  Google + Meta (Facebook), and Sign in with Apple on iOS. Under-18 users route to a
  DPDP-compliant kids mode (non-personalised ads, no profiling).

## Prerequisites

- Flutter SDK (stable) and Android Studio / Xcode — https://docs.flutter.dev/get-started/install
- Node.js 20+
- A PostgreSQL database (you said you have one — put its URL in backend/.env)

## 1. Run the backend

```bash
cd backend
cp .env.example .env          # then edit DATABASE_URL to point at your Postgres
npm install
npx prisma generate
npx prisma migrate dev --name init   # creates the tables
npm run dev                   # API on http://localhost:4000  (GET /health to check)
```

`DEV_RETURN_CODES=true` in .env makes email/SMS verification codes come back in the
API response so you can test sign-in locally without an email/SMS provider.

## 2. Run the app

```bash
cd app
# one-time: generate the native android/ios folders (preserves lib/ and pubspec.yaml)
#   Windows:  powershell -ExecutionPolicy Bypass -File setup.ps1
#   macOS/Linux:  bash setup.sh
flutter run
```

Point the app at your backend:

- Android emulator reaches your PC at `10.0.2.2` (already the default).
- Real device / different host:
  `flutter run --dart-define=API_BASE_URL=http://YOUR_PC_IP:4000`

The game is fully playable **offline / as a guest** — sign-in only adds cloud sync
and leaderboards.

## 3. Push to GitHub

```bash
cd glowbloom            # repo root (this folder)
# If a partial .git folder exists from earlier setup, delete it first:
#   Windows:  rmdir /s /q .git
git init
git add .
git commit -m "Glowbloom v0.1: game, offline cache, stats, leaderboards, ads, backend"
git remote add origin https://github.com/treeantstechnologies-tech/lumen-bloomglow.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules/`, build output, and signing keys.

## 4. Path to Google Play (first release)

1. Create a Google Play Console account (one-time $25). 
2. In AdMob, create real banner + rewarded ad units; set them at build time:
   `flutter build appbundle --release --dart-define=ADMOB_BANNER=... --dart-define=ADMOB_REWARDED=...`
   and put your AdMob app id in `android/app/src/main/AndroidManifest.xml`.
3. Configure release signing (keystore) — never commit it (already git-ignored).
4. `flutter build appbundle --release` → upload the `.aab` to an internal testing track.
5. Complete the store listing using `docs/ASO_and_Store_SEO.md`, the Data safety form,
   and the content rating questionnaire, then roll out.

## Compliance notes

- Email is the only mandatory verified field; mobile is optional (verified if given).
- Under-18 (kids mode): non-personalised ads + no profiling, per India's DPDP Rules.
  Wire verifiable parental consent before processing minors' data prior to public launch.
- SMS OTP in India must use DLT-registered templates/sender IDs.

See `../Project_Lumen_BRD.docx` and `../Project_Lumen_Open_Questions_Decision_Log.docx`
for the full requirements and decisions.
