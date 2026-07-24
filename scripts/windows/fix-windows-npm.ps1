# Patch Ohamar package.json + env.mjs so npm scripts work on Windows
# (Unix "OHAMAR_INSTANCE=main node ..." is invalid on cmd.exe)
#
#   cd C:\ohamar-deploy\ohamar
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\scripts\windows\fix-windows-npm.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
}
Set-Location $Root
Write-Host "=== Patch Windows npm scripts @ $Root ===" -ForegroundColor Cyan

$pkgPath = Join-Path $Root "package.json"
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8
$pkg2 = $pkg `
  -replace 'OHAMAR_INSTANCE=main node ', 'node ' `
  -replace 'OHAMAR_INSTANCE=worker node ', 'node '
if ($pkg2 -ne $pkg) {
  Set-Content -Path $pkgPath -Value $pkg2 -Encoding UTF8 -NoNewline
  Write-Host "OK package.json: removed Unix env prefixes"
} else {
  Write-Host "package.json already clean (or pattern not found)"
}

$envPath = Join-Path $Root "scripts\env.mjs"
$envTxt = Get-Content $envPath -Raw -Encoding UTF8
if ($envTxt -notmatch "instanceFromNpmLifecycle") {
  $old = @'
const rawInstance = (process.env.OHAMAR_INSTANCE || "").trim().toLowerCase();
const ALLOW_UNSET = process.env.OHAMAR_ALLOW_UNSET_INSTANCE === "1";
'@
  $new = @'
/** Infer main|worker from `npm run …` name when env is not set (Windows-safe). */
function instanceFromNpmLifecycle() {
  const life = (process.env.npm_lifecycle_event || "").trim().toLowerCase();
  if (!life) return "";
  if (life === "worker" || life.endsWith(":worker")) return "worker";
  return "main";
}

const rawInstance = (
  process.env.OHAMAR_INSTANCE ||
  instanceFromNpmLifecycle() ||
  ""
).trim().toLowerCase();
const ALLOW_UNSET = process.env.OHAMAR_ALLOW_UNSET_INSTANCE === "1";
'@
  if ($envTxt.Contains($old.Trim())) {
    $envTxt = $envTxt.Replace($old.Trim(), $new.Trim())
  } else {
    # fallback: inject after ROOT export line
    $marker = 'export const ROOT = path.resolve(__dirname, "..");'
    if (-not $envTxt.Contains($marker)) { throw "env.mjs layout unexpected — copy scripts/env.mjs from machine nha" }
    $envTxt = $envTxt.Replace(
      $marker,
      "$marker`n`n$($new.Trim())`n// rawInstance set above; skip next legacy line if present"
    )
    # remove duplicate old rawInstance if both exist
    $envTxt = $envTxt -replace '(?m)^const rawInstance = \(process\.env\.OHAMAR_INSTANCE \|\| ""\)\.trim\(\)\.toLowerCase\(\);\r?\nconst ALLOW_UNSET = process\.env\.OHAMAR_ALLOW_UNSET_INSTANCE === "1";\r?\n', ''
  }

  if ($envTxt -notmatch 'process\.env\.OHAMAR_INSTANCE = INSTANCE') {
    $envTxt = $envTxt -replace \
      'export const INSTANCE = resolveInstance\(rawInstance\);',
      "export const INSTANCE = resolveInstance(rawInstance);`nprocess.env.OHAMAR_INSTANCE = INSTANCE;"
  }

  Set-Content -Path $envPath -Value $envTxt -Encoding UTF8 -NoNewline
  Write-Host "OK scripts/env.mjs: npm lifecycle instance + set process.env"
} else {
  Write-Host "env.mjs already has instanceFromNpmLifecycle"
}

Write-Host @"

Patch xong. Chay 2 bot:

  # Cua so 1 — Gia Huy
  cd $Root
  `$env:LEAD_CORE_ENFORCE='0'
  npm run start

  # Cua so 2 — Minh Phat
  cd $Root
  `$env:LEAD_CORE_ENFORCE='0'
  npm run start:worker

Hoac:
  .\scripts\windows\setup-and-start.ps1

"@ -ForegroundColor Green
