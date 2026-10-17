param(
    [int]$Port = 3000
)

$ErrorActionPreference = "Continue"
$env:Path += ";C:\Program Files\RedHat\Podman;C:\Program Files\nodejs"

$logDir = Join-Path $env:LOCALAPPDATA "Netfix"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "startup.log"
"=== Netfix Auto-Start $(Get-Date -Format o) ===" | Out-File -FilePath $logFile -Encoding utf8

# 1. Wait up to 30s for LAN IPv4 address to come online after reboot
$hostIp = "192.168.68.73"
for ($w = 0; $w -lt 15; $w++) {
    $lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
        $_.IPAddress -like "192.168.*"
    } | Select-Object -ExpandProperty IPAddress
    if ($lanIps) {
        $hostIp = ($lanIps | Select-Object -First 1)
        break
    }
    Start-Sleep -Seconds 2
}
"Detected Host IP: $hostIp" | Out-File -FilePath $logFile -Append -Encoding utf8

# 2. Ensure Podman machine is running
$machineList = podman machine list --format json 2>$null | ConvertFrom-Json
if ($machineList -and $machineList[0].Running -ne $true) {
    "Starting Podman machine..." | Out-File -FilePath $logFile -Append -Encoding utf8
    $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = "podman.exe machine start"
    }
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        $m = podman machine list --format json 2>$null | ConvertFrom-Json
        if ($m -and $m[0].Running -eq $true) { break }
    }
}

# 3. Ensure netfix-hub container is running (or create it if missing)
$containerRunning = podman inspect -f "{{.State.Running}}" netfix-hub 2>$null
if ($containerRunning -ne "true") {
    $containerExists = podman container exists netfix-hub 2>$null
    if ($LASTEXITCODE -eq 0) {
        "Starting existing netfix-hub container..." | Out-File -FilePath $logFile -Append -Encoding utf8
        podman start netfix-hub | Out-File -FilePath $logFile -Append -Encoding utf8
    } else {
        "Creating and starting netfix-hub container..." | Out-File -FilePath $logFile -Append -Encoding utf8
        $localKeyFile = Join-Path $logDir "master.key"
        if (-not (Test-Path $localKeyFile)) {
            $bytes = New-Object byte[] 32
            [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
            $generatedKey = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
            Set-Content -Path $localKeyFile -Value $generatedKey -NoNewline -Encoding Ascii
        }
        $masterKeyHex = (Get-Content -Path $localKeyFile -Raw).Trim()
        $localEnvFile = Join-Path $logDir "netfix.env"
        Set-Content -Path $localEnvFile -Value "NETFIX_MASTER_KEY=$masterKeyHex" -Encoding Ascii
        $arpRaw = (arp -a | Out-String)

        podman run -d `
            --name netfix-hub `
            --restart unless-stopped `
            -p "0.0.0.0:${Port}:3000" `
            --env-file "$localEnvFile" `
            -e "NETFIX_HOSTNAME=$env:COMPUTERNAME" `
            -e "NETFIX_HOST_IP=$hostIp" `
            -e "NETFIX_HOST_ARP=$arpRaw" `
            -v netfix_data:/data `
            --cap-add=NET_RAW `
            --cap-add=NET_ADMIN `
            localhost/netfix:latest | Out-File -FilePath $logFile -Append -Encoding utf8
    }
}

# 4. Ensure lan-proxy.mjs (ports 80, 3000, 3001 + mDNS 5353 + LLMNR 5355) is running
$existingProxy = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "node.exe" -and $_.CommandLine -like "*lan-proxy.mjs*"
}
if (-not $existingProxy) {
    "Starting lan-proxy.mjs..." | Out-File -FilePath $logFile -Append -Encoding utf8
    $proxyScript = Join-Path $PSScriptRoot "lan-proxy.mjs"
    $null = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = "`"C:\Program Files\nodejs\node.exe`" `"$proxyScript`""
    }
}

"=== Netfix Auto-Start Complete ===" | Out-File -FilePath $logFile -Append -Encoding utf8
