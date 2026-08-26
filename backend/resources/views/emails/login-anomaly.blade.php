<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background: #f0efec; margin: 0; padding: 0;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden;">

        <div style="background: linear-gradient(135deg, #b8922f, #d4a843); padding: 32px 40px; text-align: center;">
            <img src="https://res.cloudinary.com/dtwzbqrdy/image/upload/v1787227737/pmp-email-logo.png" alt="Personalize Me Prints" width="56" height="56" style="display:block;margin:0 auto 10px;width:56px;height:56px;border:0;outline:none;text-decoration:none;">
            <h1 style="color: #0f0f0f; font-size: 22px; margin: 0; font-weight: 800; letter-spacing: 1px;">
                PERSONALIZE ME PRINTS
            </h1>
        </div>

        <div style="padding: 36px 40px;">
            <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
                Hi, <span style="color: #111111; font-weight: 600;">{{ $userName }}</span>!
            </p>
            <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
                A new sign-in to your account was just detected. Here are the details:
            </p>

            <div style="background: #f7f7f5; border: 1px solid #2e2e2e; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="color: #6b6b6b; font-size: 12px; padding: 6px 0; width: 36%;">Time</td>
                        <td style="color: #f0f0f0; font-size: 13px; padding: 6px 0; font-weight: 600;">{{ $loginTime }}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b6b6b; font-size: 12px; padding: 6px 0;">IP Address</td>
                        <td style="color: #f0f0f0; font-size: 13px; padding: 6px 0; font-weight: 600;">{{ $ipAddress }}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b6b6b; font-size: 12px; padding: 6px 0; vertical-align: top;">Device</td>
                        <td style="color: #f0f0f0; font-size: 13px; padding: 6px 0; font-weight: 600; word-break: break-word;">{{ $userAgent }}</td>
                    </tr>
                </table>
            </div>

            <div style="background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 14px 16px; margin-bottom: 8px;">
                <p style="color: #b91c1c; font-size: 13px; margin: 0; line-height: 1.6;">
                    <strong>Was this you?</strong> If you recognise this sign-in, no action is needed.<br>
                    If you didn't sign in, change your password immediately and enable two-factor authentication.
                </p>
            </div>
        </div>

        <div style="padding: 20px 40px; border-top: 1px solid #e5e3de; text-align: center;">
            <p style="color: #6b6b6b; font-size: 11px; margin: 0;">
                &copy; {{ date('Y') }} Personalize Me Prints. All rights reserved.
            </p>
        </div>

    </div>
</body>
</html>
