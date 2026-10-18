param(
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

Write-Host "==> Checking Podman machine status on Hub..." -ForegroundColor Cyan
$machineList = podman machine list --format json | ConvertFrom-Json
if (-not $machineList) {
    Write-Host "==> Initializing Podman machine..." -ForegroundColor Yellow
    podman machine init --rootful
    if ($LASTEXITCODE -ne 0) { throw "Failed to initialize Podman machine" }
    $machineList = podman machine list --format json | ConvertFrom-Json
}
if ($machineList -and $machineList[0].Running -ne $true) {
    Write-Host "==> Starting Podman machine..." -ForegroundColor Yellow
    $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="podman.exe machine start"}
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        $m = podman machine list --format json | ConvertFrom-Json
        if ($m -and $m[0].Running -eq $true) { break }
    }
}

# Detect real Windows host LAN IP
$lanIps = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.IPAddress -notlike "172.24.*" -and
    $_.IPAddress -notlike "172.27.*" -and
    $_.InterfaceAlias -notlike "*Loopback*" -and
    $_.InterfaceAlias -notlike "*WSL*" -and
    $_.InterfaceAlias -notlike "*vEthernet*"
} | Select-Object -ExpandProperty IPAddress
$hostIp = if ($lanIps) { ($lanIps | Select-Object -First 1) } else { "192.168.68.73" }
$arpRaw = (arp -a | Out-String)

Write-Host "==> Detected Host IP: $hostIp (Gateway & Deco Mesh will be auto-discovered by container)" -ForegroundColor Cyan

Write-Host "==> Building localhost/netfix:latest container image..." -ForegroundColor Cyan
podman build -t localhost/netfix:latest -f Containerfile .
if ($LASTEXITCODE -ne 0) { throw "Failed to build localhost/netfix:latest image" }

Write-Host "==> Removing any existing netfix-hub container (preserving local encrypted netfix_data volume)..." -ForegroundColor Cyan
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
podman stop -t 2 netfix-hub 2>$null | Out-Null
podman rm -f --ignore netfix-hub 2>$null | Out-Null
$ErrorActionPreference = $prevErrorAction

# Ensure machine-local secret directory exists outside the Git repository (%LOCALAPPDATA%\Netfix)
$localSecretDir = Join-Path $env:LOCALAPPDATA "Netfix"
if (-not (Test-Path $localSecretDir)) {
    New-Item -ItemType Directory -Path $localSecretDir -Force | Out-Null
}
$localKeyFile = Join-Path $localSecretDir "master.key"
if (-not (Test-Path $localKeyFile)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $generatedKey = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
    Set-Content -Path $localKeyFile -Value $generatedKey -NoNewline -Encoding Ascii
    Write-Host "==> Generated new 256-bit AES-GCM master key in $localKeyFile (outside git repo)" -ForegroundColor Green
}
$masterKeyHex = (Get-Content -Path $localKeyFile -Raw).Trim()
$localEnvFile = Join-Path $localSecretDir "netfix.env"
Set-Content -Path $localEnvFile -Value "NETFIX_MASTER_KEY=$masterKeyHex" -Encoding Ascii

