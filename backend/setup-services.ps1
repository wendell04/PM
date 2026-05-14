# Run this script as Administrator
# Sets up LaravelReverb and LaravelScheduler as Windows Task Scheduler tasks

$phpPath = (Get-Command php -ErrorAction SilentlyContinue).Source
if (-not $phpPath) {
    Write-Error "PHP not found in PATH. Install XAMPP or add PHP to your PATH first."
    exit 1
}

$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "PHP found at: $phpPath"
Write-Host "Backend path: $backendPath"

function Register-LaravelTask {
    param($name, $arguments)

    $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "$name already exists, skipping."
        return
    }

    $action  = New-ScheduledTaskAction -Execute $phpPath -Argument $arguments -WorkingDirectory $backendPath
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest

    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal
    Write-Host "$name registered."
}

Register-LaravelTask -name "LaravelReverb"    -arguments "$backendPath\artisan reverb:start"
Register-LaravelTask -name "LaravelScheduler" -arguments "$backendPath\artisan schedule:work"

Start-ScheduledTask -TaskName "LaravelReverb"
Start-ScheduledTask -TaskName "LaravelScheduler"

Write-Host ""
Write-Host "Done. Both services are now running and will auto-start on reboot."
