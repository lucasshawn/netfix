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

# Detect real Windows host LAN IP and Default Gateway
$defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Sort-Object RouteMetric | Select-Object -First 1
$gatewayIp = if ($defaultRoute -and $defaultRoute.NextHop) { $defaultRoute.NextHop } else { "192.168.68.1" }
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

Write-Host "==> Detected Host IP: $hostIp | Gateway IP: $gatewayIp" -ForegroundColor Cyan

Write-Host "==> Building localhost/netfix:latest container image..." -ForegroundColor Cyan
podman build -t localhost/netfix:latest -f Containerfile .
if ($LASTEXITCODE -ne 0) { throw "Failed to build localhost/netfix:latest image" }

Write-Host "==> Removing any existing netfix-hub container..." -ForegroundColor Cyan
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
podman stop -t 2 netfix-hub 2>$null | Out-Null
podman rm -f --ignore netfix-hub 2>$null | Out-Null
podman volume rm -f netfix_data 2>$null | Out-Null
$ErrorActionPreference = $prevErrorAction

Write-Host "==> Starting netfix-hub container on 0.0.0.0:$Port..." -ForegroundColor Cyan
podman run -d `
    --name netfix-hub `
    --restart unless-stopped `
    -p "0.0.0.0:${Port}:3000" `
    -e "NETFIX_HOSTNAME=$env:COMPUTERNAME" `
    -e "NETFIX_HOST_IP=$hostIp" `
    -e "NETFIX_GATEWAY_IP=$gatewayIp" `
    -e "NETFIX_ISP_IP=50.35.64.1" `
    -e "NETFIX_HOST_ARP=$arpRaw" `
    -v netfix_data:/data `
    --cap-add=NET_RAW `
    --cap-add=NET_ADMIN `
    localhost/netfix:latest
if ($LASTEXITCODE -ne 0) { throw "Failed to start netfix-hub container" }

# Start user-space LAN TCP forwarder so LAN interfaces (e.g. 192.168.68.73:3000) reach Podman 127.0.0.1:3000
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*lan-proxy.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
$bindList = ($lanIps -join ",")
$proxyScript = Join-Path $PSScriptRoot "lan-proxy.mjs"
$env:NETFIX_PORT = "$Port"
$env:NETFIX_BIND_IPS = $bindList
$null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = "cmd.exe /c set NETFIX_PORT=$Port&& set NETFIX_BIND_IPS=$bindList&& node `"$proxyScript`""
}

Write-Host "`n[OK] Netfix is live in Podman on Hub!" -ForegroundColor Green
Write-Host "   - Local PC URL:   http://localhost:$Port"
Write-Host "   - Hostname URL:   http://$($env:COMPUTERNAME.ToLower()):$Port"
foreach ($ip in $lanIps) {
    Write-Host "   - Phone LAN URL:  http://${ip}:$Port"
}
Write-Host "   - Gateway Host:   http://${gatewayIp} (TP-Link Deco X60 IGD)"
