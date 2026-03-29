# Automatic Email Setup

This project now includes a Firebase Cloud Function that sends an email automatically when a token status changes to `called`.

## What it does

- Reads the token document at `sessions/{sessionDate}/tokens/{tokenId}`
- Sends an email if:
  - `status` changes to `called`
  - `emailAddress` is present and valid
  - `emailNotificationSentAt` is not already set
- Marks the token with `emailNotificationSentAt` after a successful send

## Provider

The function uses Resend for email delivery.

## Required secrets

Set these Firebase function secrets before deploying:

```bash
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set RESEND_FROM_EMAIL
```

Example sender value for `RESEND_FROM_EMAIL`:

```text
Smart Queue <alerts@yourdomain.com>
```

## Install and deploy

From the project root:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Important notes

- You must verify your sender/domain in Resend before sending from your own email.
- Existing frontend `Send Email` behavior can still be used as a fallback until the function is deployed.
- Automatic delivery starts only after the Firebase function is deployed successfully.
