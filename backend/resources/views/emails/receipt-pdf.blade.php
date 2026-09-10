{{--
  The receipt that gets attached to the confirmation email.

  Mirrors components/shop/OrderReceipt.jsx. dompdf has no flexbox and no CSS grid, so the two
  cannot share markup - this one is tables and inline styles. Change one, change the other.
--}}
@php
  // DejaVu Sans is the face dompdf bundles, and the one that carries U+20B1.
  $peso = fn ($n) => "\u{20B1}" . number_format((float) $n, 2);
@endphp
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 16mm 14mm; }
    body  { font-family: "DejaVu Sans", sans-serif; font-size: 10pt; color: #111111; }
    td, th { vertical-align: top; }
    .muted { color: #888888; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; }
    .gold  { color: #c8922e; }
  </style>
</head>
<body>

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-size:20pt;font-weight:bold;letter-spacing:1px;">Receipt</td>
      <td align="right" style="font-size:8.5pt;color:#555555;line-height:1.6;">
        <span class="gold" style="font-size:11pt;font-weight:bold;">Personalize Me Prints</span><br>
        Custom Printing Services<br>
        personalizemeprints.com
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0"
         style="margin-top:14px;border-top:2px solid #111111;border-bottom:1px solid #dddddd;">
    <tr>
      <td width="34%" style="padding:8px 0;">
        <span class="muted">Order No.</span><br><b>{{ $ref }}</b>
      </td>
      <td width="33%" style="padding:8px 0;">
        <span class="muted">Date</span><br><b>{{ $date ?: '-' }}</b>
      </td>
      <td width="33%" style="padding:8px 0;">
        <span class="muted">Status</span><br>
        <b style="color:{{ $settled ? '#166534' : '#b45309' }};">{{ $status }}</b>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
    <tr>
      <td width="50%" style="padding-right:16px;">
        <span class="gold" style="font-size:8pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Bill To</span><br>
        <span style="font-size:9pt;color:#333333;line-height:1.6;">
          {{ $name }}@if($email)<br>{{ $email }}@endif @if($phone)<br>{{ $phone }}@endif
        </span>
      </td>
      <td width="50%">
        <span class="gold" style="font-size:8pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Ship To</span><br>
        <span style="font-size:9pt;color:#333333;line-height:1.6;">{{ $name }}<br>{{ $address ?: '-' }}</span>
      </td>
    </tr>
  </table>

  <div style="margin-top:18px;font-size:8.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Summary</div>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-size:9.5pt;">
    <tr style="background:#c8922e;color:#ffffff;">
      <th align="left"   style="padding:7px 9px;">Product</th>
      <th align="center" style="padding:7px 9px;">Qty</th>
      <th align="right"  style="padding:7px 9px;">Price</th>
    </tr>
    @foreach($items as $i)
    <tr>
      <td align="left"   style="padding:7px 9px;border-bottom:1px solid #eeeeee;color:#222222;">{{ $i['name'] }}</td>
      <td align="center" style="padding:7px 9px;border-bottom:1px solid #eeeeee;color:#222222;">{{ $i['qty'] }}</td>
      <td align="right"  style="padding:7px 9px;border-bottom:1px solid #eeeeee;color:#222222;">{{ $peso($i['total']) }}</td>
    </tr>
    @endforeach
  </table>

  <table align="right" cellpadding="0" cellspacing="0" style="margin-top:8px;font-size:9.5pt;">
    <tr>
      <td align="right" style="padding:2px 12px;font-weight:bold;color:#333333;">Sub-Total:</td>
      <td align="right" style="padding:2px 0;color:#333333;">{{ $peso($subtotal) }}</td>
    </tr>
    @if($designFee > 0)
    <tr>
      <td align="right" style="padding:2px 12px;font-weight:bold;color:#333333;">Design fee:</td>
      <td align="right" style="padding:2px 0;color:#333333;">{{ $peso($designFee) }}</td>
    </tr>
    @endif
    @if($rushFee > 0)
    <tr>
      <td align="right" style="padding:2px 12px;font-weight:bold;color:#333333;">Rush fee:</td>
      <td align="right" style="padding:2px 0;color:#333333;">{{ $peso($rushFee) }}</td>
    </tr>
    @endif
    @if($shipping > 0)
    <tr>
      <td align="right" style="padding:2px 12px;font-weight:bold;color:#333333;">Delivery:</td>
      <td align="right" style="padding:2px 0;color:#333333;">{{ $peso($shipping) }}</td>
    </tr>
    @endif
    <tr>
      <td align="right" style="padding:6px 12px 2px;font-weight:bold;font-size:10.5pt;">Total:</td>
      <td align="right" style="padding:6px 0 2px;font-weight:bold;font-size:10.5pt;">{{ $peso($total) }}</td>
    </tr>
  </table>

  <div style="clear:both;"></div>

  @if(count($payments))
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid #dddddd;">
    <tr><td colspan="2" style="padding-top:10px;font-size:8.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Payments</td></tr>
    @foreach($payments as $p)
    <tr>
      <td style="padding:2px 0;font-size:9.5pt;color:#333333;">
        {{ $p['label'] }}@if($p['when']) - {{ $p['when'] }}@endif @if($p['method']) - {{ $p['method'] }}@endif
      </td>
      <td align="right" style="padding:2px 0;font-size:9.5pt;font-weight:bold;color:#333333;">{{ $peso($p['amount']) }}</td>
    </tr>
    @endforeach
    <tr>
      <td style="padding-top:6px;font-size:10pt;font-weight:bold;color:{{ $settled ? '#166534' : '#b45309' }};">
        {{ $settled ? 'Fully Paid' : 'Still Due' }}
      </td>
      <td align="right" style="padding-top:6px;font-size:10pt;font-weight:bold;color:{{ $settled ? '#166534' : '#b45309' }};">
        {{ $settled ? $peso($total) : $peso($owed) }}
      </td>
    </tr>
  </table>
  @endif

  <div style="margin-top:22px;border-top:1px solid #eeeeee;padding-top:10px;font-size:8pt;color:#777777;line-height:1.7;">
    <b style="color:#555555;">Notes</b><br>
    Production starts once your design/proof is approved and the required payment clears. For any
    queries, reach us at personalizemeprints.com. Thank you for your order.<br>
    <span style="color:#aaaaaa;">&copy; {{ date('Y') }} Personalize Me Prints</span>
  </div>

</body>
</html>
