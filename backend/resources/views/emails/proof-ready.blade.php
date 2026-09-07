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
            <td style="background: #0f0f0f;padding:28px 40px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table></td>
          </tr>
          {{-- Body --}}
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 14px;font-size:15px;color: #0f0f0f;">Hi {{ $firstName }},</p>
              <p style="margin:0 0 18px;font-size:14px;color: #444444;line-height:1.65;">
                Your proof for order <strong>{{ $orderRef }}</strong> is ready. Nothing is printed
                until you approve it, so the order is waiting on you.
              </p>

              @if (count($proofs))
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                  <tr>
                    @foreach ($proofs as $p)
                      <td style="padding-right:8px;">
                        <img src="{{ $p }}" alt="Proof" width="150"
                          style="display:block;width:150px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);">
                      </td>
                    @endforeach
                  </tr>
                </table>
                <p style="margin:0 0 18px;font-size:12px;color: #6b6b6b;line-height:1.6;">
                  These previews are watermarked. The printed piece is not.
                </p>
              @endif

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="background: #0f0f0f;border-radius:8px;">
                    <a href="https://personalizemeprints.com/shop/orders-history"
                      style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color: #0f0f0f;text-decoration:none;">
                      Review the proof
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 18px;font-size:14px;color: #444444;line-height:1.65;">
                If something is off, ask for changes in the order chat and we will redraw it. If it
                is right, approving it starts production.
              </p>
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
