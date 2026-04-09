<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We received your order request!</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#0f0f0f;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="max-width:600px;background-color:#161616;border-radius:16px;
                 border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a1a 0%,#111 100%);
                       padding:32px 40px;text-align:center;
                       border-bottom:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;">
                <span style="color:#d4a843;">Personalize</span><span style="color:#f5f5f5;">Me</span>
              </div>
              <div style="margin-top:8px;font-size:12px;color:#666;
                          letter-spacing:2px;text-transform:uppercase;">
                Custom Print Shop
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <!-- Greeting -->
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f5f5f5;">
                Hi {{ $customerName }},
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#888;line-height:1.6;">
                We've received your order request and our team is reviewing it now.
                We'll get back to you with a confirmation and final pricing shortly.
              </p>

              <!-- Order Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#1a1a1a;border-radius:12px;
                       border:1px solid rgba(255,255,255,0.07);
                       margin-bottom:28px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;
                             border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="font-size:11px;color:#555;text-transform:uppercase;
                                 letter-spacing:1px;font-weight:600;">
                      Order Request Details
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666;width:40%;">
                          Request ID
                        </td>
                        <td style="padding:6px 0;font-size:13px;
                                   color:#f5f5f5;font-weight:600;
                                   font-family:monospace;">
                          #{{ strtoupper(substr($orderId, -8)) }}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666;">
                          Product
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#f5f5f5;
                                   font-weight:600;">
                          {{ $productName }}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666;">
                          Quantity
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#f5f5f5;
                                   font-weight:600;">
                          {{ $quantity }} pcs
                        </td>
                      </tr>
                      @if($suggestedPrice > 0)
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666;">
                          Estimated Price
                        </td>
                        <td style="padding:6px 0;font-size:15px;
                                   color:#d4a843;font-weight:700;">
                          ₱{{ number_format($suggestedPrice, 2) }}
                        </td>
                      </tr>
                      @endif
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666;">
                          Status
                        </td>
                        <td style="padding:6px 0;">
                          <span style="display:inline-block;
                                       background:rgba(212,168,67,0.12);
                                       border:1px solid rgba(212,168,67,0.3);
                                       border-radius:20px;padding:3px 10px;
                                       font-size:11px;color:#d4a843;
                                       font-weight:600;letter-spacing:0.5px;">
                            Pending Review
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Next Steps -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:rgba(212,168,67,0.05);border-radius:10px;
                       border:1px solid rgba(212,168,67,0.15);margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;padding-top:2px;">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="#d4a843" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                        </td>
                        <td style="font-size:13px;color:rgba(212,168,67,0.85);
                                   line-height:1.6;">
                          <strong style="color:#d4a843;">What happens next?</strong>
                          Our team will review your request and reach out with a
                          confirmation and final pricing. If you have a design file
                          ready, you can send it to us via chat support.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="{{ config('app.frontend_url') }}/shop/profile"
                      style="display:inline-block;background:linear-gradient(
                               135deg,#d4a843 0%,#c4963a 100%);
                             color:#0f0f0f;font-weight:700;font-size:14px;
                             text-decoration:none;padding:12px 28px;
                             border-radius:8px;letter-spacing:0.3px;">
                      View My Orders
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:24px 40px;text-align:center;
                       border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0 0 6px;font-size:12px;color:#444;">
                You're receiving this because you placed an order request on
                PersonalizeMe Prints.
              </p>
              <p style="margin:0;font-size:11px;color:#333;">
                &copy; {{ date('Y') }} PersonalizeMe Prints. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
