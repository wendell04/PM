<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; background: #f0efec; margin: 0; padding: 0;">
        <div class="wrapper" style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden;">
            <div class="header" style="background: linear-gradient(135deg, #b8922f, #d4a843); padding: 32px 40px; text-align: center;">
                <img src="https://res.cloudinary.com/dtwzbqrdy/image/upload/v1787227737/pmp-email-logo.png" alt="Personalize Me Prints" width="64" height="64" style="display:block;margin:0 auto 10px;width:64px;height:64px;border:0;outline:none;text-decoration:none;"><h1 style="color: #0f0f0f; font-size: 22px; margin: 0; font-weight: 800; letter-spacing: 1px;">PERSONALIZE ME PRINTS</h1>
            </div>
            <div class="body" style="padding: 36px 40px;">
                <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">Hi, <span style="color: #111111; font-weight: 600;">{{$firstName}}</span>!</p>
                <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">Thank you for registering. Use the verification code below to activate your account:</p>
                <div class="code-box" style="background: #f7f7f5; border: 2px solid #d4a843; border-radius: 12px; text-align: center; padding: 24px; margin: 24px 0;">
                    <div class="code" style="font-size: 42px; font-weight: 900; color: #a67c1a; letter-spacing: 12px; font-family: monospace;">{{$code}}</div>
                    <small style="color: #6b6b6b; font-size: 12px; display: block; margin-top: 8px;">This code expires in 10 minutes</small>
                </div>
                <p style="color: #444444; font-size: 14px; line-height: 1.7; margin: 0;">If you did not create an account, you can safely ignore this email.</p>
            </div>
            <div class="footer" style="padding: 20px 40px; border-top: 1px solid #e5e3de; text-align: center;">
                <p style="color: #6b6b6b; font-size: 11px; margin: 0;">&copy; {{(date('Y'))}} Personalize Me Prints. All rights reserved.</p>
            </div>
        </div>
    </body>
</html>