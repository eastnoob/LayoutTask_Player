param(
  [Parameter(Mandatory = $true)][string]$ModelPath,
  [Parameter(Mandatory = $true)][string]$ModelId,
  [Parameter(Mandatory = $true)][ValidateSet('all', 'variable')][string]$CaptureMode,
  [Parameter(Mandatory = $true)][string]$OutDir
)

$rhino = 'D:\PROSW\Rhino 8\System\Rhino.exe'
$script = 'D:\PROJECTS\web\LayoutTask\LayoutTask_Player\.worktrees\furniture-reference-board-tutorial\tools\rhino_capture_tutorial_turntable.py'
$scriptMacro = $script.Replace('\', '/')

New-Item -ItemType Directory -Force $OutDir | Out-Null
Remove-Item -Path (Join-Path $OutDir "$ModelId`_*.png") -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "$ModelId`_metadata.json") -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "$ModelId`_stage.log") -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $OutDir "$ModelId`_error.log") -ErrorAction SilentlyContinue

$env:LAYOUTTASK_CAPTURE_OUT = $OutDir
$env:LAYOUTTASK_CAPTURE_ID = $ModelId
$env:LAYOUTTASK_CAPTURE_MODEL = $ModelPath
$env:LAYOUTTASK_CAPTURE_MODE = $CaptureMode

$args = @(
  '/nosplash',
  '/newinstance',
  "/runscript=`"_-RunPythonScript ($scriptMacro)`""
)

$process = Start-Process -FilePath $rhino -ArgumentList $args -PassThru
Wait-Process -Id $process.Id -Timeout 180 -ErrorAction SilentlyContinue

if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
  Stop-Process -Id $process.Id -Force
  throw "Rhino capture timed out for $ModelId"
}

Get-ChildItem -LiteralPath $OutDir -Filter "$ModelId`_*" | Select-Object Name,Length,LastWriteTime
