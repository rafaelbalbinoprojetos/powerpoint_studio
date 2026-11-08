# Junta os arquivos de src/ em um único index.html (abre com dois cliques, sem servidor).
# Uso:  powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $root 'src'
function Src($p) { [IO.File]::ReadAllText((Join-Path $src $p)) }

$html = (Src 'head.html') +
  "<style id=`"dk-css`">`n" + (Src 'engine.css') + "</style>`n" +
  "<style>`n" + (Src 'editor.css') + "</style>`n`n" +
  (Src 'body.html') + "`n" +
  "<script id=`"gsap-js`">" + (Src 'vendor/gsap.min.js') + "</script>`n" +
  "<script id=`"dk-js`">`n" + (Src 'engine.js') + "</script>`n" +
  "<script>" + (Src 'seed.js').TrimEnd() + "</script>`n" +
  "<script>`n" + (Src 'editor.js') + "</script>`n`n" +
  "</body>`n</html>`n"

$out = Join-Path $root 'index.html'
[IO.File]::WriteAllText($out, $html, (New-Object Text.UTF8Encoding $false))
Write-Host ("index.html gerado ({0:N0} KB)" -f ((Get-Item $out).Length / 1KB))
