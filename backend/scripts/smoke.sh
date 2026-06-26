#!/usr/bin/env bash
# End-to-end smoke test for the Glowbloom backend.
# Requires the server running (npm run dev) with DEV_RETURN_CODES=true.
# Usage:  bash scripts/smoke.sh   (or: API=http://localhost:4000 bash scripts/smoke.sh)
set -euo pipefail
API="${API:-http://localhost:4000}"
EMAIL="tester+$RANDOM@example.com"
pass(){ echo "  PASS: $1"; }
fail(){ echo "  FAIL: $1"; exit 1; }

echo "1) Health"
curl -fsS "$API/health" | grep -q '"ok":true' && pass "health ok" || fail "health"

echo "2) Email sign-in (request + verify)"
CODE=$(curl -fsS -X POST "$API/auth/email/start" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}" | sed -n 's/.*"devCode":"\([0-9]*\)".*/\1/p')
[ -n "$CODE" ] && pass "got dev code $CODE" || fail "no dev code (is DEV_RETURN_CODES=true?)"

TOKEN=$(curl -fsS -X POST "$API/auth/email/verify" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\",\"displayName\":\"Smoke Tester\"}" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && pass "signed in, got token" || fail "verify failed"

AUTH="Authorization: Bearer $TOKEN"

echo "3) Submit a score"
curl -fsS -X POST "$API/scores" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"mode":"JOURNEY","light":120,"level":5,"maxRadiance":2.5}' | grep -q '"score"' \
  && pass "score saved" || fail "score submit"

echo "4) Personal stats reflect the run"
curl -fsS "$API/stats/me" -H "$AUTH" | grep -q '"bestScore":120' && pass "stats correct" || fail "stats"

echo "5) Leaderboard (overall) lists the player"
curl -fsS "$API/scores/top?mode=JOURNEY&window=all" | grep -q '"light":120' && pass "leaderboard ok" || fail "leaderboard"

echo "6) Player rank present"
curl -fsS "$API/scores/rank?mode=JOURNEY&window=all" -H "$AUTH" | grep -q '"rank":' && pass "rank ok" || fail "rank"

echo "7) Daily Moonpattern seed"
curl -fsS "$API/daily" | grep -q '"seed"' && pass "daily ok" || fail "daily"

echo ""
echo "All smoke tests passed against $API"
