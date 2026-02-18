#!/usr/bin/env node
/**
 * DevOps Deploy Agent — MCP Server
 *
 * Exposes the DevOps Agent as an MCP tool server so AI agents
 * (Claude, Cursor, Copilot, etc.) can deploy apps with natural language.
 *
 * Tools:
 *   - deploy              → trigger deployment to any platform
 *   - setup_platform      → create repo/project/service on a platform
 *   - test_connection     → verify API credentials
 *   - get_deployment_status → poll deployment status
 *   - list_platforms      → list available platforms + config status
 *   - get_deployment_logs → fetch recent deployment history
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// ─── Config ───────────────────────────────────────────────────────────────────
const AGENT_URL = process.env.DEVOPS_AGENT_URL || 'http://localhost';
const API_KEY = process.env.DEVOPS_AGENT_API_KEY || '';

// Platform tokens (can be set per-tool or globally here)
const PLATFORM_SETTINGS = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    defaultRepo: process.env.GITHUB_DEFAULT_REPO || '',
    defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main',
    workflowFile: process.env.GITHUB_WORKFLOW_FILE || 'deploy.yml',
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'us-east-1',
    appId: process.env.AWS_AMPLIFY_APP_ID || '',
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
};

// In-memory deployment log (persists for session)
const deploymentLog: Array<{
  id: string;
  platform: string;
  status: string;
  message: string;
  url?: string;
  timestamp: string;
}> = [];

// ─── HTTP Helper ──────────────────────────────────────────────────────────────
async function callAgentAPI(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) headers['X-API-Key'] = API_KEY;

  const res = await fetch(`${AGENT_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as Record<string, unknown>;
  return data;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────
const server = new Server(
  {
    name: 'devops-deploy-agent',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ─── Tool Definitions ─────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'deploy',
      description:
        'Trigger a deployment to a platform (GitHub Pages, Railway, Cloudflare Pages, Render, DigitalOcean, AWS Amplify). Returns deployment ID and status URL.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['github', 'railway', 'cloudflare', 'render', 'digitalocean', 'aws'],
            description: 'Target deployment platform',
          },
          repo: {
            type: 'string',
            description: 'GitHub repo in "owner/name" format (GitHub only)',
          },
          branch: {
            type: 'string',
            description: 'Branch to deploy (default: main)',
          },
          project: {
            type: 'string',
            description: 'Project/app name',
          },
          environment: {
            type: 'string',
            description: 'Target environment (production, staging, etc.)',
          },
          // Override tokens per-call (optional — falls back to env vars)
          token: {
            type: 'string',
            description: 'Platform API token (optional — uses env var if not provided)',
          },
        },
        required: ['platform'],
      },
    },
    {
      name: 'setup_platform',
      description:
        'One-click setup: creates a repo/project/service/app on the target platform and returns the IDs needed for future deployments. Run this before the first deploy.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['github', 'railway', 'cloudflare', 'render', 'digitalocean', 'aws'],
            description: 'Platform to set up',
          },
          project_name: {
            type: 'string',
            description: 'Name for the new repo/project/service/app',
          },
          token: {
            type: 'string',
            description: 'Platform API token (optional — uses env var if not provided)',
          },
        },
        required: ['platform', 'project_name'],
      },
    },
    {
      name: 'test_connection',
      description:
        'Test API credentials for a platform. Returns connection status and account info.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['github', 'railway', 'cloudflare', 'render', 'digitalocean', 'aws'],
            description: 'Platform to test',
          },
          token: {
            type: 'string',
            description: 'API token to test (optional — uses env var if not provided)',
          },
        },
        required: ['platform'],
      },
    },
    {
      name: 'get_deployment_status',
      description:
        'Check the current status of a deployment by ID. Returns status, logs URL, and live URL when complete.',
      inputSchema: {
        type: 'object',
        properties: {
          deployment_id: {
            type: 'string',
            description: 'Deployment ID returned by the deploy tool',
          },
          platform: {
            type: 'string',
            enum: ['github', 'railway', 'cloudflare', 'render', 'digitalocean', 'aws'],
            description: 'Platform the deployment is on',
          },
          repo: {
            type: 'string',
            description: 'GitHub repo (required for GitHub platform)',
          },
        },
        required: ['deployment_id', 'platform'],
      },
    },
    {
      name: 'list_platforms',
      description:
        'List all available deployment platforms and whether they are configured (have API tokens set).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_deployment_logs',
      description:
        'Get the recent deployment history from this session.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max number of entries to return (default: 10)',
          },
          platform: {
            type: 'string',
            description: 'Filter by platform (optional)',
          },
        },
      },
    },
  ],
}));

// ─── Tool Handlers ────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'deploy':
        return await handleDeploy(args as Record<string, string>);
      case 'setup_platform':
        return await handleSetupPlatform(args as Record<string, string>);
      case 'test_connection':
        return await handleTestConnection(args as Record<string, string>);
      case 'get_deployment_status':
        return await handleGetStatus(args as Record<string, string>);
      case 'list_platforms':
        return handleListPlatforms();
      case 'get_deployment_logs':
        return handleGetLogs(args as Record<string, string | number>);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new McpError(ErrorCode.InternalError, `Tool "${name}" failed: ${msg}`);
  }
});

// ─── deploy ───────────────────────────────────────────────────────────────────
async function handleDeploy(args: Record<string, string>) {
  const platform = args.platform;
  if (!platform) throw new McpError(ErrorCode.InvalidParams, 'platform is required');

  // Build settings — merge env vars with any per-call overrides
  const settings = buildSettings(platform, args.token);
  const config = {
    repo: args.repo || (settings as Record<string, string>).defaultRepo || '',
    branch: args.branch || 'main',
    project: args.project || '',
    env: args.environment || 'production',
  };

  const data = await callAgentAPI('/api/deploy', 'POST', {
    platform,
    settings,
    config,
  });

  // Log it
  const entry = {
    id: (data.deploymentId as string) || `${platform}-${Date.now()}`,
    platform,
    status: (data.status as string) || (data.success ? 'queued' : 'failed'),
    message: (data.message as string) || (data.error as string) || '',
    url: data.url as string | undefined,
    timestamp: new Date().toISOString(),
  };
  deploymentLog.unshift(entry);

  if (!data.success) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Deploy failed: ${data.error}\n\nHint: ${data.hint || 'Check your API credentials in Settings or env vars.'}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: [
          `✅ Deployment triggered!`,
          `Platform: ${platform}`,
          `Deployment ID: ${data.deploymentId}`,
          `Status: ${data.status}`,
          `Message: ${data.message}`,
          data.url ? `URL: ${data.url}` : '',
          data.statusUrl ? `Status URL: ${data.statusUrl}` : '',
          `\nUse get_deployment_status(deployment_id="${data.deploymentId}", platform="${platform}") to check progress.`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  };
}

// ─── setup_platform ───────────────────────────────────────────────────────────
async function handleSetupPlatform(args: Record<string, string>) {
  const { platform, project_name, token } = args;
  if (!platform) throw new McpError(ErrorCode.InvalidParams, 'platform is required');
  if (!project_name) throw new McpError(ErrorCode.InvalidParams, 'project_name is required');

  const settings = buildSettings(platform, token);

  const data = await callAgentAPI('/api/platform-setup', 'POST', {
    platform,
    settings,
    repoName: project_name,
  });

  const steps = (data.steps as Array<{ step: string; status: string; detail?: string }>) || [];
  const stepsText = steps
    .map((s) => `  ${s.status === 'ok' ? '✅' : '❌'} ${s.step}${s.detail ? ` — ${s.detail}` : ''}`)
    .join('\n');

  if (!data.success) {
    let hint = '';
    if (data.hint === 'create_repo_manually') {
      hint = `\n\n👉 Your token cannot create repos. Create it manually at:\n${data.createRepoUrl}\nThen run setup_platform again to push files.`;
    }
    return {
      content: [
        {
          type: 'text',
          text: `❌ Setup failed: ${data.error}\n\nSteps completed:\n${stepsText}${hint}`,
        },
      ],
    };
  }

  const result = data.result as Record<string, string>;
  const resultLines = [
    `✅ Platform setup complete!`,
    `\nSteps:\n${stepsText}`,
    `\nResult:`,
    result.message,
    result.repoUrl ? `Repo: ${result.repoUrl}` : '',
    result.pagesUrl ? `Pages URL: ${result.pagesUrl}` : '',
    result.projectUrl ? `Project: ${result.projectUrl}` : '',
    result.serviceUrl ? `Service: ${result.serviceUrl}` : '',
    result.appUrl ? `App: ${result.appUrl}` : '',
    result.defaultRepo ? `\n📋 Save this — Default Repo: ${result.defaultRepo}` : '',
    result.projectId ? `📋 Save this — Project ID: ${result.projectId}` : '',
    result.serviceId ? `📋 Save this — Service ID: ${result.serviceId}` : '',
    result.appId ? `📋 Save this — App ID: ${result.appId}` : '',
    result.projectName ? `📋 Save this — Project Name: ${result.projectName}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    content: [{ type: 'text', text: resultLines }],
  };
}

// ─── test_connection ──────────────────────────────────────────────────────────
async function handleTestConnection(args: Record<string, string>) {
  const { platform, token } = args;
  if (!platform) throw new McpError(ErrorCode.InvalidParams, 'platform is required');

  const settings = buildSettings(platform, token);

  const data = await callAgentAPI('/api/test-connection', 'POST', {
    platform,
    settings,
  });

  const icon = data.success ? '✅' : '❌';
  return {
    content: [
      {
        type: 'text',
        text: `${icon} ${platform}: ${data.message || data.error}`,
      },
    ],
  };
}

// ─── get_deployment_status ────────────────────────────────────────────────────
async function handleGetStatus(args: Record<string, string>) {
  const { deployment_id, platform, repo } = args;
  if (!deployment_id) throw new McpError(ErrorCode.InvalidParams, 'deployment_id is required');
  if (!platform) throw new McpError(ErrorCode.InvalidParams, 'platform is required');

  // For GitHub: poll the Actions API directly
  if (platform === 'github') {
    const token = PLATFORM_SETTINGS.github.token;
    const targetRepo = repo || PLATFORM_SETTINGS.github.defaultRepo;

    if (!token || !targetRepo) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Cannot check GitHub status: GITHUB_TOKEN and GITHUB_DEFAULT_REPO env vars required.\nCheck manually: https://github.com/${targetRepo || 'your-repo'}/actions`,
          },
        ],
      };
    }

    // If deployment_id looks like a run ID (numeric)
    if (/^\d+$/.test(deployment_id)) {
      const res = await fetch(
        `https://api.github.com/repos/${targetRepo}/actions/runs/${deployment_id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'DevOps-Deploy-Agent-MCP/1.0',
          },
        }
      );
      const run = await res.json() as Record<string, unknown>;

      const statusEmoji =
        run.status === 'completed'
          ? run.conclusion === 'success'
            ? '✅'
            : '❌'
          : run.status === 'in_progress'
          ? '🔄'
          : '⏳';

      return {
        content: [
          {
            type: 'text',
            text: [
              `${statusEmoji} GitHub Actions Run #${deployment_id}`,
              `Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}`,
              `Branch: ${(run.head_branch as string) || 'unknown'}`,
              `Started: ${run.created_at || 'unknown'}`,
              run.status === 'completed' ? `Finished: ${run.updated_at}` : '',
              `URL: ${run.html_url}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    }

    // Fallback: show latest run
    const res = await fetch(
      `https://api.github.com/repos/${targetRepo}/actions/runs?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DevOps-Deploy-Agent-MCP/1.0',
        },
      }
    );
    const data = await res.json() as { workflow_runs?: Array<Record<string, unknown>> };
    const run = data.workflow_runs?.[0];

    if (!run) {
      return {
        content: [{ type: 'text', text: `No GitHub Actions runs found for ${targetRepo}` }],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Latest run: ${run.status} (${run.conclusion || 'pending'}) — ${run.html_url}`,
        },
      ],
    };
  }

  // For other platforms: check our local log
  const entry = deploymentLog.find((d) => d.id === deployment_id);
  if (entry) {
    return {
      content: [
        {
          type: 'text',
          text: [
            `📊 Deployment Status`,
            `ID: ${entry.id}`,
            `Platform: ${entry.platform}`,
            `Status: ${entry.status}`,
            `Message: ${entry.message}`,
            entry.url ? `URL: ${entry.url}` : '',
            `Triggered: ${entry.timestamp}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `⚠️ Deployment ${deployment_id} not found in session log. Check the platform dashboard directly.`,
      },
    ],
  };
}

// ─── list_platforms ───────────────────────────────────────────────────────────
function handleListPlatforms() {
  const platforms = [
    {
      id: 'github',
      name: 'GitHub Pages',
      configured: !!PLATFORM_SETTINGS.github.token,
      envVar: 'GITHUB_TOKEN',
      description: 'Static sites via GitHub Actions + Pages',
    },
    {
      id: 'railway',
      name: 'Railway',
      configured: !!PLATFORM_SETTINGS.railway.token,
      envVar: 'RAILWAY_TOKEN',
      description: 'Container deployments with auto-scaling',
    },
    {
      id: 'cloudflare',
      name: 'Cloudflare Pages',
      configured: !!PLATFORM_SETTINGS.cloudflare.token,
      envVar: 'CLOUDFLARE_TOKEN',
      description: 'Edge deployment with global CDN',
    },
    {
      id: 'render',
      name: 'Render',
      configured: !!PLATFORM_SETTINGS.render.apiKey,
      envVar: 'RENDER_API_KEY',
      description: 'Web services, databases, cron jobs',
    },
    {
      id: 'digitalocean',
      name: 'DigitalOcean',
      configured: !!PLATFORM_SETTINGS.digitalocean.token,
      envVar: 'DO_TOKEN',
      description: 'App Platform with managed infrastructure',
    },
    {
      id: 'aws',
      name: 'AWS Amplify',
      configured: !!PLATFORM_SETTINGS.aws.accessKeyId,
      envVar: 'AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY',
      description: 'Full-stack web apps on AWS',
    },
  ];

  const lines = platforms.map(
    (p) =>
      `${p.configured ? '✅' : '⚠️ '} ${p.name} (${p.id})\n   ${p.description}\n   ${p.configured ? 'Configured' : `Not configured — set ${p.envVar}`}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `🚀 Available Deployment Platforms\n\n${lines.join('\n\n')}`,
      },
    ],
  };
}

// ─── get_deployment_logs ──────────────────────────────────────────────────────
function handleGetLogs(args: Record<string, string | number>) {
  const limit = Number(args.limit) || 10;
  const platformFilter = args.platform as string | undefined;

  let logs = deploymentLog;
  if (platformFilter) {
    logs = logs.filter((d) => d.platform === platformFilter);
  }
  logs = logs.slice(0, limit);

  if (logs.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'No deployments in this session yet. Use the deploy tool to trigger one.',
        },
      ],
    };
  }

  const lines = logs.map(
    (d) =>
      `[${d.timestamp}] ${d.status === 'success' || d.status === 'queued' ? '✅' : d.status === 'failed' ? '❌' : '🔄'} ${d.platform} — ${d.id}\n  ${d.message}${d.url ? `\n  ${d.url}` : ''}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `📋 Deployment History (${logs.length} entries)\n\n${lines.join('\n\n')}`,
      },
    ],
  };
}

// ─── Resources ────────────────────────────────────────────────────────────────
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'devops://platforms',
      name: 'Platform Configuration',
      description: 'Current configuration status of all deployment platforms',
      mimeType: 'application/json',
    },
    {
      uri: 'devops://deployments',
      name: 'Deployment History',
      description: 'Recent deployments from this session',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'devops://platforms') {
    const config = {
      github: { configured: !!PLATFORM_SETTINGS.github.token, defaultRepo: PLATFORM_SETTINGS.github.defaultRepo },
      railway: { configured: !!PLATFORM_SETTINGS.railway.token, projectId: PLATFORM_SETTINGS.railway.projectId },
      cloudflare: { configured: !!PLATFORM_SETTINGS.cloudflare.token, accountId: PLATFORM_SETTINGS.cloudflare.accountId },
      render: { configured: !!PLATFORM_SETTINGS.render.apiKey, serviceId: PLATFORM_SETTINGS.render.serviceId },
      digitalocean: { configured: !!PLATFORM_SETTINGS.digitalocean.token, appId: PLATFORM_SETTINGS.digitalocean.appId },
      aws: { configured: !!PLATFORM_SETTINGS.aws.accessKeyId, appId: PLATFORM_SETTINGS.aws.appId },
    };
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(config, null, 2),
        },
      ],
    };
  }

  if (uri === 'devops://deployments') {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(deploymentLog, null, 2),
        },
      ],
    };
  }

  throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
});

// ─── Settings Builder ─────────────────────────────────────────────────────────
function buildSettings(platform: string, tokenOverride?: string): Record<string, string> {
  switch (platform) {
    case 'github':
      return {
        ...PLATFORM_SETTINGS.github,
        token: tokenOverride || PLATFORM_SETTINGS.github.token,
      };
    case 'aws':
      return { ...PLATFORM_SETTINGS.aws };
    case 'railway':
      return {
        ...PLATFORM_SETTINGS.railway,
        token: tokenOverride || PLATFORM_SETTINGS.railway.token,
      };
    case 'cloudflare':
      return {
        ...PLATFORM_SETTINGS.cloudflare,
        token: tokenOverride || PLATFORM_SETTINGS.cloudflare.token,
      };
    case 'render':
      return {
        ...PLATFORM_SETTINGS.render,
        apiKey: tokenOverride || PLATFORM_SETTINGS.render.apiKey,
      };
    case 'digitalocean':
      return {
        ...PLATFORM_SETTINGS.digitalocean,
        token: tokenOverride || PLATFORM_SETTINGS.digitalocean.token,
      };
    default:
      return {};
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 DevOps Deploy Agent MCP Server running on stdio');
  console.error(`   Agent URL: ${AGENT_URL}`);
  console.error(`   Configured platforms: ${
    Object.entries(PLATFORM_SETTINGS)
      .filter(([, s]) => Object.values(s).some(Boolean))
      .map(([k]) => k)
      .join(', ') || 'none (set env vars)'
  }`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
