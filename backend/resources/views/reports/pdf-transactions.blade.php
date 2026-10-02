@extends('reports.pdf-layout')
@php
  $peso = fn ($n) => ((float) $n < 0 ? '-' : '') . '₱' . number_format(abs((float) $n), 2);
  $t    = $d['totals'];
  $rows = $d['rows'] ?? [];
  $maxM = max(1, collect($d['byMethod'] ?? [])->max(fn ($m) => abs($m['amount'])) ?? 0);
  $maxK = max(1, collect($d['byKind'] ?? [])->max(fn ($k) => abs($k['amount'])) ?? 0);
  $topMethod = $d['byMethod'][0] ?? null;

  $glance = [];
  if ($t['count'] === 0) {
      $glance[] = 'No money moved in this period.';
  } else {
      $glance[] = "{$t['count']} transaction" . ($t['count'] == 1 ? '' : 's') . ": {$peso($t['received'])} received"
          . ($t['refunded'] > 0 ? " and {$peso($t['refunded'])} refunded, so the shop kept {$peso($t['net'])}." : '.');
      if ($topMethod && $t['received'] > 0) {
          $glance[] = "Most of it came through {$topMethod['method']}: {$peso($topMethod['amount'])} in {$topMethod['count']} payment" . ($topMethod['count'] == 1 ? '' : 's') . '.';
      }
  }
@endphp
@section('body')
  <div class="glance">
    <div class="t">At a glance</div>
    @foreach($glance as $line)<p>{{ $line }}</p>@endforeach
  </div>

  <table class="kpis"><tr>
    <td><div class="k">Transactions</div><div class="v">{{ $t['count'] }}</div><div class="d">payments and refunds</div></td>
    <td><div class="k">Received</div><div class="v">{{ $peso($t['received']) }}</div><div class="d">all payments in</div></td>
    <td><div class="k">Refunded</div><div class="v">{{ $peso($t['refunded']) }}</div><div class="d">paid back to customers</div></td>
    <td><div class="k">Net kept</div><div class="v">{{ $peso($t['net']) }}</div><div class="d">received less refunds</div></td>
  </tr></table>
  <div class="muted" style="font-size:7.5px;margin:-6px 0 4px;">Each payment is counted on the day it was made. Payments on orders that were later cancelled are listed, because that money did come in; the refund that returned it is listed too.</div>

  <table class="cols"><tr>
    <td>
      <h2>By payment method</h2>
      <table class="t">
        <tr><th>Method</th><th class="r">Count</th><th class="r">Amount</th><th class="share">Share</th></tr>
        @forelse($d['byMethod'] as $m)
          <tr><td>{{ $m['method'] }}</td><td class="r">{{ $m['count'] }}</td><td class="r">{{ $peso($m['amount']) }}</td>
            <td><div class="bar"><div style="width:{{ abs($m['amount']) / $maxM * 100 }}%"></div></div></td></tr>
        @empty
          <tr><td colspan="4" class="muted">Nothing in this period.</td></tr>
        @endforelse
      </table>
    </td>
    <td>
      <h2>By type</h2>
      <table class="t">
        <tr><th>Type</th><th class="r">Count</th><th class="r">Amount</th><th class="share">Share</th></tr>
        @forelse($d['byKind'] as $k)
          <tr><td>{{ $k['kind'] }}</td><td class="r">{{ $k['count'] }}</td><td class="r">{{ $peso($k['amount']) }}</td>
            <td><div class="bar"><div style="width:{{ abs($k['amount']) / $maxK * 100 }}%"></div></div></td></tr>
        @empty
          <tr><td colspan="4" class="muted">Nothing in this period.</td></tr>
        @endforelse
      </table>
    </td>
  </tr></table>

  @if(count($rows))
  <h2 style="page-break-before: always; margin-top: 0;">Transaction records <small>- newest first</small></h2>
  <table class="t">
    <thead style="display: table-header-group;"><tr><th>Date</th><th>Order</th><th>Customer</th><th>Type</th><th>Method</th><th>Recorded</th><th class="r">Amount</th></tr></thead>
    @foreach($rows as $r)
      <tr>
        <td style="white-space:nowrap;">{{ $r['date'] }}</td>
        <td style="white-space:nowrap;">{{ $r['ref'] }}</td>
        <td>{{ $r['customer'] }}</td>
        <td>{{ $r['kind'] }} @if($r['note'])<div class="muted" style="font-size:7px;">{{ $r['note'] }}</div>@endif</td>
        <td>{{ $r['method'] }}</td>
        <td>{{ $r['by'] }}</td>
        <td class="r" style="{{ $r['amount'] < 0 ? 'color:#b3261e;' : '' }}">{{ $peso($r['amount']) }}</td>
      </tr>
    @endforeach
    <tr class="total"><td colspan="6">Net kept ({{ $t['count'] }} transaction{{ $t['count'] == 1 ? '' : 's' }})</td><td class="r">{{ $peso($t['net']) }}</td></tr>
  </table>
  @endif
@endsection
