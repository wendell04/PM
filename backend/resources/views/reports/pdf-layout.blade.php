<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>{{ $title }}</title>
<style>
  @page { margin: 28px 32px; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 10.5px; color: #16181d; }
  .brand { font-size: 13px; font-weight: bold; letter-spacing: 1px; }
  .brand span { color: #a67c1a; }
  h1 { font-size: 17px; margin: 6px 0 2px; }
  .sub { color: #5a6170; margin: 0 0 14px; }
  h2 { font-size: 12px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #dde0e6; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #5a6170; border-bottom: 1px solid #c9ced8; padding: 4px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #eceef2; }
  .r { text-align: right; }
  .kpis td { border: 1px solid #dde0e6; padding: 7px 8px; width: 25%; vertical-align: top; }
  .kpis .k { font-size: 8.5px; text-transform: uppercase; color: #5a6170; letter-spacing: .5px; }
  .kpis .v { font-size: 14px; font-weight: bold; margin-top: 2px; }
  .kpis .d { font-size: 8.5px; color: #5a6170; }
  .note { color: #5a6170; font-size: 9px; margin-top: 4px; }
  .foot { position: fixed; bottom: -14px; left: 0; right: 0; font-size: 8.5px; color: #8a90a0; }
</style>
</head>
<body>
  <div class="brand">PERSONALIZE <span>ME</span> PRINTS</div>
  <h1>{{ $title }}</h1>
  <p class="sub">{{ $subtitle }}</p>
  @yield('body')
  <div class="foot">Generated {{ $generatedAt }} by {{ $generatedBy }} - Personalize Me Prints</div>
</body>
</html>
