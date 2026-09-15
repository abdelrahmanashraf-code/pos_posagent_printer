$ErrorActionPreference = 'Stop'

$sourceDir = Join-Path $PSScriptRoot '..\agent-src'
if (-not (Test-Path $sourceDir)) {
    throw "POSAgent source directory was not found: $sourceDir"
}

$escposPath = Join-Path $sourceDir 'escpos.cpp'
if (-not (Test-Path $escposPath)) {
    throw "Required ESC/POS source file was not found: $escposPath"
}

$escpos = Get-Content $escposPath -Raw

# The upstream table is an 8x8 Bayer matrix (64 values), but the code indexes it
# as 4x4. Use the full matrix so grayscale edges/logos dither evenly instead of
# producing coarse/repeating patterns.
$oldIndex = 'return double(bayer_matrix[i * 4 + j]) / 64.0;'
$newIndex = 'return double(bayer_matrix[i * 8 + j]) / 64.0;'
if ($escpos -notmatch [regex]::Escape($newIndex)) {
    if ($escpos -notmatch [regex]::Escape($oldIndex)) {
        throw 'Could not locate the upstream Bayer matrix index.'
    }
    $escpos = $escpos.Replace($oldIndex, $newIndex)
}

$oldBayerCall = 'if (bayer(i % 4, j % 4) * 255 > colorbyte_linear) {'
$newBayerCall = 'if (bayer(i % 8, j % 8) * 255 > colorbyte_linear) {'
if ($escpos -notmatch [regex]::Escape($newBayerCall)) {
    if ($escpos -notmatch [regex]::Escape($oldBayerCall)) {
        throw 'Could not locate the upstream Bayer dithering call.'
    }
    $escpos = $escpos.Replace($oldBayerCall, $newBayerCall)
}

# Make dark antialiased text pixels solid and keep a wider ordered-dither band.
# This improves perceived thermal density without changing printer width, feed,
# cutting, cash-drawer commands, or POS business logic.
$escpos = $escpos.Replace('if (colorbyte_linear < 0xAA) {', 'if (colorbyte_linear < 0xC0) {')
$escpos = $escpos.Replace('if (colorbyte_linear > 0x60) {', 'if (colorbyte_linear > 0x78) {')

Set-Content -Path $escposPath -Value $escpos -NoNewline -Encoding utf8

if (-not (Select-String -Path $escposPath -SimpleMatch 'bayer_matrix[i * 8 + j]' -Quiet)) {
    throw '8x8 Bayer matrix fix was not applied.'
}
if (-not (Select-String -Path $escposPath -SimpleMatch 'bayer(i % 8, j % 8)' -Quiet)) {
    throw '8x8 Bayer dithering call was not applied.'
}
if (-not (Select-String -Path $escposPath -SimpleMatch 'colorbyte_linear < 0xC0' -Quiet)) {
    throw 'Thermal density upper threshold was not applied.'
}
if (-not (Select-String -Path $escposPath -SimpleMatch 'colorbyte_linear > 0x78' -Quiet)) {
    throw 'Thermal density solid-black threshold was not applied.'
}

Write-Host 'Applied POSAgent print-quality fixes: 8x8 Bayer dithering and denser dark text.'
