@extends('reports.pdf-layout')
@php
  $peso  = fn ($n) => '₱' . number_format((float) $n, 2);
  $t     = $d['totals'];
  $p     = $d['previous'];
  $prevL = $d['previousRange']['label'] ?? 'the period before';
  $unit  = ['day' => 'day', 'week' => 'week', 'month' => 'month'][$d['range']['bucket'] ?? 'day'] ?? 'period';
  $rev   = (float) $t['revenue'];

  // Change against the period before: ▲ / ▼ and a colour, or "new" when there was nothing before.
  $delta = function ($now, $before) {
      $now = (float) $now; $before = (float) $before;
      if ($before <= 0) return $now > 0 ? ['new', 'flat', ''] : ['no change', 'flat', ''];
      $pct = ($now - $before) / $before * 100;
      if (abs($pct) < 0.5) return ['no change', 'flat', ''];
      return [($pct > 0 ? '▲ ' : '▼ ') . number_format(abs($pct), abs($pct) >= 10 ? 0 : 1) . '%', $pct > 0 ? 'up' : 'down', $pct];
  };
  $share = fn ($v) => $rev > 0 ? max(0, min(100, (float) $v / $rev * 100)) : 0;

  // The story in a few sentences: what a reader should take away without reading a table.
  $series = array_values($d['series'] ?? []);
  $prevSeries = array_values($d['prevSeries'] ?? []);
  $best = collect($series)->sortByDesc('revenue')->first();
  $top  = $d['topProducts'][0] ?? null;
  [$revChange, $revTone, $revPct] = $delta($rev, $p['revenue']);
  $src  = $d['bySource'];
  $channels = collect(['online' => 'made online', 'counter' => 'made at the counter', 'manual' => 'recorded by hand'])
      ->map(fn ($label, $k) => ['label' => $label, 'rev' => (float) ($src[$k]['revenue'] ?? 0)])
      ->filter(fn ($c) => $c['rev'] > 0)->sortByDesc('rev');
  $margin = $rev > 0 ? (float) $t['profit'] / $rev * 100 : 0;

  $glance = [];
  if ($rev <= 0) {
      $glance[] = 'No sales in this period.';
  } else {
      $s = "Sales were {$peso($rev)} from {$t['orders']} order" . ($t['orders'] == 1 ? '' : 's');
      if ((float) $p['revenue'] > 0) {
          $s .= ', ' . ($revPct > 0 ? 'up ' : 'down ') . number_format(abs($revPct), 0) . "% on {$prevL} ({$peso($p['revenue'])}).";
      } else {
          $s .= ". There were no sales in {$prevL} to compare with.";
      }
      $glance[] = $s;
      $g2 = [];
      if ($best && $best['revenue'] > 0) $g2[] = "Best {$unit}: {$best['label']} with {$peso($best['revenue'])}.";
      if ($top) $g2[] = "Top product: {$top['name']}, {$peso($top['revenue'])} (" . number_format($share($top['revenue']), 0) . '% of sales).';
      if ($g2) $glance[] = implode(' ', $g2);
      if ($channels->count() === 1) {
          $glance[] = 'All sales were ' . $channels->first()['label'] . '. Gross profit ' . $peso($t['profit']) . ', a ' . number_format($margin, 0) . '% margin.';
      } elseif ($channels->count() > 1) {
          $glance[] = 'Of sales, ' . $channels->map(fn ($c) => number_format($share($c['rev']), 0) . '% were ' . $c['label'])->implode(', ')
              . '. Gross profit ' . $peso($t['profit']) . ', a ' . number_format($margin, 0) . '% margin.';
      }
  }

  // The chart: this period in gold, the one before in grey, one pair of bars per bucket.
  $peak = max(1, collect($series)->max('revenue') ?? 0, collect($prevSeries)->max('revenue') ?? 0);
  $n = count($series);
  $every = max(1, (int) ceil($n / 8));
  $H = 110;
