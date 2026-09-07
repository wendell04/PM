<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Personalize Me Prints</title>
</head>
<body style="margin:0;padding:0;background-color: #ffffff;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0"
          style="max-width:520px;background-color: #ffffff;border-radius:12px;
                 border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

          {{-- Header --}}
          <tr>
            <td style="background: #0f0f0f;padding:28px 40px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table></td>
          </tr>

          {{-- Body --}}
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:700;color: #111111;">
                Welcome, {{ $firstName }}!
              </p>
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Your email has been verified and your account is ready.
                You can now browse our products and place orders.
              </p>

              {{-- Feature list --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color: #a67c1a;
                               text-transform:uppercase;letter-spacing:1px;">
                      What you can do
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color: #444444;line-height:1.6;">
                          &mdash;&nbsp; Browse and order custom printed products
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color: #444444;line-height:1.6;">
                          &mdash;&nbsp; Track your order status in real time
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color: #444444;line-height:1.6;">
                          &mdash;&nbsp; Get email updates on every order milestone
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:13px;color: #444444;line-height:1.6;">
                          &mdash;&nbsp; Chat directly with our team for custom requests
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                Need help? Contact us at
                <a href="mailto:personalizemeprints@gmail.com"
                  style="color: #a67c1a;text-decoration:none;">
                  personalizemeprints@gmail.com
                </a>.
              </p>
            </td>
          </tr>

          {{-- Footer --}}
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="margin:0;font-size:11px;color: #444444;">
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
