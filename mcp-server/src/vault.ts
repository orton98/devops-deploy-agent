/**
 * Encrypted credential vault for the DevOps MCP Server.
 * Stores platform tokens securely using AES-256-GCM encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MCP_DATA_DIR || join(__dirname, '../../data');
const VAULT_FILE = join(DATA_DIR, 'vault.enc.json');

// Derive 32-byte key from passphrase
const VAULT_KEY = process.env.MCP_VAULT_KEY || 'devops-agent-default-vault-key-32c';
const KEY = createHash('sha256').update(VAULT_KEY).digest();

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PlatformCredentials {
  platform: string;
  [key: string]: string;
}

interface VaultData {
  credentials: Record<string, Record<string, string>>;
  updatedAt: string;
}

// ─── Encryption ───────────────────────────────────────────────────────────────
function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  });
}

function decrypt(encryptedJson: string): string {
  const { iv, tag, data } = JSON.parse(encryptedJson);
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
}

// ─── Vault Operations ─────────────────────────────────────────────────────────
function loadVault(): VaultData {
  try {
    if (existsSync(VAULT_FILE)) {
      const raw = readFileSync(VAULT_FILE, 'utf-8');
      return JSON.parse(decrypt(raw));
    }
  } catch {
    // ignore — return empty vault
  }
  return { credentials: {}, updatedAt: new Date().toISOString() };
}

function saveVault(data: VaultData): void {
  data.updatedAt = new Date().toISOString();
  writeFileSync(VAULT_FILE, encrypt(JSON.stringify(data)));
}

/**
 * Store credentials for a platform.
 * Merges with existing credentials (doesn't overwrite unrelated keys).
 */
export function storeCredentials(platform: string, creds: Record<string, string>): void {
  const vault = loadVault();
  vault.credentials[platform] = { ...(vault.credentials[platform] || {}), ...creds };
  saveVault(vault);
}

/**
 * Retrieve credentials for a platform.
 * Falls back to environment variables if not in vault.
 */
export function getCredentials(platform: string): Record<string, string> {
  const vault = loadVault();
  const stored = vault.credentials[platform] || {};

  // Merge with env vars (env vars take precedence for security)
  const envFallbacks: Record<string, Record<string, string>> = {
    github: {
      token: process.env.GITHUB_TOKEN || '',
      defaultRepo: process.env.GITHUB_DEFAULT_REPO || '',
      defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main',
      workflowFile: process.env.GITHUB_WORKFLOW_FILE || 'deploy.yml',
    },
    railway: {
      token: process.env.RAILWAY_TOKEN || '',
      projectId: process.env.RAILWAY_PROJECT_ID || '',
      environment: process.env.RAILWAY_ENVIRONMENT || 'production',
    },
    cloudflare: {
      token: process.env.CLOUDFLARE_TOKEN || '',
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      projectName: process.env.CLOUDFLARE_PROJECT_NAME || '',
    },
    render: {
      apiKey: process.env.RENDER_API_KEY || '',
      serviceId: process.env.RENDER_SERVICE_ID || '',
    },
    digitalocean: {
      token: process.env.DO_TOKEN || '',
      appId: process.env.DO_APP_ID || '',
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      appId: process.env.AWS_AMPLIFY_APP_ID || '',
    },
    vercel: {
      token: process.env.VERCEL_TOKEN || '',
      teamId: process.env.VERCEL_TEAM_ID || '',
      projectId: process.env.VERCEL_PROJECT_ID || '',
    },
    flyio: {
      token: process.env.FLY_API_TOKEN || '',
      appName: process.env.FLY_APP_NAME || '',
    },
    netlify: {
      token: process.env.NETLIFY_TOKEN || '',
      siteId: process.env.NETLIFY_SITE_ID || '',
    },
    slack: {
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
      botToken: process.env.SLACK_BOT_TOKEN || '',
    },
    discord: {
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    },
  };

  const envCreds = envFallbacks[platform] || {};
  // Stored vault creds override env vars (user explicitly set them)
  return { ...envCreds, ...stored };
}

/**
 * List which platforms have credentials stored.
 */
export function listStoredPlatforms(): string[] {
  return Object.keys(loadVault().credentials);
}

/**
 * Delete credentials for a platform from the vault.
 */
export function deleteCredentials(platform: string): boolean {
  const vault = loadVault();
  if (vault.credentials[platform]) {
    delete vault.credentials[platform];
    saveVault(vault);
    return true;
  }
  return false;
}

/**
 * Check if a platform has any credentials (vault or env).
 */
export function hasCredentials(platform: string): boolean {
  const creds = getCredentials(platform);
  return Object.values(creds).some((v) => v && v.length > 0);
}
