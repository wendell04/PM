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
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;text-align:justify;">
                Hi {{ $firstName }}, thank you for your order. @if($designFeeOnly && $balanceDue > 0.009)We have it, and your design is being worked on now.@else We've received it and will begin processing shortly.@endif
              </p>

              {{-- One card, receipt-shaped.
                   The paid and still-due figures used to hang off the end of the summary table in
                   their own shading, so they read as a stray strip below the card rather than part
                   of the bill. And the design fee was in the total but in no row, so the items came
                   to 1,000 under a total of 1,100 with nothing to explain the gap. --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#f7f7f5;border:1px solid #e5e3de;border-radius:10px;border-collapse:separate;border-spacing:0;">

                <tr>
                  <td colspan="2" style="padding:14px 18px 10px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">
                          Order Summary
                        </td>
                        <td align="right" style="font-size:13px;color:#a67c1a;font-family:monospace;font-weight:700;">
                          ORD-{{ strtoupper(substr($orderId, -8)) }}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                @foreach($items as $item)
                <tr>
                  <td align="left" style="padding:7px 18px;font-size:13px;color:#111111;line-height:1.5;">
                    {{ $item['productName'] ?? 'Item' }}
                    @if(!empty($item['variantName']))
                      <span style="color:#6b6b6b;">({{ $item['variantName'] }})</span>
                    @endif
                    <span style="color:#6b6b6b;">&times;{{ $item['qty'] }}</span>
                  </td>
                  <td align="right" style="padding:7px 18px;font-size:13px;color:#111111;white-space:nowrap;">
                    &#8369;{{ number_format($item['lineTotal'], 2) }}
                  </td>
                </tr>
                @endforeach

                @if($designFee > 0.009)
                <tr>
                  <td align="left" style="padding:7px 18px;font-size:13px;color:#111111;">Design fee</td>
                  <td align="right" style="padding:7px 18px;font-size:13px;color:#111111;white-space:nowrap;">
                    &#8369;{{ number_format($designFee, 2) }}
                  </td>
                </tr>
                @endif

                <tr>
                  <td align="left" style="padding:12px 18px 10px;border-top:1px solid #e5e3de;font-size:14px;font-weight:700;color:#111111;">
                    Order Total
                  </td>
                  <td align="right" style="padding:12px 18px 10px;border-top:1px solid #e5e3de;font-size:16px;font-weight:800;color:#111111;white-space:nowrap;">
                    &#8369;{{ number_format($totalAmount, 2) }}
                  </td>
                </tr>

                @if($amountPaid > 0.009)
                <tr>
                  <td align="left" style="padding:4px 18px;font-size:13px;color:#444444;">
                    {{ $designFeeOnly ? 'Design fee paid' : 'Paid' }}
                  </td>
                  <td align="right" style="padding:4px 18px;font-size:13px;font-weight:700;color:#1a7f3c;white-space:nowrap;">
                    &#8369;{{ number_format($amountPaid, 2) }}
                  </td>
                </tr>
                @endif

                @if($balanceDue > 0.009)
                <tr>
                  <td align="left" style="padding:4px 18px;font-size:13px;font-weight:700;color:#444444;">Still due</td>
                  <td align="right" style="padding:4px 18px;font-size:15px;font-weight:800;color:#111111;white-space:nowrap;">
                    &#8369;{{ number_format($balanceDue, 2) }}
                  </td>
                </tr>
                @endif

                @if($paymentLabel)
                <tr>
                  <td align="left" style="padding:10px 18px 14px;border-top:1px solid #e5e3de;font-size:12px;color:#6b6b6b;">
                    Payment status
                  </td>
                  <td align="right" style="padding:10px 18px 14px;border-top:1px solid #e5e3de;font-size:12px;font-weight:700;color:#111111;">
                    {{ $paymentLabel }}
                  </td>
                </tr>
                @endif
              </table>

              {{-- What happens next, worked out from the lines rather than from six templates that
                   would have to be kept in step with each other. Where the rest of the money goes
                   belongs in here too - it was floating outside the one block on the page that
                   answers the question it is answering. --}}
              @if($nextStep)
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:16px;background:#f7f7f5;border:1px solid #e5e3de;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <span style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">
                      What happens next
                    </span>
                    {{-- One paragraph. What we are doing and where the rest of the money goes are
                         the same thought, and splitting them made the second half look like a
                         separate notice. --}}
                    <p style="margin:6px 0 0;font-size:13px;color:#444444;line-height:1.7;text-align:justify;">
                      {{ $nextStep }}@if($designFeeOnly && $balanceDue > 0.009) The remaining &#8369;{{ number_format($balanceDue, 2) }} is paid from My Orders after you approve the proof, so you see the artwork before you pay for the goods.@endif
                    </p>
                    {{-- Shipping stays its own paragraph: it is a different subject, and it only
                         appears when the order actually mixes printed and stocked items. --}}
                    @if($mixedNote)
                    <p style="margin:8px 0 0;font-size:13px;color:#444444;line-height:1.7;text-align:justify;">{{ $mixedNote }}</p>
                    @endif
                  </td>
                </tr>
              </table>
              @endif

              {{-- The receipt is attached, not linked. A link lands in a browser with no session,
                   on a phone, and asks them to sign in to read what they just paid for. --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:12px 14px;background:#f7f7f5;border-radius:8px;">
                    <span style="font-size:13px;color:#444444;line-height:1.7;">
                      Your receipt is attached to this email as
                      <strong style="color:#111111;">{{ \App\Support\ReceiptPdf::filename($orderId) }}</strong>.
                      Save or print it any time, no sign-in needed.
                    </span>
                  </td>
                </tr>
              </table>

              @if($notes)
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:16px;background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);">
                <tr>
                  <td style="padding:14px 16px;">
                    <span style="font-size:11px;color: #6b6b6b;text-transform:uppercase;letter-spacing:1px;">
                      Order Notes
                    </span><br>
                    <span style="display:block;margin-top:4px;font-size:13px;color: #444444;line-height:1.7;text-align:justify;">{{ $notes }}</span>
                  </td>
                </tr>
              </table>
              @endif

              <p style="margin:24px 0 0;font-size:13px;color: #6b6b6b;line-height:1.7;">
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
