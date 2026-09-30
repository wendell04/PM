<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Balance due</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light only; }
  </style>
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
            <td style="background: #0f0f0f;padding:28px 40px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo-v3.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table></td>
          </tr>

          {{-- Body --}}
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color: #111111;">
                Your order is ready
              </p>
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Hi {{ $firstName }}, your order is finished and checked. Settle the remaining balance
                and we send it out.
              </p>

              {{-- Order --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(0,0,0,0.07);
                       border-left: 3px solid #d4a843;margin-bottom:12px;width:100%;">
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">Order</span><br>
                    <strong style="font-size:15px;color: #a67c1a;font-family:monospace;">{{ $orderRef }}</strong>
                  </td>
                </tr>
              </table>

              {{-- The number --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background:rgba(212,168,67,0.10);border-radius:8px;
                       border:1px solid rgba(212,168,67,0.32);margin-bottom:20px;width:100%;">
                <tr>
                  <td style="padding:16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">Balance due</span><br>
                    <strong style="font-size:24px;color: #a67c1a;">&#8369;{{ number_format($balance, 2) }}</strong>
                    <p style="margin:8px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                      Order total &#8369;{{ number_format($total, 2) }} - already paid &#8369;{{ number_format($paid, 2) }}.
                    </p>
                  </td>
                </tr>
              </table>

              @php($primary = $payUrl !== '' ? $payUrl : $orderUrl)
              @if ($primary !== '')
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">
                <tr>
                  <td align="center" style="background:#d4a843;border-radius:8px;">
                    <a href="{{ $primary }}" style="display:block;padding:14px 20px;font-size:15px;font-weight:700;color:#111111;text-decoration:none;border-radius:8px;">
                      {{ $payUrl !== '' ? 'Pay ₱' . number_format($balance, 2) . ' now' : 'Pay the balance in My Orders' }}
                    </a>
                  </td>
                </tr>
              </table>
              @if ($payUrl !== '')
              <p style="margin:0 0 20px;font-size:12px;color:#6b6b6b;line-height:1.6;text-align:center;">
                No sign-in needed. The link works for order {{ $orderRef }} only, for 14 days.
                @if ($orderUrl !== '') Or <a href="{{ $orderUrl }}" style="color:#a67c1a;text-decoration:none;">open it in My Orders</a>.@endif
              </p>
              @endif
              @endif

              <p style="margin:0 0 6px;font-size:13px;color: #6b6b6b;line-height:1.6;">
                GCash, Maya or card. Once it clears, the order is released for delivery - you do not
                need to message us.
              </p>
              <p style="margin:0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                Questions? Reply in your order chat, or email us at
                <a href="mailto:personalizemeprints@gmail.com" style="color: #a67c1a;text-decoration:none;">personalizemeprints@gmail.com</a>.
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
