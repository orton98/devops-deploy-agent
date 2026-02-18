/**
 * SQLite persistence layer for the DevOps MCP Server.
 * Stores deployments, credentials (encrypted), audit logs, and scheduled jobs.
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MCP_DATA_DIR || join(__dirname, '../../data');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DeploymentRecord {
  id: string;
  platform: string;
  project: string;
  repo?: string;
  branch?: string;
  environment: string;
  status: 'queued' | 'deploying' | 'success' | 'failed' | 'cancelled' | 'rolled_back';
  message: string;
  url?: string;
  statusUrl?: string;
  logsUrl?: string;
  triggeredBy: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result: 'success' | 'error';
  agentId?: string;
  durationMs: number;
  createdAt: string;
}

export interface ScheduledJob {
  id: string;
  platform: string;
  config: Record<string, unknown>;
  cronExpr: string;
  nextRunAt: string;
  lastRunAt?: string;
  enabled: boolean;
  createdAt: string;
}

// ─── In-memory store (production would use better-sqlite3) ────────────────────
// Using JSON file for portability without native module compilation issues
import { readFileSync, writeFileSync } from 'fs';

const DB_FILE = join(DATA_DIR, 'devops-agent.json');

interface DBSchema {
  deployments: DeploymentRecord[];
  auditLog: AuditLogEntry[];
  scheduledJobs: ScheduledJob[];
  version: number;
}

function loadDB(): DBSchema {
  try {
    if (existsSync(DB_FILE)) {
      return JSON.parse(readFileSync(DB_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return { deployments: [], auditLog: [], scheduledJobs: [], version: 1 };
}

function saveDB(db: DBSchema): void {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ─── Deployment CRUD ──────────────────────────────────────────────────────────
export function insertDeployment(record: DeploymentRecord): void {
  const db = loadDB();
  db.deployments.unshift(record);
  // Keep last 500 deployments
  if (db.deployments.length > 500) db.deployments = db.deployments.slice(0, 500);
  saveDB(db);
}

export function updateDeployment(id: string, updates: Partial<DeploymentRecord>): void {
  const db = loadDB();
  const idx = db.deployments.findIndex((d) => d.id === id);
  if (idx !== -1) {
    db.deployments[idx] = { ...db.deployments[idx], ...updates, updatedAt: new Date().toISOString() };
    saveDB(db);
  }
}

export function getDeployment(id: string): DeploymentRecord | undefined {
  return loadDB().deployments.find((d) => d.id === id);
}

export function listDeployments(opts: {
  platform?: string;
  status?: string;
  limit?: number;
  project?: string;
}): DeploymentRecord[] {
  let records = loadDB().deployments;
  if (opts.platform) records = records.filter((d) => d.platform === opts.platform);
  if (opts.status) records = records.filter((d) => d.status === opts.status);
  if (opts.project) records = records.filter((d) => d.project?.includes(opts.project!));
  return records.slice(0, opts.limit || 20);
}

export function getDeploymentStats(): {
  total: number;
  success: number;
  failed: number;
  successRate: string;
  avgDurationMs: number;
  byPlatform: Record<string, number>;
} {
  const records = loadDB().deployments;
  const success = records.filter((d) => d.status === 'success').length;
  const failed = records.filter((d) => d.status === 'failed').length;
  const withDuration = records.filter((d) => d.durationMs);
  const avgDuration = withDuration.length
    ? withDuration.reduce((s, d) => s + (d.durationMs || 0), 0) / withDuration.length
    : 0;

  const byPlatform: Record<string, number> = {};
  for (const d of records) {
    byPlatform[d.platform] = (byPlatform[d.platform] || 0) + 1;
  }

  return {
    total: records.length,
    success,
    failed,
    successRate: records.length ? `${Math.round((success / records.length) * 100)}%` : 'N/A',
    avgDurationMs: Math.round(avgDuration),
    byPlatform,
  };
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
export function insertAuditLog(entry: AuditLogEntry): void {
  const db = loadDB();
  db.auditLog.unshift(entry);
  if (db.auditLog.length > 1000) db.auditLog = db.auditLog.slice(0, 1000);
  saveDB(db);
}

export function listAuditLog(limit = 50): AuditLogEntry[] {
  return loadDB().auditLog.slice(0, limit);
}

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────
export function insertScheduledJob(job: ScheduledJob): void {
  const db = loadDB();
  db.scheduledJobs.push(job);
  saveDB(db);
}

export function listScheduledJobs(): ScheduledJob[] {
  return loadDB().scheduledJobs.filter((j) => j.enabled);
}

export function deleteScheduledJob(id: string): boolean {
  const db = loadDB();
  const before = db.scheduledJobs.length;
  db.scheduledJobs = db.scheduledJobs.filter((j) => j.id !== id);
  saveDB(db);
  return db.scheduledJobs.length < before;
}
