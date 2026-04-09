<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order Status Update</title>
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

                    <h1 style="margin:0 0 10px;font-size:22px;color:#0f0f0f;">Order Update</h1>
                    <p style="margin:0 0 20px;color:#888888;font-size:14px;line-height:1.6;">
                      Hi {{ $firstName }}, your order status has been updated.
                    </p>

                    {{-- Order ID --}}
                    <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;border-radius:6px;border-left:4px solid #d4af37;">
                      <tr>
                        <td style="padding:12px 16px;">
                          <span style="font-size:12px;color:#888888;">Order ID</span><br>
                          <strong style="font-size:16px;color:#0f0f0f;">{{ $orderId }}</strong>
                        </td>
                      </tr>
                    </table>

                    {{-- New Status --}}
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;background-color:#f5f5f5;border-radius:6px;border-left:4px solid #d4af37;">
                      <tr>
                        <td style="padding:12px 16px;">
                          <span style="font-size:12px;color:#888888;">Current Status</span><br>
                          <strong style="font-size:16px;color:#d4af37;">{{ $newStatus }}</strong>
                        </td>
                      </tr>
                    </table>

                    {{-- Status message --}}
                    @php
                      $messages = [
                        'Pending'       => 'Your order is queued and awaiting confirmation.',
                        'In Production' => 'Great news! Your order is now being produced by our team.',
                        'For Delivery'  => 'Your order is on its way to you!',
                        'Delivered'     => 'Your order has been delivered. Thank you for choosing us!',
                        'Returned'      => 'Your order has been marked as returned. Please contact us for assistance.',
                        'Cancelled'     => 'Your order has been cancelled. Contact us if you have questions.',
                      ];
                      $message = $messages[$newStatus] ?? 'Your order has been updated.';
                    @endphp
                    <p style="margin:16px 0 0;color:#888888;font-size:14px;line-height:1.6;">{{ $message }}</p>

                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;background-color:#f5f5f5;border-radius:6px;">
                      <tr>
                        <td style="padding:12px 16px;">
                          <span style="font-size:12px;color:#888888;">Order Total</span><br>
                          <strong style="font-size:16px;color:#0f0f0f;">₱{{ number_format($totalAmount, 2) }}</strong>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0;color:#888888;font-size:13px;line-height:1.6;">
                      Questions? Contact us at
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
