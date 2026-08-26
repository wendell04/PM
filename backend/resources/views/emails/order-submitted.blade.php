<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Request Received</title>
</head>
<body style="margin:0;padding:0;background-color: #ffffff;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="580" cellpadding="0" cellspacing="0"
          style="max-width:580px;background-color: #ffffff;border-radius:12px;
                 border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

          {{-- Header --}}
          <tr>
            <td style="background:linear-gradient(135deg,#b8922f,#d4a843);padding:28px 40px;text-align:center;">
              <img src="https://res.cloudinary.com/dtwzbqrdy/image/upload/v1787227737/pmp-email-logo.png" alt="Personalize Me Prints" width="56" height="56" style="display:block;margin:0 auto 10px;width:56px;height:56px;border:0;outline:none;text-decoration:none;">
              <div style="font-size:20px;font-weight:800;color: #0f0f0f;letter-spacing:1.5px;">
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
              <p style="margin:0 0 6px;font-size:20px;font-weight:700;color: #111111;">
                Order Request Received
              </p>
              <p style="margin:0 0 28px;font-size:14px;color: #6b6b6b;line-height:1.7;">
                Hi {{ $customerName }}, we have received your order request and our team is reviewing it.
                We will get back to you with a confirmation and final pricing shortly.
              </p>

              {{-- Order Details --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background: #f7f7f5;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       margin-bottom:20px;border-collapse:separate;border-spacing:0;">
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.07);">
                    <span style="font-size:11px;font-weight:700;color: #a67c1a;
                                 text-transform:uppercase;letter-spacing:1px;">
                      Request Details
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color: #6b6b6b;width:40%;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Request ID
                        </td>
                        <td align="right" style="padding:5px 0;font-size:13px;color: #111111;
                                                  font-weight:600;font-family:monospace;">
                          #{{ strtoupper(substr($orderId, -8)) }}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color: #6b6b6b;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Product
                        </td>
                        <td align="right" style="padding:5px 0;font-size:13px;color: #111111;
                                                  font-weight:600;">
                          {{ $productName }}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color: #6b6b6b;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Quantity
                        </td>
                        <td align="right" style="padding:5px 0;font-size:13px;color: #111111;
                                                  font-weight:600;">
                          {{ $quantity }} pcs
                        </td>
                      </tr>
                      @if($suggestedPrice > 0)
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color: #6b6b6b;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Estimated Price
                        </td>
                        <td align="right" style="padding:5px 0;font-size:15px;color: #a67c1a;
                                                  font-weight:700;">
                          &#8369;{{ number_format($suggestedPrice, 2) }}
                        </td>
                      </tr>
                      @endif
                      <tr>
                        <td style="padding:5px 0;font-size:12px;color: #6b6b6b;
                                   text-transform:uppercase;letter-spacing:0.5px;">
                          Status
                        </td>
                        <td align="right" style="padding:5px 0;">
                          <span style="display:inline-block;background:rgba(212,168,67,0.12);
                                       border:1px solid rgba(212,168,67,0.3);border-radius:20px;
                                       padding:3px 10px;font-size:11px;color: #a67c1a;
                                       font-weight:700;letter-spacing:0.5px;">
                            Pending Review
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              {{-- What happens next --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:rgba(212,168,67,0.06);border-radius:8px;
                       border:1px solid rgba(212,168,67,0.2);margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:700;color: #a67c1a;
                               text-transform:uppercase;letter-spacing:1px;">
                      What Happens Next
                    </p>
                    <p style="margin:0;font-size:13px;color:rgba(212,168,67,0.8);line-height:1.6;">
                      Our team will review your request and reach out with a confirmation and
                      final pricing. If you have a design file ready, you can send it via
                      chat support on the website.
                    </p>
                  </td>
                </tr>
              </table>

              {{-- CTA --}}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="{{ config('app.frontend_url') }}/shop/profile"
                      style="display:inline-block;background:linear-gradient(135deg,#d4a843,#c4963a);
                             color: #0f0f0f;font-weight:700;font-size:13px;text-decoration:none;
                             padding:12px 28px;border-radius:8px;letter-spacing:0.5px;">
                      View My Orders
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color: #6b6b6b;line-height:1.6;">
                Questions? Contact us at
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
              <p style="margin:0 0 4px;font-size:11px;color: #444444;">
                You received this because you placed an order request on Personalize Me Prints.
              </p>
              <p style="margin:0;font-size:11px;color: #333;">
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
