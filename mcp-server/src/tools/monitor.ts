/**
 * Monitoring tools: watch deployment, stream logs, health check, metrics.
 */

import { getCredentials } from '../vault.js';
import { updateDeployment } from '../db.js';

// ─── watch_deployment ─────────────────────────────────────────────────────────
/**
 * Poll until a deployment completes (or times out).
 * Returns final status.
 */
export async function watchDeployment(
  deploymentId: string,
  platform: string,
  repo?: string,
  timeoutMs = 300_000 // 5 minutes
): Promise<{ status: string; conclusion?: string; url?: string; durationMs: number }> {
  const start = Date.now();
  const pollInterval = 10_000; // 10s

  while (Date.now() - start < timeoutMs) {
    const status = await checkDeploymentStatus(deploymentId, platform, repo);

    if (status.completed) {
      const durationMs = Date.now() - start;
      updateDeployment(deploymentId, {
        status: status.success ? 'success' : 'failed',
        durationMs,
        url: status.url,
      });
      return { status: status.status, conclusion: status.conclusion, url: status.url, durationMs };
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return { status: 'timeout', durationMs: Date.now() - start };
}

// ─── check_deployment_status (internal) ──────────────────────────────────────
async function checkDeploymentStatus(
  deploymentId: string,
  platform: string,
  repo?: string
): Promise<{ completed: boolean; success: boolean; status: string; conclusion?: string; url?: string }> {
  if (platform === 'github' && /^\d+$/.test(deploymentId)) {
    const creds = getCredentials('github');
    const targetRepo = repo || creds.defaultRepo;
    if (!creds.token || !targetRepo) {
      return { completed: true, success: false, status: 'error' };
    }

    const res = await fetch(
      `https://api.github.com/repos/${targetRepo}/actions/runs/${deploymentId}`,
      {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
        },
      }
    );
    const run = await res.json() as Record<string, unknown>;
    const completed = run.status === 'completed';
    return {
      completed,
      success: completed && run.conclusion === 'success',
      status: run.status as string,
      conclusion: run.conclusion as string | undefined,
      url: run.html_url as string | undefined,
    };
  }

  if (platform === 'render') {
    const creds = getCredentials('render');
    if (!creds.apiKey || !creds.serviceId) {
      return { completed: true, success: false, status: 'error' };
    }
    const res = await fetch(
      `https://api.render.com/v1/services/${creds.serviceId}/deploys/${deploymentId}`,
      { headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: 'application/json' } }
    );
    const data = await res.json() as Record<string, unknown>;
    const status = data.status as string;
    const completed = ['live', 'failed', 'canceled', 'deactivated'].includes(status);
    return { completed, success: status === 'live', status };
  }

  // Default: assume still running
  return { completed: false, success: false, status: 'in_progress' };
}

// ─── get_deployment_logs_stream ───────────────────────────────────────────────
/**
 * Fetch recent logs from a deployment.
 */
export async function getDeploymentLogsStream(
  deploymentId: string,
  platform: string,
  repo?: string,
  lines = 50
): Promise<{ logs: string[]; url?: string }> {
  if (platform === 'github' && /^\d+$/.test(deploymentId)) {
    const creds = getCredentials('github');
    const targetRepo = repo || creds.defaultRepo;
    if (!creds.token || !targetRepo) {
      return { logs: ['Error: GitHub credentials not configured'] };
    }

    // Get jobs for this run
    const res = await fetch(
      `https://api.github.com/repos/${targetRepo}/actions/runs/${deploymentId}/jobs`,
      {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
        },
      }
    );
    const data = await res.json() as { jobs?: Array<Record<string, unknown>> };
    const jobs = data.jobs || [];

    const logLines: string[] = [];
    for (const job of jobs.slice(0, 3)) {
      logLines.push(`\n=== Job: ${job.name} (${job.status}/${job.conclusion || 'running'}) ===`);
      const steps = (job.steps as Array<Record<string, unknown>>) || [];
      for (const step of steps) {
        const icon = step.conclusion === 'success' ? '✅' : step.conclusion === 'failure' ? '❌' : step.status === 'in_progress' ? '🔄' : '⏳';
        logLines.push(`  ${icon} ${step.name} (${step.conclusion || step.status})`);
      }
    }

    return {
      logs: logLines.slice(-lines),
      url: `https://github.com/${targetRepo}/actions/runs/${deploymentId}`,
    };
  }

  return { logs: [`Log streaming not yet supported for platform: ${platform}`] };
}

// ─── check_service_health ─────────────────────────────────────────────────────
/**
 * HTTP health check on a deployed URL.
 */
export async function checkServiceHealth(
  url: string,
  expectedStatus = 200,
  timeoutMs = 10_000
): Promise<{
  healthy: boolean;
  statusCode?: number;
  responseTimeMs: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0' },
    });
    clearTimeout(timer);

    const responseTimeMs = Date.now() - start;
    const healthy = res.status === expectedStatus;

    return { healthy, statusCode: res.status, responseTimeMs };
  } catch (err) {
    return {
      healthy: false,
      responseTimeMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

// ─── get_platform_metrics ─────────────────────────────────────────────────────
/**
 * Get CPU/memory/request metrics for a deployed service.
 */
export async function getPlatformMetrics(
  platform: string,
  serviceId?: string
): Promise<Record<string, unknown>> {
  if (platform === 'render') {
    const creds = getCredentials('render');
    const id = serviceId || creds.serviceId;
    if (!creds.apiKey || !id) {
      return { error: 'Render API key and service ID required' };
    }

    const res = await fetch(`https://api.render.com/v1/services/${id}`, {
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: 'application/json' },
    });
    const data = await res.json() as Record<string, unknown>;
    return {
      platform: 'render',
      serviceId: id,
      name: data.name,
      status: (data as Record<string, Record<string, unknown>>).serviceDetails?.pullRequestPreviewsEnabled,
      url: data.serviceDetails,
      note: 'Detailed metrics available in Render dashboard',
    };
  }

  if (platform === 'digitalocean') {
    const creds = getCredentials('digitalocean');
    const id = serviceId || creds.appId;
    if (!creds.token || !id) {
      return { error: 'DigitalOcean token and app ID required' };
    }

    const res = await fetch(`https://api.digitalocean.com/v2/apps/${id}/metrics/bandwidth/daily`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    if (!res.ok) {
      return { error: `DigitalOcean metrics error: HTTP ${res.status}` };
    }
    const data = await res.json() as Record<string, unknown>;
    return { platform: 'digitalocean', appId: id, ...data };
  }

  return { error: `Metrics not yet supported for platform: ${platform}` };
}
