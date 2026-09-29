@extends('reports.pdf-layout')
@php
  $peso  = fn ($n) => '₱' . number_format((float) $n, 2);
  $t     = $d['totals'];
  $value = (float) $t['stockValue'];
  $cats  = collect($d['byCategory'] ?? [])->sortByDesc('value')->values();
  $share = fn ($v) => $value > 0 ? max(0, min(100, (float) $v / $value * 100)) : 0;
  $att   = collect($d['attention'] ?? []);
  $outs  = $att->where('status', 'out')->pluck('name');
  $lows  = $att->where('status', '!=', 'out')->pluck('name');
  $used  = collect($d['consumption'] ?? []);
  $usedCost = $used->sum('cost');
  $names = fn ($c) => $c->take(4)->implode(', ') . ($c->count() > 4 ? ' and ' . ($c->count() - 4) . ' more' : '');

  // The story first: what is worth what, what needs buying, where the money sits.
  $glance = ["Stock is worth {$peso($value)} across {$t['materials']} materials."];
  if ($att->isEmpty()) {
      $glance[] = 'Everything is above its minimum; nothing needs buying today.';
  } else {
      $parts = [];
      if ($outs->count()) $parts[] = $outs->count() . ' out of stock (' . $names($outs) . ')';
      if ($lows->count()) $parts[] = $lows->count() . ' below minimum (' . $names($lows) . ')';
      $glance[] = 'Needs buying: ' . implode('; ', $parts) . '.';
  }
  if ($cats->first() && $value > 0) $glance[] = 'Most of the value is in ' . ($cats->first()['category'] ?: 'uncategorised') . ' (' . number_format($share($cats->first()['value']), 0) . '%).'
      . ($usedCost > 0 ? " Materials used in the last 30 days cost {$peso($usedCost)}." : '');
@endphp
@section('body')
  <div class="glance">
    <div class="t">At a glance</div>
    @foreach($glance as $line)<p>{{ $line }}</p>@endforeach
  </div>

  <table class="kpis"><tr>
    <td><div class="k">Stock value</div><div class="v">{{ $peso($value) }}</div><div class="d">At average cost</div></td>
    <td><div class="k">Materials</div><div class="v">{{ $t['materials'] }}</div><div class="d">{{ $t['onDemand'] }} bought per order</div></td>
    <td><div class="k">Below minimum</div><div class="v" style="{{ $t['belowMin'] > 0 ? 'color:#8a5a00' : '' }}">{{ $t['belowMin'] }}</div><div class="d">At or under the reorder line</div></td>
    <td><div class="k">Out of stock</div><div class="v" style="{{ $t['out'] > 0 ? 'color:#b3261e' : '' }}">{{ $t['out'] }}</div><div class="d">Nothing free to use</div></td>
  </tr></table>

  <h2>Needs buying <small>- out of stock first</small></h2>
  <table class="t">
    <tr><th>Material</th><th>SKU</th><th class="r">On hand</th><th class="r">Held for orders</th><th class="r">Minimum</th><th>Status</th></tr>
    @forelse($att->sortBy(fn ($r) => $r['status'] === 'out' ? 0 : 1)->values() as $row)
      <tr><td>{{ $row['name'] }}</td><td class="muted">{{ $row['sku'] }}</td><td class="r">{{ $row['onHand'] }} {{ $row['uom'] }}</td><td class="r">{{ $row['reserved'] }}</td><td class="r">{{ $row['minimum'] }}</td>
        <td><span class="pill {{ $row['status'] === 'out' ? 'out' : 'low' }}">{{ $row['status'] === 'out' ? 'Out' : 'Below minimum' }}</span></td></tr>
    @empty
      <tr><td colspan="6" class="muted">Everything is above its minimum.</td></tr>
    @endforelse
  </table>

  <table class="cols"><tr>
    <td>
      <h2>Where the stock value sits</h2>
      <table class="t">
        <tr><th>Category</th><th class="r">Value</th><th class="share">Share</th></tr>
        @foreach($cats as $row)
          <tr><td>{{ $row['category'] ?: 'Uncategorised' }} <span class="muted">({{ $row['items'] }})</span></td><td class="r">{{ $peso($row['value']) }}</td>
            <td><div class="bar"><div style="width:{{ $share($row['value']) }}%"></div></div></td></tr>
        @endforeach
        <tr class="total"><td>Total</td><td class="r">{{ $peso($value) }}</td><td></td></tr>
      </table>
    </td>
    <td>
      <h2>Used in the last 30 days</h2>
      <table class="t">
        <tr><th>Material</th><th class="r">Used</th><th class="r">At cost</th></tr>
        @forelse($used->sortByDesc('cost')->values() as $row)
          <tr><td>{{ $row['name'] }}</td><td class="r" style="white-space:nowrap">{{ $row['qty'] }} {{ $row['uom'] }}</td><td class="r">{{ $peso($row['cost']) }}</td></tr>
        @empty
          <tr><td colspan="3" class="muted">Nothing used in the last 30 days.</td></tr>
        @endforelse
        @if($used->isNotEmpty())<tr class="total"><td>Total</td><td></td><td class="r">{{ $peso($usedCost) }}</td></tr>@endif
      </table>
    </td>
  </tr></table>
@endsection
