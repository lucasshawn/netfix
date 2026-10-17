import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AdapterCredentials, CredentialSummary } from '@/lib/types';

let cachedLocalKeyHex: string | null = null;

function getOrCreateLocalMasterKeyHex(): string {
  if (process.env.NETFIX_MASTER_KEY) {
    return process.env.NETFIX_MASTER_KEY;
  }
  if (cachedLocalKeyHex) {
    return cachedLocalKeyHex;
  }

  const dbPath =
    process.env.NETFIX_DB_PATH || path.join(process.cwd(), 'data', 'netfix.db');
  const keyDir =
    dbPath === ':memory:' ? path.join(process.cwd(), 'data') : path.dirname(dbPath);
  const keyFile = path.join(keyDir, '.netfix-master.key');

  try {
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile, 'utf8').trim();
      if (existing.length >= 64) {
        cachedLocalKeyHex = existing;
        return existing;
      }
    }
    fs.mkdirSync(keyDir, { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyFile, generated, { encoding: 'utf8', mode: 0o600 });
    cachedLocalKeyHex = generated;
    return generated;
  } catch {
    // Ephemeral in-memory key if filesystem is read-only
    if (!cachedLocalKeyHex) {
      cachedLocalKeyHex = crypto.randomBytes(32).toString('hex');
    }
    return cachedLocalKeyHex;
  }
}

function resolveKeyBuffer(secretKeyHex?: string): Buffer {
  const hex = secretKeyHex || getOrCreateLocalMasterKeyHex();
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    return crypto.createHash('sha256').update(hex).digest();
  }
  return buf;
}

export function encryptCredentials(
  creds: AdapterCredentials,
  secretKeyHex?: string
): string {
  const key = resolveKeyBuffer(secretKeyHex);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(creds);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptCredentials(
  payload: string,
  secretKeyHex?: string
): AdapterCredentials {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted credential payload format');
  }
  const key = resolveKeyBuffer(secretKeyHex);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as AdapterCredentials;
}

export function summarizeCredentials(
  creds: AdapterCredentials
): CredentialSummary {
  const hasSecret = Boolean(
    creds.password || creds.privateKey || creds.community || creds.apiToken
  );

  let maskedHint = `${creds.protocol.toUpperCase()}`;
  if (creds.protocol === 'ssh') {
    maskedHint = `ssh://${creds.username || 'root'}@***:${creds.port || 22}`;
  } else if (creds.protocol === 'snmp') {
    maskedHint = `snmp v${creds.snmpVersion || '2c'} (community: ***) :${creds.port || 161}`;
  } else if (creds.protocol === 'http') {
    maskedHint = `${creds.endpointUrl || 'http://device/api'} (token: ***)`;
  } else if (creds.protocol === 'upnp') {
    maskedHint = 'UPnP IGD Auto-Telemetry';
  }

  return {
    protocol: creds.protocol,
    port: creds.port,
    username: creds.username,
    snmpVersion: creds.snmpVersion,
    endpointUrl: creds.endpointUrl,
    hasSecret,
    maskedHint,
  };
}
