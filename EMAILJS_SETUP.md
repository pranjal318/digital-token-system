# EmailJS Setup

This app can send queue emails directly from the admin page using EmailJS, without Firebase Blaze.

## What you need from EmailJS

Create an EmailJS account and collect:

- Public key
- Service ID
- Template ID

## Update config

Open `emailjs-config.js` and replace the placeholders:

```js
window.EMAILJS_CONFIG = {
    publicKey: "your_public_key",
    serviceId: "your_service_id",
    templateId: "your_template_id"
};
```

## Suggested template variables

In your EmailJS template, use these variables:

- `to_email`
- `token_number`
- `session_date`
- `queue_status`
- `message_title`
- `message_body`

## How it works

- User enters email and generates a token
- Admin clicks `Call Next Token`
- App automatically sends an email for the token that was just called
- Admin can also click `Resend Email` for the current token

## Important note

EmailJS runs from the frontend, so this is easier to set up than backend email, but it is less secure than a server-side solution.
