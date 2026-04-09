<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Personalize Me Prints</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:0;">

              {{-- Header --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;">
                <tr>
                  <td align="center" style="padding:30px 20px;">
                    <span style="color:#d4af37;font-size:24px;font-weight:bold;font-family:Arial,sans-serif;">Personalize Me Prints</span>
                  </td>
                </tr>
              </table>

              {{-- Body --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:30px 40px;font-family:Arial,sans-serif;">

                    <h1 style="margin:0 0 10px;font-size:22px;color:#0f0f0f;">Welcome, {{ $firstName }}! 👋</h1>
                    <p style="margin:0 0 20px;color:#888888;font-size:14px;line-height:1.6;">
                      Your email has been verified and your account is ready.
                      You can now browse our products and place orders.
                    </p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;border-radius:6px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <strong style="font-size:15px;color:#0f0f0f;">What you can do</strong><br><br>
                          <span style="font-size:14px;color:#888888;line-height:2;">
                            ✦ Browse and order custom printed products<br>
                            ✦ Track your order status in real time<br>
                            ✦ Get email updates on every order milestone
                          </span>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0;color:#888888;font-size:13px;line-height:1.6;">
                      Need help? Contact us at
                      <a href="mailto:personalizemeprints@gmail.com" style="color:#d4af37;text-decoration:none;">personalizemeprints@gmail.com</a>.
                    </p>

                  </td>
                </tr>
              </table>

              {{-- Footer --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
                <tr>
                  <td align="center" style="padding:20px;font-size:12px;color:#888888;font-family:Arial,sans-serif;">
                    © {{ date('Y') }} Personalize Me Prints.
                    All rights reserved.
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
