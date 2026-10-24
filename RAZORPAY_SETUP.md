# Flamiva Razorpay setup

## What changed
Stack: React/Vite frontend; Node.js/Express backend; MongoDB Atlas; Clerk login.

Server files:
- server/payments.js: server-priced INR orders, saved Razorpay order binding, HMAC verification, capture/status checks and signed webhook recovery.
- server/app.js: POST /api/create-order, POST /api/verify-payment, GET /api/payment-config, GET /api/payment-status/:id, POST /api/razorpay/webhook.
- server/index.js: loads Razorpay SDK from server environment.
- server/domain.js: prevents fulfilment of unpaid Razorpay orders.
- server/payments.test.js: payment and API security tests.

Frontend files:
- src/razorpayCheckout.js: loads official checkout.js, opens modal, handles success/dismiss/failure and verification retry.
- src/commerceStore.js: payment config and order helpers.
- src/store.jsx: Pay with Razorpay, INR amount, verified confirmation, history/retry controls.
- src/AdminPanel.jsx: payment state, gateway reference, test mode and refund guidance.
- server/checkout.test.js: isolated frontend handler tests (main project only).

Also updated package.json, package-lock.json, .env.example and render.yaml.
The provided credentials are stored in the ignored local .env only.

## Render: required before payments work online
1. Deploy the updated main branch of rahul0842singh/flamiva.
2. In the existing Render service, Environment, add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET using your provided test credentials. They are already in the local project .env.
3. Save and redeploy. Add https://flamiva.in and https://www.flamiva.in to ALLOWED_ORIGINS, keeping your existing frontend origins. Use the www origin only if you serve it.
4. Open https://flamiva.onrender.com/api/payment-config. It must return enabled:true and mode:test. Only the public key ID is exposed.
5. In Razorpay Dashboard, review payment capture settings. The backend also attempts capture when verification finds an authorised payment.

## Vercel frontend
The updated local project is outputs/ember-earth.
The compiled deployment folder is outputs/Flamiva-Vercel-build (index.html at its root).
A ZIP of that compiled folder is also provided.
Redeploy that folder using the same Vercel deployment method you used previously.
The frontend defaults to https://flamiva.onrender.com/api.
No Razorpay secret belongs in Vercel or any VITE_ variable.
The public key ID is returned by the backend so checkout uses the matching key.

## Test
1. Add an in-stock candle to the bag.
2. Sign in with Clerk, open checkout, enter delivery details.
3. Confirm the displayed INR amount, click Pay with Razorpay.
4. Use Razorpay's documented test payment details; do not use real card information in test mode.
5. Successful captured test payment leads to Payment verified; My orders and Admin show paid (test).
6. Dismiss the modal: bag remains and order remains awaiting_payment.
7. Retry from My orders. Check payment status before attempting another payment if the connection dropped.
8. Invalid signatures, wrong account, mismatched amount/currency and uncaptured payments never mark an order paid.

Verification completed here: production build, 28 automated checks, zero runtime dependency audit findings, and read-only authentication against Razorpay with test credentials.
An actual end-to-end Razorpay test payment has NOT been submitted.

## Webhook: strongly recommended for browser-close/network recovery
Create a Razorpay TEST webhook:
URL: https://flamiva.onrender.com/api/razorpay/webhook
Events: payment.captured and order.paid
Choose a separate webhook secret; set the same value as RAZORPAY_WEBHOOK_SECRET in Render and redeploy.
The webhook validates the raw-body HMAC before checking payment with Razorpay.
Use a separate matching webhook configuration when switching to live mode.

## Operational details
- All charges are in INR. Product catalog prices currently use the existing base USD values and fixed INR rate of 84. Review real prices and shipping/tax settings before live collection.
- Totals, inventory, coupons and delivery information are saved before checkout. Client-supplied amounts cannot lower the server total.
- Awaiting-payment orders reserve stock and coupon usage until completion or manual cancellation; no automatic expiry job is installed.
- Review unpaid orders in Admin. Check Razorpay before cancelling, especially after a customer reports a debit.
- Cancellation/return does not automatically issue a refund. Refund in Razorpay Dashboard separately.
- A late captured payment on a cancelled order is flagged for manual review/refund and never automatically fulfilled.
- KYC completion does not turn test keys into live keys. To collect real money, replace both Razorpay credentials with your LIVE pair in Render after testing. The UI switches its mode label based on the key.
