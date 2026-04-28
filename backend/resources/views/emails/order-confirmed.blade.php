<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#111111;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="max-width:560px;background-color:#1a1a1a;border-radius:12px;
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
                Order Confirmed
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#888;line-height:1.7;">
                Hi {{ $customerName }}, your order has been confirmed by our team.
                We are now preparing it for production.
              </p>

              {{-- Order Summary Box --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#222;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       margin-bottom:20px;border-collapse:separate;border-spacing:0;">
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.07);">
                    <span style="font-size:11px;font-weight:700;color:#d4a843;
                                 text-transform:uppercase;letter-spacing:1px;">
                      Order Summary
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#555;width:45%;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Order ID
                        </td>
                        <td align="right" style="padding:5px 0;font-size:13px;color:#f5f5f5;
                                                  font-weight:600;font-family:monospace;">
                          #{{ $orderId }}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#555;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Product
                        </td>
                        <td align="right" style="padding:5px 0;font-size:13px;color:#f5f5f5;
                                                  font-weight:600;">
                          {{ $productName }}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#555;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Quantity
                        </td>
                        <td align="right" style="padding:5px 0;font-size:13px;color:#f5f5f5;
                                                  font-weight:600;">
                          {{ $quantity }} pcs
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#555;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Amount
                        </td>
                        <td align="right" style="padding:5px 0;font-size:16px;color:#d4a843;
                                                  font-weight:700;">
                          &#8369;{{ number_format($suggestedPrice, 2) }}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color:#555;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Status
                        </td>
                        <td align="right" style="padding:5px 0;">
                          <span style="display:inline-block;background:rgba(34,197,94,0.12);
                                       border:1px solid rgba(34,197,94,0.3);border-radius:20px;
                                       padding:3px 10px;font-size:11px;color:#4ade80;
                                       font-weight:700;letter-spacing:0.5px;">
                            Confirmed
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              {{-- Next Steps --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:rgba(212,168,67,0.06);border-radius:8px;
                       border:1px solid rgba(212,168,67,0.2);margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#d4a843;
                               text-transform:uppercase;letter-spacing:1px;">
                      Next Steps
                    </p>
                    <p style="margin:0;font-size:13px;color:rgba(212,168,67,0.8);line-height:1.6;">
                      Your order is now in production. We will notify you when it is ready for
                      pickup or delivery.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">
                Questions? Contact us at
                <a href="mailto:{{ config('mail.from.address') }}"
                  style="color:#d4a843;text-decoration:none;">
                  {{ config('mail.from.address') }}
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
