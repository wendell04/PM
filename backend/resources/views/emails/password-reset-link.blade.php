<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
    /* One look everywhere. Clients that honour this stop recoloring the email in dark mode. */
    :root { color-scheme: light only; supported-color-schemes: light only; }
  </style>
</head>
    <body style="font-family: Arial, sans-serif; background: #f0efec; margin: 0; padding: 0;">
        <div class="wrapper" style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden;">
            <div class="header" style="background: #0f0f0f; padding: 32px 40px; text-align: left;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo-v3.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table>
            </div>
            <div class="body" style="padding: 36px 40px;">
                <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">Hi, <span style="color: #111111; font-weight: 600;">{{$firstName}}</span>!</p>
                <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">We received a request to reset your password. Click the button below to continue. You'll be asked to verify a code on the website.</p>
                <div style="text-align: center; margin: 24px 0;">
                    <a href="{{$resetUrl}}" class="button" style="display: inline-block; background: #0f0f0f; color: #0f0f0f; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 16px 0; text-align:left;">Reset My Password</a>
                </div>
                <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">If you did not request a password reset, you can safely ignore this email.</p>
                <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0;"><strong style="color: #111111;">For your security:</strong> This link will expire in 30 minutes.</p>
            </div>
            <div class="footer" style="padding: 20px 40px; border-top: 1px solid #e5e3de; text-align: center;">
                <p style="color: #6b6b6b; font-size: 11px; margin: 0;">&copy; {{(date('Y'))}} Personalize Me Prints. All rights reserved.</p>
            </div>
        </div>
    </body>
</html>
