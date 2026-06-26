# How to test Glowbloom

There are three layers you can test independently. Start with the backend (no phone
needed), then the app on an emulator/device.

---

## A. Test the backend (fastest — no phone needed)

You need: Node 20+ and your Postgres database.

```bash
cd glowbloom/backend
cp .env.example .env          # set DATABASE_URL to your Postgres; keep DEV_RETURN_CODES=true
npm install
npx prisma generate
npx prisma migrate dev --name init    # creates the tables
npm run dev                            # starts on http://localhost:4000
```

1. Quick check — open http://localhost:4000/health in a browser. You should see
   `{"ok":true,...}`.

2. Full automated smoke test — in a second terminal:

   ```bash
   cd glowbloom/backend
   bash scripts/smoke.sh
   ```

   It signs in with a test email, submits a score, then verifies stats, the
   leaderboard, player rank and the daily seed. You should see `All smoke tests passed`.

3. Inspect the database visually (optional):

   ```bash
   npx prisma studio        # opens a table browser in your browser
   ```

---

## B. Test the app on an emulator or phone

You need: Flutter SDK + Android Studio (Android) or Xcode (iOS). Check your setup with
`flutter doctor` — fix anything it flags.

```bash
cd glowbloom/app
# one-time: generate native android/ios folders (keeps lib/ and pubspec.yaml)
#   Windows:      powershell -ExecutionPolicy Bypass -File setup.ps1
#   macOS/Linux:  bash setup.sh
flutter devices          # list emulators / connected phones
flutter run              # builds and launches on the selected device
```

Connecting the app to your backend:
- Android emulator: already points at your PC via `10.0.2.2:4000` — just keep the
  backend running.
- Real phone (same Wi-Fi): `flutter run --dart-define=API_BASE_URL=http://YOUR_PC_IP:4000`
  (find YOUR_PC_IP with `ipconfig` on Windows / `ifconfig` on macOS).

The game is fully playable offline as a guest, so you can test the gameplay even with
the backend off.

---

## C. Manual test checklist (what to actually try)

Gameplay
- [ ] Press Play → Start. A pattern lights up, then fades. Tapping it back correctly
      makes it bloom and adds Light; Radiance multiplier rises each perfect round.
- [ ] A wrong tap wilts a bud and drops a life; losing all lives ends the run.
- [ ] After a run, the home stats update: highest level, best score, total light,
      rounds played, and the improvement-trend line.

Ads (uses Google TEST ads — safe)
- [ ] A test banner appears at the bottom of the home screen.
- [ ] At game over, the "watch an ad for bonus light" sheet appears; a test rewarded
      ad plays and grants the reward.

Online features (backend running + signed in)
- [ ] Open Leaderboards → switch Today / This week / This month / Overall.
- [ ] Your run appears and your rank shows at the top.
- [ ] Turn the backend off, play a round (it still saves locally), turn it back on —
      the pending run syncs (offline-first).

Device coverage
- [ ] Try one small and one large screen.
- [ ] Colourblind check: each bud has a distinct icon, not just a colour.

---

## D. Automated tests (optional, recommended before release)

- Backend: `scripts/smoke.sh` is an end-to-end happy-path test. We can expand this into
  a Jest/Vitest suite covering error cases (bad code, rate limiting, auth required).
- Flutter: the game logic in `lib/state/game_controller.dart` is pure Dart and ideal for
  unit tests; UI screens can use widget tests. Ask and we'll add a `test/` suite plus
  wire `flutter test` into CI.

> Note: the included GitHub Actions workflow already builds the Android APK and
> syntax-checks the backend on every push.
