<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Delivery Fee</title>
  <style>
    /* One look everywhere. Clients that honour this stop recoloring the email in dark mode. */
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
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo-v2.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table></td>
          </tr>

          {{-- Body --}}
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color: #111111;">
                Your delivery fee is ready
              </p>
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Hi {{ $firstName }}, we have worked out the delivery for your order. Here is
                what the courier charges.
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
                      ORD-{{ strtoupper(substr($orderId, -8)) }}
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

              @if ($isCod)
                {{-- COD was chosen precisely to avoid paying online. Asking for the delivery fee by
                     GCash undoes that, so this says one number: what to hand the rider. --}}
                <table role="presentation" cellpadding="0" cellspacing="0"
                  style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(0,0,0,0.07);
                         margin-bottom:24px;width:100%;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <strong style="font-size:13px;color: #111111;">Have this ready for the rider</strong>
                      <p style="margin:6px 0 0;font-size:20px;font-weight:700;color: #a67c1a;">
                        &#8369;{{ number_format($onArrival, 2) }}
                      </p>
                      <p style="margin:6px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                        Your order and the delivery together - one payment covers both. If you would
                        rather send the delivery part ahead by GCash or Maya, message us in your
                        order chat and we will confirm it.
                      </p>
                    </td>
                  </tr>
                </table>
              @elseif(!($onDelivery ?? true))
              {{-- A parcel courier is prepaid at the branch, so there is no rider to hand
                   anything to. Offering that would leave the shop out of pocket for a delivery
                   it has already paid for. --}}
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color: #111111;">
                How to settle it
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(0,0,0,0.07);
                       margin-bottom:24px;width:100%;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                      This one goes out through a parcel courier rather than a booked rider, so it
                      cannot be paid at your door. Open the order in
                      <strong style="color:#111111;">My Orders</strong> and settle the
                      &#8369;{{ number_format($fee, 2) }} there - if your order still has a balance,
                      you can pay both together. We send it out once it clears.
                    </p>
                  </td>
                </tr>
              </table>
              @else
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
                    <strong style="font-size:13px;color: #111111;">Pay it in My Orders</strong>
                    <p style="margin:4px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                      Open the order and settle it by GCash, Maya or card. If the order still has a
                      balance, you can pay both in one go and there is nothing left for the rider.
                    </p>
                  </td>
                </tr>
              </table>
              @endif

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
