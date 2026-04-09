<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0;">
    <div style="max-width: 480px; margin: 40px auto; background: #1a1a1a; border-radius: 16px; overflow: hidden;">

        {{-- Gold gradient header --}}
        <div style="background: linear-gradient(135deg, #b8922f, #d4a843); padding: 32px 40px; text-align: center;">
            <h1 style="color: #0f0f0f; font-size: 22px; margin: 0; font-weight: 800; letter-spacing: 1px;">
                PERSONALIZE ME PRINTS
            </h1>
        </div>

        {{-- Body --}}
        <div style="padding: 36px 40px;">
            <p style="color: #aaa; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
                Hi, <span style="color: #f5f5f5; font-weight: 600;">{{ $userName }}</span>!
            </p>
            <p style="color: #aaa; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">
                Use the verification code below to complete your login.
                This code expires in {{ $expiryMinutes }} minutes.
            </p>

            {{-- OTP code box --}}
            <div style="background: #222; border: 2px solid #d4a843; border-radius: 12px; text-align: center; padding: 24px; margin: 24px 0;">
                <div style="font-size: 42px; font-weight: 900; color: #d4a843; letter-spacing: 12px; font-family: monospace;">
                    {{ $otpCode }}
                </div>
                <small style="color: #888; font-size: 12px; display: block; margin-top: 8px;">
                    Do not share this code with anyone.
                </small>
            </div>

            <p style="color: #aaa; font-size: 14px; line-height: 1.7; margin: 0;">
                If you did not request this, you can safely ignore this email.
            </p>
        </div>

        {{-- Footer --}}
        <div style="padding: 20px 40px; border-top: 1px solid #2a2a2a; text-align: center;">
            <p style="color: #555; font-size: 11px; margin: 0;">
                &copy; {{ date('Y') }} Personalize Me Prints. All rights reserved.
            </p>
        </div>

    </div>
</body>
</html>
