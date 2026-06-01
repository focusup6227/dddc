# Staff Android app — implementation plan

Goal: a **staff management app** for Android that runs the whole operation and
receives **push notifications**, with **Tap to Pay** (tap the customer's card or
phone on the staff device) for in-person payments.

Decided: **hybrid** app (Android first). The app is a **WebView over the
existing staff/kiosk web pages** — so it does everything the web app does, and
web updates flow into the app for free — plus two native capabilities a browser
can't provide: **Tap to Pay** and **push notifications**.

## Built so far (backend, in this repo — verified)

- **Tap to Pay backend:** `lib/terminal.server.ts` (settles coupon/credit, makes
  a `card_present` PaymentIntent), `POST /api/terminal/connection-token`,
  `POST /api/terminal/payment-intent`, a `payment_intent.*` webhook branch, and
  `lib/api-auth.ts` (cookie **or** Supabase bearer-token auth for the app).
- **Push backend:** `staff_push_tokens` table (migration 0030),
  `lib/push.server.ts` (Expo Push API send + token register),
  `POST /api/push/register`, and **event hooks** for: new bookings
  (`createBooking`/`createBoarding`), payments received/failed (webhook), new
  customer (`signup`), vaccine uploads (`saveVaccineRecord`), incidents
  (`createIncident`), and a daily **chore-reminders cron**
  (`/api/cron/chore-reminders`, scheduled in `vercel.json`).

Remaining is the **Android app itself** (below) — it can't be built or run in
this repo's environment; it's a separate Expo project you build with EAS.

## The hard constraint

Tap to Pay (phone-as-reader) is part of **Stripe Terminal** and runs **only
through Stripe's native iOS/Android SDKs in a native app**. It is not available
in a web browser or PWA (there is no Web NFC path Stripe supports). The current
kiosk is a Next.js web page, so Tap to Pay requires shipping a **native mobile
app**. The web kiosk keeps working and stays the fallback.

## Recommended architecture: hybrid (WebView shell + native payment module)

Rather than rewrite the whole kiosk in React Native, wrap the existing `/kiosk`
web pages in a React Native **WebView** and add a thin **native Tap-to-Pay
bridge**. The web app stays the single source of truth for kiosk UI and logic
(Today, booking detail, check-in/out, group pay); only the *collect-the-tap*
step is native.

```
┌─ React Native app (Expo dev build) ───────────────────────────┐
│  WebView → https://app/kiosk   (existing kiosk UI, unchanged)  │
│     │  window.TapToPay.pay({ intentRef })   ◄── JS bridge      │
│     ▼                                                          │
│  Native module: @stripe/stripe-terminal-react-native          │
│     • init + connection token (from our backend)              │
│     • discover/connect Tap-to-Pay reader (the phone itself)    │
│     • collectPaymentMethod → confirmPaymentIntent             │
│     ▼ on success → webview.reload() / postMessage             │
└───────────────────────────────────────────────────────────────┘
            │ HTTPS (Supabase auth cookie / token)
            ▼
   Next.js backend  ── new Terminal endpoints + webhook branch
```

Trade-off vs **full native rewrite**: hybrid ships far faster and avoids a
second copy of the kiosk UI; a full RN rewrite gives a nicer end-to-end native
feel but is a much bigger build. Recommend hybrid for v1.

## Stripe Terminal concepts we'll use

- **Location** — created once; readers (incl. Tap to Pay) attach to it.
- **Connection token** — short-lived secret the SDK needs; minted server-side.
- **Reader discovery** — `discoverReaders({ discoveryMethod: 'tapToPay' })`,
  then connect; the "reader" is the phone's NFC.
- **PaymentIntent** with `payment_method_types: ['card_present']`; the SDK
  collects + confirms it. (Exact RN method names to confirm against the
  installed SDK version.)

## Backend additions (Next.js — reuses existing money logic)

All amounts come from the **existing** settlement so Tap to Pay charges exactly
what the web kiosk would (coupon OR credit, never both):
`settleUnpaidBookings` (`lib/coupons.server.ts`) + the credit/free-settlement
handling already in `kioskPayGroup` / `createBookingCheckoutSession`.

1. **`POST /api/terminal/connection-token`** (staff-only; mirror
   `requireFullStaff`) → `getStripe().terminal.connectionTokens.create()` →
   return `{ secret }`.
2. **`POST /api/terminal/payment-intent`** — body: a booking id or a customer
   group (same inputs as `kioskTakePayment` / `kioskPayGroup`).
   - Settle the unpaid stays + unpaid add-ons → compute the chargeable total.
   - Mark fully-covered stays paid + burn credit inline (as `kioskPayGroup`
     does today).
   - `getStripe().paymentIntents.create({ amount, currency: 'usd',
     payment_method_types: ['card_present'], capture_method: 'automatic',
     metadata: { kind: 'terminal', customer_id, booking_ids, source } })`.
   - Stamp `stripe_payment_intent_id` on the charged bookings + their add-ons.
   - Return `{ clientSecret, paymentIntentId }`.
