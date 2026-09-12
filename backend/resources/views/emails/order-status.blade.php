<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status Update</title>
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
                 border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

          {{-- Header --}}
          <tr>
            <td style="background: #0f0f0f;padding:28px 40px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="https://personalizemeprints.com/logos/email-logo-v2.png" alt="Personalize Me Prints" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:50%;outline:none;text-decoration:none;"></td><td style="vertical-align:middle;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:1.6px;line-height:1.25;">PERSONALIZE <span style="color:#d4a843;">ME</span><br>PRINTS</div></td></tr></table></td>
          </tr>

          {{-- Body --}}
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color: #111111;">
                Order Status Update
              </p>
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Hi {{ $firstName }}, your order status has been updated.
              </p>

              {{-- Order ID --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
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

              {{-- New Status --}}
              @php
                $key = \App\Mail\OrderStatusMail::key($newStatus);
                $gold   = ['bg' => '#fdf6e3', 'border' => 'rgba(212,168,67,0.35)', 'color' => '#a67c1a'];
                $green  = ['bg' => '#f1f8f2', 'border' => 'rgba(21,128,61,0.25)',  'color' => '#15803d'];
                $red    = ['bg' => '#fdeceb', 'border' => 'rgba(185,28,28,0.25)',  'color' => '#b91c1c'];
                // One tone for every stage - the same box the delivery fee uses. Only the end
                // states differ, because good news and bad news should not look alike.
                $statusColors = [
                  'delivered' => $green,
                  'returned'  => $red,
                  'cancelled' => $red,
                ];
                $sc = $statusColors[$key] ?? $gold;
                $statusMessage = $headline;
              @endphp

              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background:{{ $sc['bg'] }};border-radius:8px;
                       border:1px solid {{ $sc['border'] }};margin-bottom:20px;width:100%;">
                <tr>
                  <td style="padding:14px 16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                      Current Status
                    </span><br>
                    <strong style="font-size:16px;color:{{ $sc['color'] }};">
                      {{ $statusLabel }}
                    </strong>
                    <p style="margin:6px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                      {{ $statusMessage }}
                    </p>
                  </td>
                </tr>
              </table>

              {{-- Order Total --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       margin-bottom:24px;width:100%;">
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                      Order Total
                    </span><br>
                    <strong style="font-size:16px;color: #111111;">
                      &#8369;{{ number_format($totalAmount, 2) }}
                    </strong>
                  </td>
                </tr>
              </table>

              @if ($feeNote)
                <table role="presentation" cellpadding="0" cellspacing="0"
                  style="background: #fdf6e3;border-radius:8px;border:1px solid rgba(212,168,67,0.35);
                         margin-bottom:20px;width:100%;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                        Delivery fee
                      </span>
                      <p style="margin:6px 0 0;font-size:13px;color: #111111;line-height:1.6;">
                        {{ $feeNote }}
                      </p>
                    </td>
                  </tr>
                </table>
              @endif

              @if ($courierName || $trackingNumber || $trackingUrl)
                <table role="presentation" cellpadding="0" cellspacing="0"
                  style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(0,0,0,0.08);
                         margin-bottom:20px;width:100%;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                        Delivery
                      </span>
                      @if ($courierName)
                        <p style="margin:6px 0 0;font-size:14px;color: #111111;">
                          Courier: <strong>{{ $courierName }}</strong>
                        </p>
                      @endif
                      @if ($trackingNumber)
                        <p style="margin:4px 0 0;font-size:14px;color: #111111;">
                          Tracking #: <strong style="font-family:monospace;">{{ $trackingNumber }}</strong>
                        </p>
                      @endif
                      @if ($trackingUrl)
                        <p style="margin:8px 0 0;font-size:13px;">
                          <a href="{{ $trackingUrl }}" style="color: #a67c1a;text-decoration:none;font-weight:700;">
                            Track your delivery
                          </a>
                        </p>
                      @endif
                    </td>
                  </tr>
                </table>
              @endif

              @if ($orderUrl)
                <p style="margin:0 0 16px;font-size:13px;">
                  <a href="{{ $orderUrl }}" style="color: #a67c1a;text-decoration:none;font-weight:700;">
                    Open this order in My Orders
                  </a>
                </p>
              @endif

              <p style="margin:0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                Questions? Contact us at
                <a href="mailto:{{ $contactEmail }}"
                  style="color: #a67c1a;text-decoration:none;">
                  {{ $contactEmail }}
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
