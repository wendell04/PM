<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Delivery Fee</title>
</head>
<body style="margin:0;padding:0;background-color: #ffffff;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0"
          style="max-width:520px;background-color: #ffffff;border-radius:12px;
                 border:1px solid rgba(0,0,0,0.07);overflow:hidden;">

          {{-- Header --}}
          <tr>
            <td style="background:linear-gradient(135deg,#b8922f,#d4a843);padding:28px 40px;text-align:center;">
              <img src="https://res.cloudinary.com/dtwzbqrdy/image/upload/v1787227737/pmp-email-logo.png" alt="Personalize Me Prints" width="56" height="56" style="display:block;margin:0 auto 10px;width:56px;height:56px;border:0;outline:none;text-decoration:none;">
              <div style="font-size:20px;font-weight:800;color: #0f0f0f;letter-spacing:1.5px;">
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
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color: #111111;">
                Your delivery fee is ready
              </p>
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Hi {{ $firstName }}, we have booked a courier for your order. Here is what the
                delivery costs.
              </p>

              {{-- Order ID --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(0,0,0,0.07);
                       border-left: 3px solid #d4a843;margin-bottom:12px;width:100%;">
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                      Order ID
                    </span><br>
                    <strong style="font-size:15px;color: #a67c1a;font-family:monospace;">
                      #{{ strtoupper(substr($orderId, -10)) }}
                    </strong>
                  </td>
                </tr>
              </table>

              {{-- The number --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background:rgba(212,168,67,0.10);border-radius:8px;
                       border:1px solid rgba(212,168,67,0.32);margin-bottom:20px;width:100%;">
                <tr>
                  <td style="padding:16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                      Delivery fee
                    </span><br>
                    <strong style="font-size:24px;color: #a67c1a;">
                      &#8369;{{ number_format($fee, 2) }}
                    </strong>
                    <p style="margin:8px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                      This is the courier's charge. It is separate from the
                      &#8369;{{ number_format($itemTotal, 2) }} for your items.
                    </p>
                  </td>
                </tr>
              </table>

              {{-- The two ways to settle it. Stated plainly, because one of them needs doing
                   before the rider arrives and the other does not. --}}
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color: #111111;">
                Two ways to pay it
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(0,0,0,0.07);
                       margin-bottom:24px;width:100%;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
                    <strong style="font-size:13px;color: #111111;">Cash to the rider</strong>
                    <p style="margin:4px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                      Have &#8369;{{ number_format($fee, 2) }} ready when your order arrives.
                      Nothing to do now.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;">
                    <strong style="font-size:13px;color: #111111;">Send it ahead</strong>
                    <p style="margin:4px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                      Send it by GCash or Maya and reply in the chat so we can confirm it.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                Questions? Reply in your order chat, or email us at
                <a href="mailto:personalizemeprints@gmail.com"
                  style="color: #a67c1a;text-decoration:none;">
                  personalizemeprints@gmail.com
                </a>.
              </p>
            </td>
          </tr>

          {{-- Footer --}}
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(0,0,0,0.06);text-align:center;">
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
