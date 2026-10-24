# Order updates and confirmation email setup

## Already implemented
- Separate payment-processing page; bounded provider requests; automatic status reconciliation when a browser callback is missed.
- Confirmation and individual order pages with refresh-safe URLs.
- Signed-in order history no longer asks an authenticated user to sign in.
- Payment state and fulfilment state are displayed separately.
- Manual order progress: Order placed -> Preparing -> Shipped -> Delivered.
- Admin fields for courier name, tracking number and an HTTPS tracking URL.
- Customer progress refreshes every 20 seconds while visible, and when the tab regains focus.
- No automatic courier API integration is needed or enabled.

## Admin fulfilment workflow
Open https://flamiva.in/?view=admin, then Orders, then open the order.
After verifying payment, choose Preparing and save; next choose Shipped, enter courier/tracking details and save.
When delivery is confirmed, choose Delivered and save.
Pending is the internal fulfilment enum; customers see Order placed for paid pending orders.
Cancelled/returned orders have their own message. Refunds remain a separate Razorpay action.
Test orders are clearly labelled and do not send customer confirmation emails.

## Sender
Flamiva <flamiva@everstoneenterprises.co.in>

The GoDaddy mailbox address is configured as the default sender, but mail cannot send until a provider is connected in Render.

### Recommended for Render Free: HTTPS email API
Render Free blocks outbound SMTP ports 25, 465 and 587.
1. Create/use a Resend account and add everstoneenterprises.co.in as a sending domain.
2. Add the exact domain verification/DKIM/SPF records Resend provides at the DNS provider managing that domain. Preserve the GoDaddy mailbox MX records. Do not create multiple SPF records at the same host.
3. Verify the domain in Resend.
4. Create a sending API key and add RESEND_API_KEY to the Render backend environment.
5. Set MAIL_FROM=flamiva@everstoneenterprises.co.in, then save and redeploy.
6. Admin Settings shows whether the provider is configured. That indicator does not prove domain verification or email delivery.
7. Place an order; after captured payment, the confirmation is queued and dispatched. Admin order details show pending/sent/failed and allow retry when appropriate.

### Alternative: existing GoDaddy SMTP
Use a paid Render service that permits SMTP.
Obtain the exact SMTP host, port, TLS requirements and app password/OAuth-compatible SMTP credentials for your specific GoDaddy email product. GoDaddy Microsoft 365 and Professional Email can have different settings and authentication restrictions.
Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and MAIL_FROM in Render.
Do not put mail credentials into Vercel or any VITE_ variables.

## Delivery behaviour
- Confirmations are queued only for captured live payments, not for unpaid or test orders.
- Queue metadata persists on the existing MongoDB order document.
- Delivery failures do not block payment confirmation or mark a paid order unpaid.
- The worker retries up to five attempts; Admin can requeue failed/unsent confirmations.
- Resend requests use a stable order-based idempotency key. SMTP has a stable Message-ID, but cannot guarantee deduplication after ambiguous provider/network failures.
- A free Render service can sleep; any queued work resumes when the service wakes.
- Sent means accepted by the sending provider, not guaranteed inbox placement.
- No real confirmation email has been sent during implementation because mail credentials are not configured.
