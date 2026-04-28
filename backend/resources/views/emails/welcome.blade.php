<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Personalize Me Prints</title>
</head>
<body style="margin:0;padding:0;background-color:#111111;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0"
          style="max-width:520px;background-color:#1a1a1a;border-radius:12px;
                 border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

          {{-- Header --}}
          <tr>
            <td style="background:linear-gradient(135deg,#b8922f,#d4a843);padding:28px 40px;text-align:center;">
              <div style="font-size:20px;font-weight:800;color:#0f0f0f;letter-spacing:1.5px;">
                PERSONALIZE ME PRINTS
              </div>
              <div style="margin-top:6px;font-size:11px;color:rgba(0,0,0,0.5);letter-spacing:2px;text-transform:uppercase;">
                Custom Print Shop
              </div>
            </td>
          </tr>

          {{-- Body --}}
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f5f5f5;">
                Welcome, {{ $firstName }}!
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#888;line-height:1.7;">
                Your email has been verified and your account is ready.
                You can now browse our products and place orders.
              </p>

              {{-- Feature list --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#222;border-radius:8px;border:1px solid rgba(255,255,255,0.07);">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#d4a843;
                               text-transform:uppercase;letter-spacing:1px;">
                      What you can do
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#aaa;line-height:1.6;">
                          &mdash;&nbsp; Browse and order custom printed products
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#aaa;line-height:1.6;">
                          &mdash;&nbsp; Track your order status in real time
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#aaa;line-height:1.6;">
                          &mdash;&nbsp; Get email updates on every order milestone
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color:#aaa;line-height:1.6;">
                          &mdash;&nbsp; Chat directly with our team for custom requests
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:#555;line-height:1.6;">
                Need help? Contact us at
                <a href="mailto:personalizemeprints@gmail.com"
                  style="color:#d4a843;text-decoration:none;">
                  personalizemeprints@gmail.com
                </a>.
              </p>
            </td>
          </tr>

          {{-- Footer --}}
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="margin:0;font-size:11px;color:#444;">
                &copy; {{ date('Y') }} Personalize Me Prints. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
