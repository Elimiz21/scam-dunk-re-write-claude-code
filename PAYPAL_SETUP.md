# PayPal Subscription Integration Setup

This document explains how to set up and configure PayPal subscription payments for ScamDunk Pro.

## Overview

The app uses PayPal Subscriptions API to handle recurring monthly payments for the Pro plan ($9/month). Users can subscribe via PayPal buttons on:
- The account page
- The limit reached message (when free checks are exhausted)

## Prerequisites

1. A PayPal Business account
2. Access to PayPal Developer Dashboard

## Setup Steps

### 1. Create PayPal App

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Navigate to "Apps & Credentials"
3. Click "Create App"
4. Give your app a name (e.g., "ScamDunk Pro Subscriptions")
5. Select "Merchant" as the app type
6. Copy your **Client ID** and **Secret** (you'll need these for environment variables)

### 2. Create Subscription Plan

**Important:** Subscription plans are created in your regular PayPal Business account, NOT the Developer Dashboard.

#### For Sandbox Testing:
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Click on "Sandbox" in the left menu
3. Click "Accounts" to see your sandbox accounts
4. Find your sandbox business account and click the "..." menu
5. Click "View/Edit Account" and note the email/password
6. Open a new incognito/private browser window
7. Go to [PayPal Sandbox](https://www.sandbox.paypal.com/)
8. Log in with your sandbox business account credentials
9. Once logged in, go to "Settings" (gear icon) → "Payment preferences" → "Manage automatic payments" → "Subscriptions"
10. Click "Create" or use the PayPal Subscriptions API

**Alternative (easier) - Use the API directly:**
You can also create a subscription plan via API. Here's a curl example:

```bash
# Get access token first
curl -v https://api-m.sandbox.paypal.com/v1/oauth2/token \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "CLIENT_ID:SECRET" \
  -d "grant_type=client_credentials"

# Create product
curl -v -X POST https://api-m.sandbox.paypal.com/v1/catalogs/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "name": "ScamDunk Pro",
    "description": "200 stock checks per month with full risk analysis",
    "type": "SERVICE",
    "category": "SOFTWARE"
  }'

# Create billing plan (use product ID from previous response)
curl -v -X POST https://api-m.sandbox.paypal.com/v1/billing/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "product_id": "PRODUCT_ID_FROM_PREVIOUS_STEP",
    "name": "ScamDunk Pro Monthly",
    "description": "200 stock checks per month",
    "billing_cycles": [
      {
        "frequency": {
          "interval_unit": "MONTH",
          "interval_count": 1
        },
        "tenure_type": "REGULAR",
        "sequence": 1,
        "total_cycles": 0,
        "pricing_scheme": {
          "fixed_price": {
            "value": "4.99",
            "currency_code": "USD"
          }
        }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "setup_fee_failure_action": "CONTINUE",
      "payment_failure_threshold": 3
    }
  }'
```

The response will contain your Plan ID (starts with `P-`).

#### For Live/Production:
1. Go to [PayPal.com](https://www.paypal.com/) and log into your **Business account**
2. Click on "Settings" (gear icon) → "Products & Services"
3. Under "Products & Services", look for "Subscriptions" or "Recurring Payments"
4. Click "Get Started" or "Create"
5. Follow the wizard to create your plan:
   - **Name**: ScamDunk Pro
   - **Description**: 200 stock checks per month with full risk analysis
   - **Billing Cycle**: Monthly
   - **Price**: $4.99 USD
   - **Setup Fee**: None
6. Save the plan and copy the **Plan ID** (starts with `P-`)

### 3. Configure Webhooks (Recommended)

Webhooks ensure your app is notified when subscriptions are activated, cancelled, or updated.

1. In PayPal Developer Dashboard, go to "Webhooks"
2. Click "Add Webhook"
3. Enter your webhook URL:
   - **Sandbox**: `https://your-dev-domain.com/api/billing/paypal/webhook`
   - **Live**: `https://your-production-domain.com/api/billing/paypal/webhook`
4. Select these event types:
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.UPDATED`
   - `PAYMENT.SALE.COMPLETED`
5. Save and copy the **Webhook ID**

### 4. Environment Variables

Add these variables to your `.env` file:

```bash
# PayPal Configuration
PAYPAL_CLIENT_ID="your-client-id-from-step-1"
PAYPAL_CLIENT_SECRET="your-client-secret-from-step-1"
PAYPAL_PLAN_ID="P-your-plan-id-from-step-2"
PAYPAL_WEBHOOK_ID="your-webhook-id-from-step-3"
PAYPAL_MODE="sandbox"  # Use "live" for production
```

**Important**:
- Use **sandbox** credentials for testing
- Switch to **live** credentials and set `PAYPAL_MODE="live"` when going to production

### 5. Test the Integration

1. Start your development server
2. Log in to your app
3. Go to the Account page
4. Click the PayPal Subscribe button
5. Use PayPal Sandbox test accounts to complete a test subscription:
   - Buyer test account credentials are available in PayPal Developer Dashboard under "Sandbox > Accounts"

### 6. Verify Webhook Delivery

After testing a subscription:

1. Go to PayPal Developer Dashboard > Webhooks
2. Click on your webhook
3. Check "Webhook Events" to see delivered events
4. Verify your app received and processed the events (check your server logs)

## How It Works

### User Flow

1. **User clicks PayPal button** on account page or limit reached message
2. **PayPal SDK loads** and renders the subscribe button
3. **User approves subscription** in PayPal popup
4. **Frontend calls** `/api/billing/paypal/activate` with subscription ID
5. **Backend verifies** subscription with PayPal API
6. **User upgraded** to PAID plan in database
7. **Page refreshes** to show Pro plan status

### Webhook Flow

1. **PayPal sends webhook** to `/api/billing/paypal/webhook`
2. **Backend verifies** webhook signature (if PAYPAL_WEBHOOK_ID is set)
3. **Backend processes** event:
   - `BILLING.SUBSCRIPTION.ACTIVATED` → Upgrade user to PAID
   - `BILLING.SUBSCRIPTION.CANCELLED` → Downgrade user to FREE
   - `BILLING.SUBSCRIPTION.SUSPENDED` → Downgrade user to FREE
   - `BILLING.SUBSCRIPTION.EXPIRED` → Downgrade user to FREE
   - `PAYMENT.SALE.COMPLETED` → Ensure user is PAID (recurring payment)
4. **Database updated** to reflect subscription status

## File Structure

```
src/
├── lib/
│   └── paypal.ts                           # PayPal SDK integration & webhook handling
├── components/
│   └── PayPalButton.tsx                    # Reusable PayPal subscribe button component
├── app/
│   ├── (protected)/account/page.tsx        # Account page with PayPal button
│   └── api/billing/paypal/
│       ├── config/route.ts                 # Returns PayPal config for frontend
│       ├── activate/route.ts               # Activates subscription after approval
│       └── webhook/route.ts                # Handles PayPal webhook events
```

## Security Considerations

1. **Never expose your Client Secret** in frontend code
2. **Always verify webhook signatures** in production
3. **Use HTTPS** for webhook URLs in production
4. **Validate subscription status** on the backend before granting access
5. **Store PayPal credentials** in environment variables, never in code

## Subscription Management

Users can manage their PayPal subscriptions by:
1. Logging into their PayPal account
2. Going to Settings > Payments > Manage automatic payments
3. Finding "ScamDunk Pro" and clicking "Cancel" or "Update"

When users cancel:
- PayPal sends a webhook to your app
- Your app automatically downgrades them to FREE plan
- They retain access until the end of their billing period

## Troubleshooting

### PayPal button doesn't appear
- Check browser console for errors
- Verify `PAYPAL_CLIENT_ID` and `PAYPAL_PLAN_ID` are set correctly
- Ensure `/api/billing/paypal/config` returns valid configuration

### Subscription created but user not upgraded
- Check server logs for errors in `/api/billing/paypal/activate`
- Verify PayPal API credentials are correct
- Ensure subscription status is "ACTIVE" or "APPROVED"

### Webhooks not being received
- Verify webhook URL is publicly accessible (use ngrok for local testing)
- Check PayPal Developer Dashboard > Webhooks > Events to see delivery status
- Ensure webhook URL uses HTTPS in production
- Check server logs for webhook processing errors

### Users downgraded unexpectedly
- Check webhook events in PayPal Dashboard
- Verify subscription is still active in PayPal
- Check for failed payments in PayPal account

## Going to Production

Before launching with live payments:

1. **Switch to Live Credentials**:
   - Create a live PayPal app (not sandbox)
   - Create a live subscription plan
   - Update environment variables with live credentials
   - Set `PAYPAL_MODE="live"`

2. **Test Live Mode**:
   - Use a real PayPal account to test
   - Verify webhooks are received
   - Test subscription cancellation

3. **Monitor**:
   - Check server logs regularly
   - Monitor PayPal Dashboard for failed payments
   - Set up alerts for webhook failures

## Support

For PayPal-related issues:
- [PayPal Developer Documentation](https://developer.paypal.com/docs/subscriptions/)
- [PayPal Developer Support](https://developer.paypal.com/support/)
- PayPal Developer Forums

For app-specific issues, check the server logs and database to diagnose where the flow is breaking.
