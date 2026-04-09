<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Order Received</title>
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
                    <span style="color:#d4af37;font-size:24px;font-weight:bold;font-family:Arial,sans-serif;">Personalize Me Prints — Admin</span>
                  </td>
                </tr>
              </table>

              {{-- Body --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:30px 40px;font-family:Arial,sans-serif;">

                    <h1 style="margin:0 0 10px;font-size:22px;color:#0f0f0f;">New Order Incoming! 🛒</h1>
                    <p style="margin:0 0 20px;color:#888888;font-size:14px;line-height:1.6;">
                      A customer just placed an order on the website.
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

                    {{-- Customer Info --}}
                    <h2 style="margin:24px 0 12px;font-size:16px;color:#0f0f0f;">Customer</h2>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9;border-radius:6px;">
                      <tr>
                        <td style="padding:12px 16px;border-bottom:1px solid #eeeeee;">
                          <span style="font-size:12px;color:#888888;">Name</span><br>
                          <strong style="font-size:14px;color:#0f0f0f;">{{ $customerName }}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 16px;border-bottom:1px solid #eeeeee;">
                          <span style="font-size:12px;color:#888888;">Email</span><br>
                          <strong style="font-size:14px;color:#0f0f0f;">{{ $customerEmail }}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 16px;">
                          <span style="font-size:12px;color:#888888;">Phone</span><br>
                          <strong style="font-size:14px;color:#0f0f0f;">{{ $customerPhone ?: '—' }}</strong>
                        </td>
                      </tr>
                    </table>

                    {{-- Order Items --}}
                    <h2 style="margin:24px 0 12px;font-size:16px;color:#0f0f0f;">Order Summary</h2>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <th align="left" style="padding:8px 0;border-bottom:2px solid #d4af37;font-size:12px;color:#888888;">Item</th>
                        <th align="center" style="padding:8px 0;border-bottom:2px solid #d4af37;font-size:12px;color:#888888;">Qty</th>
                        <th align="right" style="padding:8px 0;border-bottom:2px solid #d4af37;font-size:12px;color:#888888;">Total</th>
                      </tr>
                      @foreach($items as $item)
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#0f0f0f;">
                          {{ $item['productName'] }}
                          @if(!empty($item['variantName']))
                            <span style="color:#888888;">({{ $item['variantName'] }})</span>
                          @endif
                        </td>
                        <td align="center" style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#0f0f0f;">x{{ $item['qty'] }}</td>
                        <td align="right" style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#0f0f0f;">₱{{ number_format($item['lineTotal'], 2) }}</td>
                      </tr>
                      @endforeach
                      <tr>
                        <td colspan="2" align="right" style="padding:14px 0;font-size:16px;font-weight:bold;color:#0f0f0f;">Total</td>
                        <td align="right" style="padding:14px 0;font-size:16px;font-weight:bold;color:#d4af37;">₱{{ number_format($totalAmount, 2) }}</td>
                      </tr>
                    </table>

                    @if($notes)
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background-color:#f9f9f9;border-radius:6px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <strong style="font-size:13px;color:#0f0f0f;">Notes</strong><br>
                          <span style="font-size:13px;color:#888888;">{{ $notes }}</span>
                        </td>
                      </tr>
                    </table>
                    @endif

                  </td>
                </tr>
              </table>

              {{-- Footer --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
                <tr>
                  <td align="center" style="padding:20px;font-size:12px;color:#888888;font-family:Arial,sans-serif;">
                    © {{ date('Y') }} Personalize Me Prints.
                    This is an internal admin notification.
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