@endphp
@section('body')
  <div class="glance">
    <div class="t">At a glance</div>
    @foreach($glance as $line)<p>{{ $line }}</p>@endforeach
  </div>

  @if(($t['costMissing'] ?? 0) > 0)
    <div class="warn">{{ $t['costMissing'] }} of {{ $t['lines'] }} sale lines have no cost recorded, so gross profit is higher than it really is.</div>
  @endif

  @php
    [$ordC, $ordT] = $delta($t['orders'], $p['orders']);
    [$avgC, $avgT] = $delta($t['avgOrder'], $p['avgOrder']);
    [$proC, $proT] = $delta($t['profit'], $p['profit']);
  @endphp
  <table class="kpis"><tr>
    <td><div class="k">Sales</div><div class="v">{{ $peso($rev) }}</div><div class="d"><span class="{{ $revTone }}">{{ $revChange }}</span> vs {{ $peso($p['revenue']) }}</div></td>
    <td><div class="k">Orders</div><div class="v">{{ $t['orders'] }}</div><div class="d"><span class="{{ $ordT }}">{{ $ordC }}</span> vs {{ $p['orders'] }}</div></td>
    <td><div class="k">Average order</div><div class="v">{{ $peso($t['avgOrder']) }}</div><div class="d"><span class="{{ $avgT }}">{{ $avgC }}</span> vs {{ $peso($p['avgOrder']) }}</div></td>
    <td><div class="k">Gross profit</div><div class="v">{{ $peso($t['profit']) }}</div><div class="d"><span class="{{ $proT }}">{{ $proC }}</span> - {{ number_format($margin, 0) }}% margin</div></td>
  </tr></table>
  <div class="muted" style="font-size:7.5px;margin:-6px 0 4px;">Compared with {{ $prevL }}. Sales are counted by sale date; cancelled orders are never counted.</div>

  @if($n > 0 && $rev > 0)
  <h2>Sales by {{ $unit }} <small>- gold is {{ $d['range']['label'] }}, grey is {{ $prevL }}</small></h2>
  <table class="chart">
    <tr class="bars">
      @foreach($series as $i => $row)
        @php $h = (int) round((float) $row['revenue'] / $peak * $H); $ph = (int) round((float) ($prevSeries[$i]['revenue'] ?? 0) / $peak * $H); @endphp
        <td style="height:{{ $H }}px;"><div style="height:{{ max($h, $row['revenue'] > 0 ? 1 : 0) }}px;background:#a67c1a;"></div></td>
        <td style="height:{{ $H }}px;padding-right:{{ $n > 20 ? 1 : 4 }}px;"><div style="height:{{ max($ph, ($prevSeries[$i]['revenue'] ?? 0) > 0 ? 1 : 0) }}px;background:#c9ced8;"></div></td>
      @endforeach
    </tr>
    <tr class="lbl">
      @foreach($series as $i => $row)
        <td colspan="2">{{ $i % $every === 0 ? $row['label'] : '' }}</td>
      @endforeach
    </tr>
  </table>
  <div class="legend">Highest {{ $unit }}: {{ $peso($peak) }}<span class="sw" style="background:#a67c1a"></span>{{ $d['range']['label'] }}<span class="sw" style="background:#c9ced8"></span>{{ $prevL }}</div>
  @endif

  <table class="cols"><tr>
    <td>
      <h2>Where sales came from</h2>
      <table class="t">
        <tr><th>Channel</th><th class="r">Orders</th><th class="r">Sales</th><th class="share">Share</th></tr>
        @foreach(['online' => 'Online shop', 'counter' => 'Counter (POS)', 'manual' => 'Recorded by hand'] as $k => $label)
          <tr><td>{{ $label }}</td><td class="r">{{ $src[$k]['orders'] ?? 0 }}</td><td class="r">{{ $peso($src[$k]['revenue'] ?? 0) }}</td>
            <td><div class="bar"><div style="width:{{ $share($src[$k]['revenue'] ?? 0) }}%"></div></div></td></tr>
        @endforeach
      </table>
    </td>
    <td>
      <h2>By category</h2>
      <table class="t">
        <tr><th>Category</th><th class="r">Sales</th><th class="share">Share</th></tr>
        @forelse($d['byCategory'] as $row)
          <tr><td>{{ $row['category'] ?: 'Uncategorised' }}</td><td class="r">{{ $peso($row['revenue']) }}</td>
            <td><div class="bar"><div style="width:{{ $share($row['revenue']) }}%"></div></div></td></tr>
        @empty
          <tr><td colspan="3" class="muted">No sales in this period.</td></tr>
        @endforelse
      </table>
    </td>
  </tr></table>

  <h2>Top products</h2>
  <table class="t">
    <tr><th>#</th><th>Product</th><th class="r">Qty</th><th class="r">Sales</th><th class="r">Profit</th><th class="share">Share of sales</th></tr>
    @forelse($d['topProducts'] as $i => $row)
      <tr><td class="muted">{{ $i + 1 }}</td><td>{{ $row['name'] }}</td><td class="r">{{ $row['qty'] }}</td><td class="r">{{ $peso($row['revenue']) }}</td><td class="r">{{ $peso($row['profit']) }}</td>
        <td><div class="bar"><div style="width:{{ $share($row['revenue']) }}%"></div></div></td></tr>
    @empty
      <tr><td colspan="6" class="muted">No sales in this period.</td></tr>
    @endforelse
  </table>

  @php $hasDetail = collect($series)->contains(fn ($r, $i) => ($r['orders'] ?? 0) || ($r['revenue'] ?? 0) || ($prevSeries[$i]['revenue'] ?? 0)); @endphp
  @if($hasDetail)
  {{-- Detail starts on its own page: page 1 is the summary, and a heading never strands at the foot. --}}
  <h2 style="page-break-before: always; margin-top: 0;">Detail by {{ $unit }} <small>- {{ $unit }}s with no sales are left out</small></h2>
  <table class="t">
    <thead style="display: table-header-group;"><tr><th>{{ ucfirst($unit) }}</th><th class="r">Orders</th><th class="r">Sales</th><th class="r">Cost</th><th class="r">Gross profit</th><th class="r">{{ $prevL }}</th></tr></thead>
    @foreach($series as $i => $row)
      @if(($row['orders'] ?? 0) || ($row['revenue'] ?? 0) || ($prevSeries[$i]['revenue'] ?? 0))
        <tr><td>{{ $row['label'] }}</td><td class="r">{{ $row['orders'] }}</td><td class="r">{{ $peso($row['revenue']) }}</td><td class="r">{{ $peso($row['cost']) }}</td><td class="r">{{ $peso($row['profit']) }}</td><td class="r muted">{{ $peso($prevSeries[$i]['revenue'] ?? 0) }}</td></tr>
      @endif
    @endforeach
    <tr class="total"><td>Total</td><td class="r">{{ $t['orders'] }}</td><td class="r">{{ $peso($rev) }}</td><td class="r">{{ $peso($t['cost']) }}</td><td class="r">{{ $peso($t['profit']) }}</td><td class="r">{{ $peso($p['revenue']) }}</td></tr>
  </table>
  @endif
@endsection
