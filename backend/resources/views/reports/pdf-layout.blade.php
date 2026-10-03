<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{{ $title }}</title>
<style>
  /* Built for one read: the story first (At a glance), the four numbers, the picture, then detail. */
  @page { margin: 30px 34px 42px; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 9.5px; color: #1b1e24; line-height: 1.35; }
  .head { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .head td { vertical-align: bottom; padding: 0 0 8px; border-bottom: 2px solid #a67c1a; }
  .brand { font-size: 10px; font-weight: bold; letter-spacing: 1.5px; color: #1b1e24; }
  .brand span { color: #a67c1a; }
  h1 { font-size: 19px; margin: 3px 0 0; }
  .period { font-size: 11px; color: #4a505c; margin-top: 2px; }
  .meta { text-align: right; font-size: 8px; color: #7a8090; }
  .glance { background: #faf6ea; border: 1px solid #e6d8ae; border-left: 4px solid #a67c1a; padding: 9px 12px; margin-bottom: 12px; }
  .glance .t { font-size: 8px; font-weight: bold; letter-spacing: 1px; color: #8a6a17; text-transform: uppercase; margin-bottom: 3px; }
  .glance p { margin: 2px 0; font-size: 10.5px; line-height: 1.45; }
  .warn { background: #fff4e5; border: 1px solid #f0c98a; color: #7a4a00; padding: 6px 10px; font-size: 8.5px; margin: 0 0 12px; }
  .kpis { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin: 0 -6px 12px; }
  .kpis td { border: 1px solid #dde0e6; padding: 8px 9px; width: 25%; vertical-align: top; }
  .kpis .k { font-size: 7.5px; text-transform: uppercase; color: #5a6170; letter-spacing: .6px; }
  .kpis .v { font-size: 15px; font-weight: bold; margin: 3px 0 2px; }
  .kpis .d { font-size: 8px; color: #5a6170; }
  .up { color: #1e7a3c; font-weight: bold; }
  .down { color: #b3261e; font-weight: bold; }
  .flat { color: #5a6170; font-weight: bold; }
  h2 { font-size: 11px; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #dde0e6; }
  h2 small { font-weight: normal; color: #7a8090; font-size: 8px; }
  table.t { width: 100%; border-collapse: collapse; }
  table.t th { text-align: left; font-size: 7.5px; text-transform: uppercase; letter-spacing: .5px; color: #5a6170; border-bottom: 1px solid #c9ced8; padding: 4px 5px; }
  table.t td { padding: 4px 5px; border-bottom: 1px solid #eef0f3; }
  table.t tr.total td { font-weight: bold; border-top: 1px solid #c9ced8; border-bottom: none; }
  .r { text-align: right; }
  .muted { color: #7a8090; }
  .share { width: 70px; }
  .bar { height: 6px; background: #eef0f3; }
  .bar div { height: 6px; background: #a67c1a; }
  .cols { width: 100%; border-collapse: collapse; }
  .cols > tbody > tr > td { width: 50%; vertical-align: top; padding: 0; }
  .cols > tbody > tr > td:first-child { padding-right: 10px; }
  .cols > tbody > tr > td:last-child { padding-left: 10px; }
  .chart { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .chart td { vertical-align: bottom; padding: 0 1px; }
  .chart .lbl td { vertical-align: top; font-size: 7px; color: #7a8090; padding-top: 3px; text-align: left; white-space: nowrap; overflow: visible; }
  .chart .bars td { border-bottom: 1px solid #c9ced8; }
  .legend { font-size: 7.5px; color: #5a6170; margin-top: 4px; }
  .sw { display: inline-block; width: 8px; height: 8px; vertical-align: middle; margin: 0 3px 0 8px; }
  .pill { font-size: 7.5px; font-weight: bold; padding: 1px 5px; }
  .out { background: #fbe4e2; color: #b3261e; }
  .low { background: #fff1d6; color: #8a5a00; }
  .foot { position: fixed; bottom: -26px; left: 0; right: 0; font-size: 7.5px; color: #8a90a0; }
</style>
</head>
<body>
  <table class="head"><tr>
    <td>
      <div class="brand">PERSONALIZE <span>ME</span> PRINTS</div>
      <h1>{{ $title }}</h1>
      <div class="period">{{ $subtitle }}</div>
      @if(!empty($filtered))<div class="period" style="font-size:9px;color:#8a6a17;">Filtered - {{ $filtered }}</div>@endif
    </td>
    <td class="meta">Generated {{ $generatedAt }}<br>by {{ $generatedBy }}</td>
  </tr></table>
  @yield('body')
  <div class="foot">Personalize Me Prints - {{ $title }} - {{ $subtitle }}</div>
</body>
</html>
