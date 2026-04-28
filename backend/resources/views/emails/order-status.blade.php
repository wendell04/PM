<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status Update</title>
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
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f5f5f5;">
                Order Status Update
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#888;line-height:1.7;">
                Hi {{ $firstName }}, your order status has been updated.
              </p>

              {{-- Order ID --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background:#222;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       border-left:3px solid #d4a843;margin-bottom:12px;width:100%;">
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">
                      Order ID
                    </span><br>
                    <strong style="font-size:15px;color:#d4a843;font-family:monospace;">
                      #{{ strtoupper(substr($orderId, -10)) }}
                    </strong>
                  </td>
                </tr>
              </table>

              {{-- New Status --}}
              @php
                $statusColors = [
                  'Pending'       => ['bg' => 'rgba(212,168,67,0.12)',  'border' => 'rgba(212,168,67,0.3)',  'color' => '#d4a843'],
                  'In Production' => ['bg' => 'rgba(59,130,246,0.12)',  'border' => 'rgba(59,130,246,0.3)',  'color' => '#60a5fa'],
                  'For Delivery'  => ['bg' => 'rgba(139,92,246,0.12)', 'border' => 'rgba(139,92,246,0.3)',  'color' => '#a78bfa'],
                  'Delivered'     => ['bg' => 'rgba(34,197,94,0.12)',   'border' => 'rgba(34,197,94,0.3)',   'color' => '#4ade80'],
                  'Returned'      => ['bg' => 'rgba(239,68,68,0.12)',   'border' => 'rgba(239,68,68,0.3)',   'color' => '#f87171'],
                  'Cancelled'     => ['bg' => 'rgba(239,68,68,0.12)',   'border' => 'rgba(239,68,68,0.3)',   'color' => '#f87171'],
                ];
                $sc = $statusColors[$newStatus] ?? ['bg' => 'rgba(212,168,67,0.12)', 'border' => 'rgba(212,168,67,0.3)', 'color' => '#d4a843'];
                $messages = [
                  'Pending'       => 'Your order is queued and awaiting confirmation.',
                  'In Production' => 'Your order is now being produced by our team.',
                  'For Delivery'  => 'Your order is on its way to you.',
                  'Delivered'     => 'Your order has been delivered. Thank you for choosing Personalize Me Prints.',
                  'Returned'      => 'Your order has been marked as returned. Please contact us for assistance.',
                  'Cancelled'     => 'Your order has been cancelled. Please contact us if you have questions.',
                ];
                $statusMessage = $messages[$newStatus] ?? 'Your order has been updated.';
              @endphp

              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background:{{ $sc['bg'] }};border-radius:8px;
                       border:1px solid {{ $sc['border'] }};margin-bottom:20px;width:100%;">
                <tr>
                  <td style="padding:14px 16px;">
                    <span style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">
                      Current Status
                    </span><br>
                    <strong style="font-size:16px;color:{{ $sc['color'] }};">
                      {{ $newStatus }}
                    </strong>
                    <p style="margin:6px 0 0;font-size:13px;color:#888;line-height:1.6;">
                      {{ $statusMessage }}
                    </p>
                  </td>
                </tr>
              </table>

              {{-- Order Total --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background:#222;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       margin-bottom:24px;width:100%;">
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;">
                      Order Total
                    </span><br>
                    <strong style="font-size:16px;color:#f5f5f5;">
                      &#8369;{{ number_format($totalAmount, 2) }}
                    </strong>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">
                Questions? Contact us at
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
