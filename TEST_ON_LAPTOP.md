# Test Glowbloom on your laptop (Windows)

The app now runs on **Chrome, Windows desktop, Android emulator, and a physical
Android phone**. Use the exact paths below.

Prerequisite: install Flutter and run `flutter doctor` once — fix anything it flags.
(Chrome path needs only Flutter + Chrome. Android needs the Android SDK / Android
Studio. Windows desktop needs Visual Studio with the "Desktop development with C++"
workload.)

## One-time setup (generates the native folders, keeps the app code)

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
powershell -ExecutionPolicy Bypass -File setup.ps1
```

This creates the android / ios / web / windows folders and runs `flutter pub get`.

## Option 1 — Chrome (fastest, no extra installs)

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
flutter run -d chrome
```

On web, ads are disabled and scores are kept in memory (reset on refresh) — perfect
for quickly playing and checking the UI.

## Option 2 — Windows desktop app

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
flutter run -d windows
```

Runs natively in a desktop window. Ads are disabled on desktop; scores persist in a
local SQLite file.

## Option 3 — Android emulator

1. Open Android Studio → Device Manager → start (or create) an emulator.
2. Then:

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
flutter devices        # confirm the emulator is listed
flutter run            # runs the real shipping app: AdMob test ads + SQLite
```

## Option 4 — Physical Android phone

1. On the phone: Settings → About phone → tap "Build number" 7 times to enable
   Developer options, then turn on "USB debugging".
2. Plug the phone into the laptop via USB and approve the prompt.

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\app"
flutter devices        # your phone should appear
flutter run
```

## Optional — turn on the online features (leaderboards, cloud sync)

Open a second terminal and start the backend (needs Node + your Postgres):

```powershell
cd "D:\sachin b\projects\Project Lumen - GlowBloom\glowbloom\backend"
copy .env.example .env      # then edit DATABASE_URL to your Postgres
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev                 # http://localhost:4000
```

The app picks the right backend address automatically:
- Chrome / Windows desktop → http://localhost:4000
- Android emulator → http://10.0.2.2:4000 (the host's localhost)
- Physical phone (same Wi-Fi) → run with:
  `flutter run --dart-define=API_BASE_URL=http://YOUR_PC_IP:4000`  (find it via `ipconfig`)

The game is fully playable offline / as a guest — the backend only adds leaderboards,
ranking and cloud sync.

## What to try

Play a few rounds, watch the home stats (highest level, best score, total light, trend)
update, open Leaderboards and switch Today / Week / Month / Overall. With the backend
on and signed in, your rank appears. See docs/TESTING.md for the full checklist.
