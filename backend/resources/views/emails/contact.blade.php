<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
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
                Contact Form Submission
              </div>
            </td>
          </tr>

          {{-- Body --}}
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f5f5f5;">
                New Message Received
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#888;line-height:1.7;">
                Someone submitted the contact form on the website.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#222;border-radius:8px;border:1px solid rgba(255,255,255,0.07);
                       border-collapse:separate;border-spacing:0;margin-bottom:20px;">
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                             font-size:11px;color:#555;width:25%;text-transform:uppercase;
                             letter-spacing:0.5px;vertical-align:top;">
                    Name
                  </td>
                  <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                             font-size:13px;color:#f5f5f5;font-weight:600;">
                    {{ $name }}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                             font-size:11px;color:#555;text-transform:uppercase;
                             letter-spacing:0.5px;vertical-align:top;">
                    Email
                  </td>
                  <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                             font-size:13px;color:#d4a843;">
                    <a href="mailto:{{ $email }}" style="color:#d4a843;text-decoration:none;">
                      {{ $email }}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                             font-size:11px;color:#555;text-transform:uppercase;
                             letter-spacing:0.5px;vertical-align:top;">
                    Subject
                  </td>
                  <td style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);
                             font-size:13px;color:#f5f5f5;font-weight:600;">
                    {{ $subject }}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:11px;color:#555;
                             text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">
                    Message
                  </td>
                  <td style="padding:10px 16px;font-size:13px;color:#aaa;line-height:1.7;">
                    {{ $message }}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          {{-- Footer --}}
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="margin:0;font-size:11px;color:#444;">
                &copy; {{ date('Y') }} Personalize Me Prints. Internal notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
