@extends('reports.pdf-layout')
@php
  $peso = fn ($n) => '₱' . number_format((float) $n, 2);
  $t = $d['totals'];
  $p = $d['previous'];
@endphp
@section('body')
  <table class="kpis"><tr>
    <td><div class="k">Sales</div><div class="v">{{ $peso($t['revenue']) }}</div><div class="d">Before: {{ $peso($p['revenue']) }}</div></td>
    <td><div class="k">Gross profit</div><div class="v">{{ $peso($t['profit']) }}</div><div class="d">Before: {{ $peso($p['profit']) }}</div></td>
    <td><div class="k">Orders</div><div class="v">{{ $t['orders'] }}</div><div class="d">Before: {{ $p['orders'] }}</div></td>
    <td><div class="k">Average order</div><div class="v">{{ $peso($t['avgOrder']) }}</div><div class="d">Before: {{ $peso($p['avgOrder']) }}</div></td>
  </tr></table>
  <p class="note">Compared with {{ $d['previousRange']['label'] }}. Sales are what was sold, by sale date; cancelled orders are not counted.@if(($t['costMissing'] ?? 0) > 0) {{ $t['costMissing'] }} line(s) have no cost recorded, so profit is overstated.@endif</p>

  <h2>By {{ $d['range']['bucket'] }}</h2>
  <table>
    <tr><th>Period</th><th class="r">Orders</th><th class="r">Sales</th><th class="r">Cost</th><th class="r">Profit</th></tr>
    @foreach($d['series'] as $row)
      @if(($row['orders'] ?? 0) || ($row['revenue'] ?? 0))
      <tr><td>{{ $row['label'] }}</td><td class="r">{{ $row['orders'] }}</td><td class="r">{{ $peso($row['revenue']) }}</td><td class="r">{{ $peso($row['cost']) }}</td><td class="r">{{ $peso($row['profit']) }}</td></tr>
      @endif
    @endforeach
  </table>

  <h2>Where sales came from</h2>
  <table>
    <tr><th>Channel</th><th class="r">Orders</th><th class="r">Sales</th></tr>
    <tr><td>Online shop</td><td class="r">{{ $d['bySource']['online']['orders'] }}</td><td class="r">{{ $peso($d['bySource']['online']['revenue']) }}</td></tr>
    <tr><td>Counter (POS)</td><td class="r">{{ $d['bySource']['counter']['orders'] }}</td><td class="r">{{ $peso($d['bySource']['counter']['revenue']) }}</td></tr>
    <tr><td>Recorded by hand</td><td class="r">{{ $d['bySource']['manual']['orders'] }}</td><td class="r">{{ $peso($d['bySource']['manual']['revenue']) }}</td></tr>
  </table>

  <h2>Top products</h2>
  <table>
    <tr><th>Product</th><th class="r">Qty</th><th class="r">Sales</th><th class="r">Profit</th></tr>
    @forelse($d['topProducts'] as $row)
      <tr><td>{{ $row['name'] }}</td><td class="r">{{ $row['qty'] }}</td><td class="r">{{ $peso($row['revenue']) }}</td><td class="r">{{ $peso($row['profit']) }}</td></tr>
    @empty
      <tr><td colspan="4">No sales in this period.</td></tr>
    @endforelse
  </table>

  <h2>By category</h2>
  <table>
    <tr><th>Category</th><th class="r">Lines</th><th class="r">Sales</th></tr>
    @foreach($d['byCategory'] as $row)
      <tr><td>{{ $row['category'] }}</td><td class="r">{{ $row['lines'] }}</td><td class="r">{{ $peso($row['revenue']) }}</td></tr>
    @endforeach
  </table>
@endsection
