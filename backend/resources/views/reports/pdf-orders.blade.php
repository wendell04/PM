@extends('reports.pdf-layout')
@php
  $peso = fn ($n) => '₱' . number_format((float) $n, 2);
  $t    = $d['totals'];
  $rows = $d['rows'] ?? [];
  $byStatus = $d['byStatus'] ?? [];
  $maxStatus = max(1, collect($byStatus)->max('orders') ?? 0);
  $placedOk = $t['orders'] - $t['cancelled'];

  // The story first: how many orders came in, what they are worth, and what is still owed.
  $glance = [];
  if ($t['orders'] === 0) {
      $glance[] = 'No orders were placed in this period.';
  } else {
      $glance[] = "{$t['orders']} order" . ($t['orders'] == 1 ? ' was' : 's were') . " placed, worth {$peso($t['value'])}"
          . ($t['cancelled'] ? ", not counting {$t['cancelled']} cancelled." : '.');
      $glance[] = "{$t['delivered']} delivered and {$t['open']} still in progress. Customers have paid {$peso($t['paid'])}"
          . ($t['balance'] > 0 ? ", and {$peso($t['balance'])} is still owed." : ', and nothing is owed.');
  }
@endphp
@section('body')
  <div class="glance">
    <div class="t">At a glance</div>
    @foreach($glance as $line)<p>{{ $line }}</p>@endforeach
  </div>

  <table class="kpis"><tr>
    <td><div class="k">Orders placed</div><div class="v">{{ $t['orders'] }}</div><div class="d">{{ $t['cancelled'] }} cancelled</div></td>
    <td><div class="k">Order value</div><div class="v">{{ $peso($t['value']) }}</div><div class="d">{{ $placedOk }} order{{ $placedOk == 1 ? '' : 's' }}, cancelled left out</div></td>
    <td><div class="k">Paid</div><div class="v">{{ $peso($t['paid']) }}</div><div class="d">downpayments and full payments</div></td>
    <td><div class="k">Balance owed</div><div class="v">{{ $peso($t['balance']) }}</div><div class="d">on orders not yet fully paid</div></td>
  </tr></table>
  <div class="muted" style="font-size:7.5px;margin:-6px 0 4px;">Orders are counted by the date they were placed. A checkout that was never paid is not an order and is not listed. Delivery fees are billed separately and are in the transaction report.</div>

  <h2>Orders by status</h2>
  <table class="t">
    <tr><th>Status</th><th class="r">Orders</th><th class="r">Value</th><th class="share">Share</th></tr>
    @forelse($byStatus as $s)
      <tr><td>{{ $s['status'] }}</td><td class="r">{{ $s['orders'] }}</td><td class="r">{{ $peso($s['value']) }}</td>
        <td><div class="bar"><div style="width:{{ $s['orders'] / $maxStatus * 100 }}%"></div></div></td></tr>
    @empty
      <tr><td colspan="4" class="muted">No orders in this period.</td></tr>
    @endforelse
  </table>

  @if(count($rows))
  <h2 style="page-break-before: always; margin-top: 0;">Order records <small>- newest first</small></h2>
  <table class="t">
    <thead style="display: table-header-group;"><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th>Payment</th><th>Status</th></tr></thead>
    @foreach($rows as $r)
      <tr>
        <td style="white-space:nowrap;">{{ $r['ref'] }}</td>
        <td style="white-space:nowrap;">{{ $r['placed'] }}</td>
        <td>{{ $r['customer'] }}<div class="muted" style="font-size:7px;">{{ $r['channel'] }}</div></td>
        <td>{{ $r['items'] }}</td>
        <td class="r">{{ $peso($r['total']) }}</td>
        <td class="r">{{ $peso($r['paid']) }}</td>
        <td class="r">{{ $r['balance'] > 0 ? $peso($r['balance']) : '-' }}</td>
        <td>{{ $r['payment'] }}</td>
        <td>{{ $r['status'] }}</td>
      </tr>
    @endforeach
    <tr class="total"><td colspan="4">Total ({{ $placedOk }} order{{ $placedOk == 1 ? '' : 's' }}, cancelled left out)</td><td class="r">{{ $peso($t['value']) }}</td><td class="r">{{ $peso($t['paid']) }}</td><td class="r">{{ $peso($t['balance']) }}</td><td colspan="2"></td></tr>
  </table>
  @endif
@endsection