Write-Host "==> Starting netfix-hub container on 0.0.0.0:$Port..." -ForegroundColor Cyan
podman run -d `
    --name netfix-hub `
    --restart=always `
    -p "0.0.0.0:${Port}:3000" `
    --env-file "$localEnvFile" `
    -e "NETFIX_HOSTNAME=$env:COMPUTERNAME" `
    -e "NETFIX_HOST_IP=$hostIp" `
    -e "NETFIX_HOST_ARP=$arpRaw" `
    -v netfix_data:/data `
    --cap-add=NET_RAW `
    --cap-add=NET_ADMIN `
    localhost/netfix:latest
if ($LASTEXITCODE -ne 0) { throw "Failed to start netfix-hub container" }

# Configure Windows Firewall rules & LAN mDNS hygiene for Phone & PC access (HTTP 80/3000 + mDNS UDP 5353 + LLMNR UDP 5355)
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private | Out-Null
Get-NetAdapter | Where-Object { $_.Name -like "*vEthernet*" -or $_.Name -like "*WSL*" } | ForEach-Object {
    Set-DnsClient -InterfaceIndex $_.ifIndex -RegisterThisConnectionsAddress $false | Out-Null
}
Remove-NetFirewallRule -DisplayName "Netfix LAN HTTP (80, 3000)" | Out-Null
Remove-NetFirewallRule -DisplayName "Netfix LAN mDNS (UDP 5353)" | Out-Null
New-NetFirewallRule -DisplayName "Netfix LAN HTTP (80, 3000)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80, $Port, 3001 -Profile Any | Out-Null
New-NetFirewallRule -DisplayName "Netfix LAN mDNS (UDP 5353)" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 5353, 5355, 137 -Profile Any | Out-Null

# Add netfix.local / netfix to Windows hosts file if running as Administrator
$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsFile) {
    $hostsContent = Get-Content $hostsFile -Raw
    if ($hostsContent -notmatch "netfix\.local") {
        Add-Content -Path $hostsFile -Value "`r`n127.0.0.1 netfix.local netfix"
    }
}
$ErrorActionPreference = $prevErrorAction

# Start user-space LAN TCP forwarder (ports 80 & 3000) + mDNS/LLMNR responder (netfix.local / hub.local)
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -like "*lan-proxy.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
$proxyScript = Join-Path $PSScriptRoot "lan-proxy.mjs"
$null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "`"C:\Program Files\nodejs\node.exe`" `"$proxyScript`""
}

# Start continuous 15-second self-healing watchdog (watchdog-netfix.mjs)
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -like "*watchdog-netfix.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
$watchdogScript = Join-Path $PSScriptRoot "watchdog-netfix.mjs"
$null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "`"C:\Program Files\nodejs\node.exe`" `"$watchdogScript`""
}
Start-Sleep -Seconds 2

# Register automatic startup & periodic watchdog on PC reboot / logon (Scheduled Task + Startup VBS + Registry Run)
$startScript = Join-Path $PSScriptRoot "start-netfix.ps1"
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0)
Register-ScheduledTask -TaskName "Netfix-AutoStart" -Action $taskAction -Trigger @($triggerLogon, $triggerBoot) -Settings $taskSettings -RunLevel Highest -Force | Out-Null
schtasks.exe /Create /TN "Netfix-Watchdog" /TR "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" /SC MINUTE /MO 5 /F | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "NetfixAutoStart" -Value "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" -Force | Out-Null

$startupFolder = [Environment]::GetFolderPath('Startup')
if ($startupFolder -and (Test-Path $startupFolder)) {
    $vbsPath = Join-Path $startupFolder "netfix-watchdog.vbs"
    $vbsLines = @(
        "' Netfix Always-Up Startup & Watchdog Launcher",
        "Set WshShell = CreateObject(""WScript.Shell"")",
        "WshShell.Run ""powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File """"$startScript"""""", 0, False",
        "Set WshShell = Nothing"
    )
    Set-Content -Path $vbsPath -Value ($vbsLines -join "`r`n") -Encoding Ascii
}
$ErrorActionPreference = $prevErrorAction

Write-Host "`n[OK] Netfix is live in Podman on Hub!" -ForegroundColor Green
Write-Host "   - Named LAN URL (Phone & PC): http://netfix.local  (or http://netfix.local:$Port)"
Write-Host "   - Host mDNS URL (Phone & PC): http://$($env:COMPUTERNAME.ToLower()).local  (or http://$($env:COMPUTERNAME.ToLower()).local:$Port)"
foreach ($ip in $lanIps) {
    Write-Host "   - Direct LAN IP URL:          http://${ip}:$Port"
}
Write-Host "   - Always-Up Supervision:      Active (15s Node Watchdog + 5m Task Scheduler + Startup VBS + Run Key)"
Write-Host "   - Gateway Auto-Discovery:     Active via Traceroute + UPnP IGD (192.168.68.1 Main Deco Unit)"


