<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: Arial, sans-serif;
                background: #f5f5f5;
                margin: 0;
                padding: 0;
            }
            .wrapper {
                max-width: 480px;
                margin: 40px auto;
                background: #1a1a1a;
                border-radius: 16px;
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #b8922f, #d4a843);
                padding: 32px 40px;
                text-align: center;
            }
            .header h1 {
                color: #0f0f0f;
                font-size: 22px;
                margin: 0;
                font-weight: 800;
                letter-spacing: 1px;
            }
            .body {
                padding: 36px 40px;
            }
            .body p {
                color: #aaa;
                font-size: 14px;
                line-height: 1.7;
                margin: 0 0 16px; 
            }
            .body p span {
                color: #f5f5f5; 
                font-weight: 600;
            }
            .code-box {
                background: #222;
                border: 2px solid #d4a843;
                border-radius: 12px;
                text-align: center;
                padding: 24px;
                margin: 24px 0;
            }
            .code-box .code {
                font-size: 42px;
                font-weight: 900;
                color: #d4a843;
                letter-spacing: 12px;
                font-family: monospace;
            }
            .code-box small {
                color: #888;
                font-size: 12px;
                display: block;
                margin-top: 8px;
            }
            .footer {
                padding: 20px 40px;
                border-top: 1px solid #2a2a2a;
                text-align: center;
            }
            .footer p {
                color: #555;
                font-size: 11px;
                margin: 0;
            }
        </style>
    </head>

    <body>
        <div class="wrapper">
            <div class="header">
                <h1>PERSONALIZE ME PRINTS</h1>
            </div>
            <div class="body">
                <p>Hi, <span>{{$firstName}}</span>!</p>
                <p>Thank you for registering. Use the verification code below to activate your account:</p>
                <div class="code-box">
                    <div class="code">{{$code}}</div>
                    <small>This code expires in 10 minutes</small>
                </div>
                <p>If you did not create an account, you can safely ignore this email.</p>
            </div>
            <div class="footer">
                <p>© {{(date('Y'))}} Personalize Me Prints. All rights reserved.</p>
            </div>
        </div>
    </body>
</html>