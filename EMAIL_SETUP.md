# Email Setup Guide

## Local Development (Mock Mode)

For local development, you can run the backend without email configuration. The system will simply log OTP codes to the console.

## Production Setup (Real Email)

To enable real email delivery when deploying to Render/Vercel:

### 1. Get Resend API Key

1. Visit [resend.com](https://resend.com)
2. Sign up for a free account
3. Navigate to **API Keys** section
4. Create a new API key

### 2. Add Domain to Resend (Optional but Recommended)

For better deliverability:

1. In Resend dashboard, go to **Domains**
2. Add your domain (e.g., `yourdomain.com`)
3. Follow the DNS configuration steps to verify ownership
4. Once verified, emails will appear to come from your domain

### 3. Update Environment Variables

In your `.env` file (and in Render/Vercel environment settings):

```env
RESEND_API_KEY=re_1234567890abcdefghijklmnopqrstuvwxyz
EMAIL_FROM=Voltage-Drop <noreply@yourdomain.com>
```

**Note:** If you don't configure a custom domain, use the default:
```env
EMAIL_FROM=Voltage-Drop <onboarding@resend.dev>
```

### 4. Test Email Delivery

1. Start the backend server
2. Try logging in with any user credentials
3. Check your email inbox for the OTP code
4. If not received, check your spam folder

### 5. Deploy to Render

1. Push your code to GitHub
2. Connect your Render backend service to the repository
3. Add the following environment variables in Render dashboard:
   - `RESEND_API_KEY`: Your Resend API key
   - `EMAIL_FROM`: Your configured email sender
4. Redeploy the service

### 6. Deploy to Vercel (Frontend)

The frontend doesn't need any email configuration. Just ensure:
1. Your `CORS_ORIGIN` in the backend includes your Vercel URL
2. The frontend points to your production backend URL

## Troubleshooting

### Emails Not Being Sent

- Check your Resend API key is correct
- Verify your Resend account has available credits (free tier includes 100 emails/day)
- Check backend console logs for error messages

### Emails Going to Spam

- Set up and verify a custom domain in Resend
- Add SPF, DKIM, and DMARC records to your DNS
- Avoid using `@resend.dev` domain for production

### Rate Limiting

- Free Resend tier: 100 emails/day
- If you need more, upgrade your Resend plan
- Implement retry logic if needed

## Email Templates

You can customize the email template in `backend/src/routes/auth.js`:

```javascript
html: `
  <div style="font-family: Arial, sans-serif;">
    <h2>Your Verification Code</h2>
    <p>Your OTP: <strong>${otpCode}</strong></p>
  </div>
`
```
