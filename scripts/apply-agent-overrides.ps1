$ErrorActionPreference = 'Stop'

$sourceDir = Join-Path $PSScriptRoot '..\agent-src'

if (-not (Test-Path $sourceDir)) {
    throw "POSAgent source directory was not found: $sourceDir"
}

$mainPath = Join-Path $sourceDir 'main.cpp'
$main = Get-Content $mainPath -Raw

$appAnchor = 'QApplication a(argc, argv);'
if ($main -notmatch 'setApplicationName\(QStringLiteral\("DSoft POS Printer Agent"\)\)') {
    if ($main -notmatch [regex]::Escape($appAnchor)) {
        throw 'Could not locate QApplication creation in main.cpp.'
    }

    $appReplacement = @'
QApplication a(argc, argv);
  a.setOrganizationName(QStringLiteral("DSoft"));
  a.setApplicationName(QStringLiteral("DSoft POS Printer Agent"));
'@
    $main = $main.Replace($appAnchor, $appReplacement.TrimEnd())
}

Set-Content -Path $mainPath -Value $main -NoNewline -Encoding utf8

$mainWindowPath = Join-Path $sourceDir 'mainwindow.cpp'
$mainWindow = Get-Content $mainWindowPath -Raw

$setupAnchor = 'ui->setupUi(this);'
if ($mainWindow -notmatch 'setWindowTitle\(QStringLiteral\("DSoft POS Printer Agent"\)\)') {
    if ($mainWindow -notmatch [regex]::Escape($setupAnchor)) {
        throw 'Could not locate setupUi call in mainwindow.cpp.'
    }

    $windowReplacement = @'
ui->setupUi(this);
  setWindowTitle(QStringLiteral("DSoft POS Printer Agent"));
'@
    $mainWindow = $mainWindow.Replace($setupAnchor, $windowReplacement.TrimEnd())
}

# Keep the original single-printer engine and slow the UI timer slightly to
# reduce unnecessary CPU usage on low-spec customer terminals.
$mainWindow = $mainWindow.Replace('t->setInterval(100);', 't->setInterval(500);')

Set-Content -Path $mainWindowPath -Value $mainWindow -NoNewline -Encoding utf8

if (-not (Select-String -Path $mainPath -SimpleMatch 'DSoft POS Printer Agent' -Quiet)) {
    throw 'DSoft application name was not applied.'
}
if (-not (Select-String -Path $mainWindowPath -SimpleMatch 'DSoft POS Printer Agent' -Quiet)) {
    throw 'DSoft window title was not applied.'
}

& (Join-Path $PSScriptRoot 'apply-print-quality-fixes.ps1')

Write-Host 'Applied minimal DSoft single-printer mode.'
Write-Host 'No profiles, routing dashboard, login, queue service, startup manager, or extra status services were added.'
