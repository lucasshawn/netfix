import { describe, it, expect } from 'vitest';
import {
  encryptCredentials,
  decryptCredentials,
  summarizeCredentials,
} from '@/lib/crypto/vault';
import type { AdapterCredentials } from '@/lib/types';

describe('Credential Vault (AES-256-GCM)', () => {
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('encrypts and decrypts SNMP credentials losslessly without exposing secrets in ciphertext', () => {
    const creds: AdapterCredentials = {
      protocol: 'snmp',
      port: 161,
      snmpVersion: '2c',
      community: 'private-homelab-ro',
    };

    const encrypted = encryptCredentials(creds, testKey);
    expect(encrypted).not.toContain('private-homelab-ro');

    const decrypted = decryptCredentials(encrypted, testKey);
    expect(decrypted).toEqual(creds);
  });

  it('summarizes SSH credentials with masked secret fields for safe UI display', () => {
    const creds: AdapterCredentials = {
      protocol: 'ssh',
      port: 22,
      username: 'admin',
      password: 'super-secret-password',
    };

    const summary = summarizeCredentials(creds);
    expect(summary).toEqual({
      protocol: 'ssh',
      port: 22,
      username: 'admin',
      hasSecret: true,
      maskedHint: 'ssh://admin@***:22',
    });
  });
});
