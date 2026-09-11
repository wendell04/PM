<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Proof Is Ready</title>
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
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo-v2.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table></td>
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
                        @if ($orderUrl)<a href="{{ $orderUrl }}" style="text-decoration:none;">@endif
                        <img src="{{ $p }}" alt="Proof" width="150"
                          style="display:block;width:150px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);">
                        @if ($orderUrl)</a>@endif
                      </td>
                    @endforeach
                  </tr>
                </table>
                <p style="margin:0 0 18px;font-size:12px;color: #6b6b6b;line-height:1.6;">
                  These previews are watermarked. The printed piece is not.
                  @if ($hasVideo && $orderUrl)
                    This proof is a video - the watermarked clip is attached, or tap the preview to
                    play it in your order.
                  @elseif ($orderUrl)
                    Tap the preview to open your order.
                  @endif
                </p>
              @endif

              {{-- No button. The one that was here rendered black text on a black cell, so it
                   read as an empty bar. Approval happens on the site, and saying where - and what
                   comes after - is what the customer actually needs from this mail. --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin:0 0 20px;background:#f7f7f5;border-radius:8px;border:1px solid rgba(0,0,0,0.07);">
                <tr>
                  <td style="padding:14px 16px;text-align:justify;" align="justify">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;text-align:left;">
                      How to approve
                    </p>
                    <p style="margin:0;font-size:13px;color:#444444;line-height:1.7;text-align:justify;">
                      Sign in at <strong style="color:#111111;">personalizemeprints.com</strong>, open
                      <strong style="color:#111111;">My Orders</strong>, and choose order
                      <strong style="color:#111111;">{{ $orderRef }}</strong>. You can approve the
                      proof there or in your order chat.
                      @if ($balanceAfter > 0)
                        <strong style="color:#111111;">Once you approve, the remaining
                        &#8369;{{ number_format($balanceAfter, 2) }} is paid from the same page</strong>,
                        and production starts as soon as it clears.
                      @else
                        <strong style="color:#111111;">Once you approve, we start production.</strong>
                      @endif
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 18px;font-size:14px;color: #444444;line-height:1.65;">
                If something is off, ask for changes in the order chat and we will redraw it.
              </p>

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
