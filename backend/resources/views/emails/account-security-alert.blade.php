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

        <div style="background: #0f0f0f; padding: 32px 40px; text-align:left;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table>
        </div>

        <div style="padding: 36px 40px;">
            <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
                Hi, <span style="color: #111111; font-weight: 600;">{{ $userName }}</span>!
            </p>
            <p style="color: #111111; font-size: 16px; font-weight: 700; line-height: 1.6; margin: 0 0 8px;">
                {{ $headline }}
            </p>
            <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
                {{ $message }}
            </p>

            <div style="background: #f7f7f5; border: 1px solid #e4e4e0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="color: #6b6b6b; font-size: 12px; padding: 6px 0; width: 36%;">Time</td>
                        <td style="color: #111111; font-size: 13px; padding: 6px 0; font-weight: 600;">{{ $eventTime }}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b6b6b; font-size: 12px; padding: 6px 0;">IP Address</td>
                        <td style="color: #111111; font-size: 13px; padding: 6px 0; font-weight: 600;">{{ $ipAddress }}</td>
                    </tr>
                </table>
            </div>

            <div style="background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 14px 16px; margin-bottom: 8px;">
                <p style="color: #b91c1c; font-size: 13px; margin: 0; line-height: 1.6;">
                    <strong>Wasn't you?</strong> Reset your password immediately and enable two-factor authentication.
                    If you recognise this activity, no action is needed.
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
