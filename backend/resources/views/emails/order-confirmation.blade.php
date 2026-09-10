<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Received</title>
</head>
<body style="margin:0;padding:0;background-color: #ffffff;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="max-width:600px;background-color: #ffffff;border-radius:12px;
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
                Order Received
              </p>
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Hi {{ $firstName }}, thank you for your order. @if($designFeeOnly && $balanceDue > 0.009)We have it, and your design is being worked on now.@else We've received it and will begin processing shortly.@endif
              </p>

              {{-- Order ID --}}
              <table role="presentation" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       border-left: 3px solid #d4a843;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">Order ID</span><br>
                    <strong style="font-size:15px;color: #a67c1a;font-family:monospace;">
                      ORD-{{ strtoupper(substr($orderId, -8)) }}
                    </strong>
                  </td>
                </tr>
              </table>

              {{-- Items Table --}}
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;color: #a67c1a;
                         text-transform:uppercase;letter-spacing:1px;">
                Order Summary
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       border-collapse:separate;border-spacing:0;">
                <tr>
                  <th align="left"
                    style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.07);
                           font-size:11px;color: #6b6b6b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                    Item
                  </th>
                  <th align="center"
                    style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.07);
                           font-size:11px;color: #6b6b6b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                    Qty
                  </th>
                  <th align="right"
                    style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.07);
                           font-size:11px;color: #6b6b6b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                    Total
                  </th>
                </tr>
                @foreach($items as $item)
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                             font-size:13px;color: #111111;">
                    {{ $item['productName'] }}
                    @if(!empty($item['variantName']))
                      <span style="color: #6b6b6b;">&nbsp;({{ $item['variantName'] }})</span>
                    @endif
                  </td>
                  <td align="center"
                    style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.05);
                           font-size:13px;color: #444444;">
                    x{{ $item['qty'] }}
                  </td>
                  <td align="right"
                    style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                           font-size:13px;color: #111111;">
                    &#8369;{{ number_format($item['lineTotal'], 2) }}
                  </td>
                </tr>
                @endforeach
                <tr>
                  <td colspan="2" align="right"
                    style="padding:12px 8px;font-size:13px;font-weight:600;color: #444444;">
                    Order Total
                  </td>
                  <td align="right"
                    style="padding:12px 16px;font-size:16px;font-weight:700;color: #a67c1a;">
                    &#8369;{{ number_format($totalAmount, 2) }}
                  </td>
                </tr>
                {{-- Paid and still due. One figure on its own read as settled, on an order where a
                     hundred pesos had been collected and a thousand had not. --}}
                @if($amountPaid > 0)
                <tr>
                  <td colspan="2" align="right"
                    style="padding:6px 8px;border-top:1px solid rgba(0,0,0,0.06);font-size:13px;color: #444444;">
                    {{ $designFeeOnly ? 'Design fee paid' : 'Paid' }}
                  </td>
                  <td align="right"
                    style="padding:6px 16px;border-top:1px solid rgba(0,0,0,0.06);font-size:13px;color: #1a7f3c;font-weight:600;">
                    &#8369;{{ number_format($amountPaid, 2) }}
                  </td>
                </tr>
                @endif
                @if($balanceDue > 0.009)
                <tr>
                  <td colspan="2" align="right"
                    style="padding:6px 8px 12px;font-size:13px;font-weight:700;color: #444444;">
                    Still due
                  </td>
                  <td align="right"
                    style="padding:6px 16px 12px;font-size:15px;font-weight:800;color: #b45309;">
                    &#8369;{{ number_format($balanceDue, 2) }}
                  </td>
                </tr>
                @endif
              </table>

              @if($designFeeOnly && $balanceDue > 0.009)
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:16px;background:#fff8e1;border:1px solid #f0d9a0;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;color:#5b4708;line-height:1.65;">
                    <strong style="color:#7a5c05;">This is not paid in full yet, and that is on purpose.</strong><br>
                    You have paid the design fee. Our designer is working on your proof - we will
                    send it in chat and it also appears in My Orders, waiting for you to approve it.
                    The remaining &#8369;{{ number_format($balanceDue, 2) }} is paid from My Orders
                    after you approve, so you see the artwork before you pay for the goods.
                  </td>
                </tr>
              </table>
              @endif

              @if($notes)
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:16px;background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);">
                <tr>
                  <td style="padding:14px 16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                      Order Notes
                    </span><br>
                    <span style="font-size:13px;color: #444444;line-height:1.6;">{{ $notes }}</span>
                  </td>
                </tr>
              </table>
              @endif

              <p style="margin:24px 0 0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                We will notify you as your order progresses.
                For questions, contact us at
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
