@extends('reports.pdf-layout')
@php
  $peso = fn ($n) => '₱' . number_format((float) $n, 2);
  $t = $d['totals'];
@endphp
@section('body')
  <table class="kpis"><tr>
    <td><div class="k">Stock value</div><div class="v">{{ $peso($t['stockValue']) }}</div><div class="d">At average cost</div></td>
    <td><div class="k">Materials</div><div class="v">{{ $t['materials'] }}</div><div class="d">{{ $t['onDemand'] }} bought per order</div></td>
    <td><div class="k">Below minimum</div><div class="v">{{ $t['belowMin'] }}</div><div class="d">Free stock at or under the line</div></td>
    <td><div class="k">Out of stock</div><div class="v">{{ $t['out'] }}</div><div class="d">Nothing free to use</div></td>
  </tr></table>

  <h2>Needs attention</h2>
  <table>
    <tr><th>Material</th><th>SKU</th><th class="r">On hand</th><th class="r">Held</th><th class="r">Minimum</th><th>Status</th></tr>
    @forelse($d['attention'] as $row)
      <tr><td>{{ $row['name'] }}</td><td>{{ $row['sku'] }}</td><td class="r">{{ $row['onHand'] }} {{ $row['uom'] }}</td><td class="r">{{ $row['reserved'] }}</td><td class="r">{{ $row['minimum'] }}</td><td>{{ $row['status'] === 'out' ? 'Out' : 'Below minimum' }}</td></tr>
    @empty
      <tr><td colspan="6">Everything is above its minimum.</td></tr>
    @endforelse
  </table>

  <h2>Stock value by category</h2>
  <table>
    <tr><th>Category</th><th class="r">Materials</th><th class="r">Units</th><th class="r">Value</th></tr>
    @foreach($d['byCategory'] as $row)
      <tr><td>{{ $row['category'] }}</td><td class="r">{{ $row['items'] }}</td><td class="r">{{ number_format((float) $row['units'], 2) }}</td><td class="r">{{ $peso($row['value']) }}</td></tr>
    @endforeach
  </table>

  <h2>Used in the last 30 days</h2>
  <table>
    <tr><th>Material</th><th class="r">Used</th><th class="r">Cost</th></tr>
    @forelse($d['consumption'] as $row)
      <tr><td>{{ $row['name'] }}</td><td class="r">{{ $row['qty'] }} {{ $row['uom'] }}</td><td class="r">{{ $peso($row['cost']) }}</td></tr>
    @empty
      <tr><td colspan="3">Nothing used in the last 30 days.</td></tr>
    @endforelse
  </table>
@endsection
