<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=560">
  <title>Payment Received</title>
  <style>
    /* One look everywhere. Clients that honour this stop recoloring the email in dark mode. */
    :root { color-scheme: light only; supported-color-schemes: light only; }
  </style>
</head>
{{-- Laid out like Order Received (same card, rows and boxes), so the two read as one set: the
     first payment gets that one, every payment after it gets this one. --}}
@php
  $methodName = ['gcash' => 'GCash', 'paymaya' => 'Maya', 'maya' => 'Maya', 'card' => 'Card', 'cod' => 'Cash on delivery', 'cash' => 'Cash', 'manual' => 'Recorded by the shop'][strtolower($method)] ?? ucfirst($method);
  $orderTotal = round($paidTotal + $balance, 2);
  $owing      = $balance > 0.009;
@endphp
<body style="margin:0;padding:0;background-color: #ffffff;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0"
          style="width:520px;min-width:520px;max-width:520px;background-color: #ffffff;border-radius:12px;
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
                Payment Received
              </p>
              <p style="margin:0 0 24px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Hi {{ $firstName }}, we received your payment for order ORD-{{ $orderRef }}. Thank you.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#f7f7f5;border:1px solid #e5e3de;border-radius:10px;border-collapse:separate;border-spacing:0;">

                <tr>
                  <td colspan="2" style="padding:14px 18px 10px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">
                          Payment Summary
                        </td>
                        <td align="right" style="font-size:13px;color:#a67c1a;font-family:monospace;font-weight:700;">
                          ORD-{{ $orderRef }}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="left" style="padding:7px 18px;font-size:13px;font-weight:700;color:#111111;">This payment</td>
                  <td align="right" style="padding:7px 18px;font-size:15px;font-weight:800;color:#111111;white-space:nowrap;">
                    &#8369;{{ number_format($amount, 2) }}
                  </td>
                </tr>
                @if ($deliveryIncluded > 0.009)
                <tr>
                  <td align="left" style="padding:4px 18px;font-size:13px;color:#6b6b6b;">Includes delivery fee</td>
                  <td align="right" style="padding:4px 18px;font-size:13px;color:#6b6b6b;white-space:nowrap;">
                    &#8369;{{ number_format($deliveryIncluded, 2) }}
                  </td>
                </tr>
                @endif
                <tr>
                  <td align="left" style="padding:4px 18px 10px;font-size:13px;color:#6b6b6b;">Method</td>
                  <td align="right" style="padding:4px 18px 10px;font-size:13px;color:#111111;white-space:nowrap;">{{ $methodName }}</td>
                </tr>
                @if ($reference)
                <tr>
                  <td align="left" style="padding:0 18px 10px;font-size:13px;color:#6b6b6b;">Reference</td>
                  <td align="right" style="padding:0 18px 10px;font-size:12px;color:#111111;font-family:monospace;">{{ $reference }}</td>
                </tr>
                @endif

                <tr>
                  <td align="left" style="padding:12px 18px 10px;border-top:1px solid #e5e3de;font-size:14px;font-weight:700;color:#111111;">
                    Order Total
                  </td>
                  <td align="right" style="padding:12px 18px 10px;border-top:1px solid #e5e3de;font-size:16px;font-weight:800;color:#111111;white-space:nowrap;">
                    &#8369;{{ number_format($orderTotal, 2) }}
                  </td>
                </tr>
                <tr>
                  <td align="left" style="padding:4px 18px;font-size:13px;color:#444444;">Paid so far</td>
                  <td align="right" style="padding:4px 18px;font-size:13px;font-weight:700;color:#1a7f3c;white-space:nowrap;">
                    &#8369;{{ number_format($paidTotal, 2) }}
                  </td>
                </tr>
                @if ($owing)
                <tr>
                  <td align="left" style="padding:4px 18px;font-size:13px;font-weight:700;color:#444444;">Still due</td>
                  <td align="right" style="padding:4px 18px;font-size:15px;font-weight:800;color:#111111;white-space:nowrap;">
                    &#8369;{{ number_format($balance, 2) }}
                  </td>
                </tr>
                @endif

                <tr>
                  <td align="left" style="padding:10px 18px 14px;border-top:1px solid #e5e3de;font-size:12px;color:#6b6b6b;">
                    Payment status
                  </td>
                  <td align="right" style="padding:10px 18px 14px;border-top:1px solid #e5e3de;font-size:12px;font-weight:700;color:#111111;">
                    {{ $owing ? 'Partly paid' : 'Fully paid' }}
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:16px;background:#f7f7f5;border:1px solid #e5e3de;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <span style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">
                      What happens next
                    </span>
                    <p style="margin:6px 0 0;font-size:13px;color:#444444;line-height:1.7;">
                      @if ($owing)
                        There is still &#8369;{{ number_format($balance, 2) }} left on this order.{{ $payUrl !== '' ? ' Pay it below whenever you are ready - no sign-in needed.' : ' You can settle it any time from My Orders.' }}
                      @else
                        This order is fully paid - nothing further is owed. We will let you know as it moves.
                      @endif
                      @if ($deliveryIncluded > 0.009)
                        The delivery fee is settled too, so there is nothing to hand the rider.
                      @endif
                    </p>
                  </td>
                </tr>
              </table>

              @if ($payUrl !== '')
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                  <tr>
                    <td style="border-radius:8px;background: #D4A843;">
                      <a href="{{ $payUrl }}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color: #1a1a1a;text-decoration:none;border-radius:8px;">
                        Pay the &#8369;{{ number_format($balance, 2) }} balance
                      </a>
                    </td>
                  </tr>
                </table>
              @endif

              {{-- Said only when the PDF really is on the mail. --}}
              @if ($hasReceipt)
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:12px 14px;background:#f7f7f5;border-radius:8px;">
                    <span style="font-size:13px;color:#444444;line-height:1.7;">
                      Your updated receipt is attached to this email as
                      <strong style="color:#111111;">{{ \App\Support\ReceiptPdf::filename($orderId) }}</strong>.
                    </span>
                  </td>
                </tr>
              </table>
              @endif

              <p style="margin:24px 0 0;font-size:13px;color: #6b6b6b;line-height:1.7;">
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
              @include('emails.partials.safety-notice')
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
