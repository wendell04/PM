<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your order has been confirmed!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 24px 0;">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <!-- HEADER BAND -->
                    <tr>
                        <td style="background-color: #d4a843; padding: 24px 32px; text-align: center;">
                            <span style="font-size: 22px; font-weight: bold; color: #1a1a1a;">PersonalizeMe Prints ✓</span>
                        </td>
                    </tr>

                    <!-- BODY SECTION -->
                    <tr>
                        <td style="padding: 32px;">
                            <!-- Greeting -->
                            <p style="font-size: 16px; color: #1a1a1a; margin: 0 0 16px;">Hi {{ $customerName }},</p>

                            <!-- Message -->
                            <p style="font-size: 14px; color: #444; line-height: 1.6; margin: 0 0 24px;">
                                Great news! Your order request has been confirmed by our team. We're now preparing your order for production.
                            </p>

                            <!-- ORDER SUMMARY BOX -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px;">
                                <tr>
                                    <td style="padding: 20px 24px;">
                                        <p style="font-size: 13px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px;">Order Summary</p>

                                        <!-- Order ID -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                                            <tr>
                                                <td style="font-size: 13px; color: #888;">Order ID</td>
                                                <td align="right" style="font-size: 13px; color: #1a1a1a; font-weight: 600;">#{{ $orderId }}</td>
                                            </tr>
                                        </table>

                                        <!-- Product -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                                            <tr>
                                                <td style="font-size: 13px; color: #888;">Product</td>
                                                <td align="right" style="font-size: 13px; color: #1a1a1a; font-weight: 600;">{{ $productName }}</td>
                                            </tr>
                                        </table>

                                        <!-- Quantity -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                                            <tr>
                                                <td style="font-size: 13px; color: #888;">Quantity</td>
                                                <td align="right" style="font-size: 13px; color: #1a1a1a; font-weight: 600;">{{ $quantity }}</td>
                                            </tr>
                                        </table>

                                        <!-- Suggested Price -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                                            <tr>
                                                <td style="font-size: 13px; color: #888;">Suggested Price</td>
                                                <td align="right" style="font-size: 13px; color: #1a1a1a; font-weight: 600;">₱{{ number_format($suggestedPrice, 2) }}</td>
                                            </tr>
                                        </table>

                                        <!-- Status -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="font-size: 13px; color: #888;">Status</td>
                                                <td align="right" style="font-size: 13px; color: #16a34a; font-weight: 700;">Confirmed ✓</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- STATUS MESSAGE -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                                <tr>
                                    <td style="border-left: 3px solid #16a34a; padding: 12px 16px; background-color: #f0fdf4; font-size: 14px; color: #444;">
                                        ✅ <strong>Next steps:</strong> Your order is now in production. We'll notify you when it's ready for pickup or delivery.
                                    </td>
                                </tr>
                            </table>

                            <!-- SUPPORT LINE -->
                            <p style="font-size: 13px; color: #888; margin: 0;">
                                Questions? Reply to this email or contact us at <a href="mailto:{{ config('mail.from.address') }}" style="color: #d4a843; text-decoration: none;">{{ config('mail.from.address') }}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- FOOTER BAND -->
                    <tr>
                        <td style="background-color: #f4f4f4; padding: 16px 32px; text-align: center; font-size: 12px; color: #aaa;">
                            &copy; PersonalizeMe Prints. This is an automated message, please do not reply directly to this email.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
