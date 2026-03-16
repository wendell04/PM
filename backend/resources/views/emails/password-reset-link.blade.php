<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0;">
        <div class="wrapper" style="max-width: 480px; margin: 40px auto; background: #1a1a1a; border-radius: 16px; overflow: hidden;">
            <div class="header" style="background: linear-gradient(135deg, #b8922f, #d4a843); padding: 32px 40px; text-align: center;">
                <h1 style="color: #0f0f0f; font-size: 22px; margin: 0; font-weight: 800; letter-spacing: 1px;">PERSONALIZE ME PRINTS</h1>
            </div>
            <div class="body" style="padding: 36px 40px;">
                <p style="color: #aaa; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">Hi, <span style="color: #f5f5f5; font-weight: 600;">{{$firstName}}</span>!</p>
                <p style="color: #aaa; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">We received a request to reset your password. Click the button below to continue. You'll be asked to verify a code on the website.</p>
                <div style="text-align: center; margin: 24px 0;">
                    <a href="{{$resetUrl}}" class="button" style="display: inline-block; background: linear-gradient(135deg, #b8922f, #d4a843); color: #0f0f0f; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 16px 0; text-align: center;">Reset My Password</a>
                </div>
                <p style="color: #aaa; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">If you did not request a password reset, you can safely ignore this email.</p>
                <p style="color: #aaa; font-size: 14px; line-height: 1.7; margin: 0;"><strong style="color: #f5f5f5;">For your security:</strong> This link will expire in 30 minutes.</p>
            </div>
            <div class="footer" style="padding: 20px 40px; border-top: 1px solid #2a2a2a; text-align: center;">
                <p style="color: #555; font-size: 11px; margin: 0;">&copy; {{(date('Y'))}} Personalize Me Prints. All rights reserved.</p>
            </div>
        </div>
    </body>
</html>