3. **Webhook branch** (`app/api/stripe/webhook/route.ts`) — add
   `payment_intent.succeeded` handling for `card_present` PIs: look the PI's
   bookings up by `stripe_payment_intent_id` (or `metadata.booking_ids`), flip
   them + matching `booking_addons` to paid, deduct `credit_applied_cents`, send
   confirmation + receipt — exactly mirroring the existing
   `checkout.session.completed` branch. Also handle
   `payment_intent.payment_failed`.
4. **Location bootstrap** — one-time `terminal.locations.create(...)`; store the
   id in settings/env (`STRIPE_TERMINAL_LOCATION_ID`).

This backend layer is buildable and testable **now**, before the app exists
(verify with Stripe test mode + the API), and is reused unchanged by a future
full-native app.

## App stack

- **Expo** with a **dev/EAS build** (Tap to Pay needs native config — not Expo
  Go).
- `@stripe/stripe-terminal-react-native` (+ its Expo config plugin).
- `react-native-webview` for the kiosk shell.
- `@supabase/supabase-js` for staff auth in the app (reuse staff roles).
- EAS Build + TestFlight (iOS) / internal track (Android) for distribution.

## Prerequisites & device requirements (the long poles)

- **Apple**: paid Apple Developer Program; **request the Tap to Pay on iPhone
  entitlement** (`com.apple.developer.proximity-reader.payment.acceptance`) —
  Apple must approve it, and it gates the build. Devices: **iPhone XS or later,
  iOS 16.7+**. No physical reader needed.
- **Android**: a **supported NFC device** (Stripe publishes the list; generally
  Android 11+ with hardware attestation/NFC). Google Tap to Pay requirements
  apply.
- **Stripe**: Terminal enabled on the account; a Location; live vs test keys.
- **Distribution**: TestFlight / App Store (iOS) and Play internal testing
  (Android) for staff devices, or MDM.

## Payment flow (sequence)

1. Staff opens kiosk in the app (WebView), taps **Take payment** / **Pay both**.
2. Web page calls the JS bridge `TapToPay.pay({ kind, ids })`.
3. Native module: ensure Terminal initialized + Tap-to-Pay reader connected
   (fetch connection token from `/api/terminal/connection-token`).
4. Native asks backend `POST /api/terminal/payment-intent` → `clientSecret`.
5. SDK `collectPaymentMethod(clientSecret)` → OS shows the tap sheet → customer
   taps card/phone → `confirmPaymentIntent`.
6. On success, backend webhook flips the bookings paid (source of truth); the
   app reloads the WebView so the kiosk reflects "paid"/checked out.

## Coexistence & fallback

Keep the web hosted-Checkout flow for: manual card entry, remote/customer
payment, and devices without Tap to Pay. The app simply adds a **Tap to Pay**
button next to the existing **Take payment**. Apple Pay / Google Pay (customer's
own wallet) already surface on the hosted Checkout on supported devices — a
zero-app quick win if wanted in parallel (Apple Pay needs one-time domain
verification).

## Testing

- Stripe **test mode** + the simulated Tap to Pay reader and Terminal test cards
  for the whole flow without hardware.
- A **physical supported device** for real NFC (simulators can't tap).
- Verify the webhook marks bookings/add-ons paid and burns credit identically to
  the web flow.

## Phased roadmap

1. **Backend (≈ buildable now):** connection-token endpoint, Terminal
   PaymentIntent endpoint (reusing settlement), webhook `payment_intent.*`
   branch, Location bootstrap. Verify in Stripe test mode.
2. **App skeleton:** Expo dev build, Supabase staff auth, WebView shell over
   `/kiosk`, JS↔native bridge.
3. **Terminal integration:** init, connection token, discover/connect Tap-to-Pay
   reader, collect/confirm a test PaymentIntent on a physical device.
4. **Wire to bookings:** bridge the kiosk "Take payment" / "Pay both" buttons to
   the native flow; reload on success.
5. **Entitlements + distribution:** Apple entitlement (request early — approval
   is the long pole), device allowlist, TestFlight / Play internal, go live in
   Stripe live mode.

## Costs / notes

- Stripe Terminal / Tap to Pay has its own per-transaction pricing (separate
  from standard online rates) — confirm current rates.
- Apple entitlement approval can take time; request it at the start of phase 1.
- Pin/confirm the Terminal RN SDK method names against the version installed.

## Open decisions for Tyler

- **Hybrid (recommended) vs full native rewrite** of the kiosk.
- **iOS first**, or iOS + Android together (Android adds the device-support
  matrix).
- **Distribution**: TestFlight/Play internal vs MDM.
- Want me to **start phase 1 (the backend Terminal endpoints + webhook branch)**
  now? It's useful and testable before any app work and is reused by either app
  approach.
