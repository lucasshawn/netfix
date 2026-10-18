import { execFile } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const startScriptPath = path.join(__dirname, 'start-netfix.ps1');

const LOCK_PORT = 3099;
const CHECK_INTERVAL_MS = 15_000;
const appDataDir =
  process.env.LOCALAPPDATA ||
  path.join(os.homedir(), 'AppData', 'Local');
const logDir = path.join(appDataDir, 'Netfix');
const logFile = path.join(logDir, 'watchdog.log');

try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  // Ignore
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    // Rotate log if > 512 KB
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 512 * 1024) {
      fs.writeFileSync(logFile, line, 'utf8');
    } else {
      fs.appendFileSync(logFile, line, 'utf8');
    }
  } catch {
    // Ignore file write errors
  }
}

process.on('uncaughtException', (err) => {
  log(`Uncaught exception (recovered): ${err?.message || err}`);
});
process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection (recovered): ${reason}`);
});

function getPrimaryLanIpv4() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        iface.address.startsWith('192.168.')
      ) {
        return iface.address;
      }
    }
  }
  return '192.168.68.73';
}

function checkHttpOk(url, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => {
      resolve(false);
    });
  });
}

let consecutiveFailures = 0;
let recoveryInProgress = false;

function triggerRecovery(reason) {
  if (recoveryInProgress) return;
  recoveryInProgress = true;
  log(`Triggering Netfix auto-recovery (${reason})...`);

  execFile(
    'powershell.exe',
    [
      '-WindowStyle',
      'Hidden',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      startScriptPath,
    ],
    { timeout: 120_000, windowsHide: true },
    (err) => {
      if (err) {
        log(`Recovery script warning: ${err.message}`);
      } else {
        log('Recovery script completed successfully.');
      }
      consecutiveFailures = 0;
      recoveryInProgress = false;
    }
  );
}

async function runHealthTick() {
  if (recoveryInProgress) return;

  const lanIp = getPrimaryLanIpv4();
  const containerOk = await checkHttpOk('http://127.0.0.1:3000/api/snapshot');
  const lanProxyOk = await checkHttpOk(`http://${lanIp}:80/api/snapshot`);

  if (containerOk && lanProxyOk) {
    if (consecutiveFailures > 0) {
      log(
        `Health restored: container (127.0.0.1:3000) and LAN proxy (${lanIp}:80) are both HTTP 200.`
      );
    }
    consecutiveFailures = 0;
    return;
  }

  consecutiveFailures += 1;
  log(
    `Health check warning #${consecutiveFailures}: containerOk=${containerOk}, lanProxyOk=${lanProxyOk} (${lanIp}:80)`
  );

  if (consecutiveFailures >= 2) {
    triggerRecovery(
      !containerOk
        ? 'container 127.0.0.1:3000 unreachable'
        : `LAN proxy ${lanIp}:80 unreachable`
    );
  }
}

// Acquire single-instance lock on 127.0.0.1:3099
const lockServer = net.createServer((sock) => {
  sock.end('netfix-watchdog-alive\n');
});

lockServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another watchdog instance is already running
    process.exit(0);
  }
});

lockServer.listen(LOCK_PORT, '127.0.0.1', () => {
  log(
    `Netfix Watchdog started (PID ${process.pid}, lock 127.0.0.1:${LOCK_PORT}). Monitoring every ${
      CHECK_INTERVAL_MS / 1000
    }s.`
  );
  runHealthTick();
  setInterval(runHealthTick, CHECK_INTERVAL_MS);
});
