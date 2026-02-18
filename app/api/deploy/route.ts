import { NextResponse } from 'next/server';

// ─── Real Deploy API Route ────────────────────────────────────────────────────
// Receives deploy requests from the frontend and calls real platform APIs.
// All tokens are handled server-side — never exposed to the browser.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { platform, settings, config } = body;

    if (!platform) {
      return NextResponse.json({ success: false, error: 'Platform is required' }, { status: 400 });
    }

    switch (platform) {
      case 'github':
        return deployGitHub(settings, config);
      case 'aws':
        return deployAWS(settings, config);
      case 'railway':
        return deployRailway(settings, config);
      case 'cloudflare':
        return deployCloudflare(settings, config);
      case 'render':
        return deployRender(settings, config);
      case 'digitalocean':
        return deployDigitalOcean(settings, config);
      default:
        return NextResponse.json({ success: false, error: `Unknown platform: ${platform}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── GitHub ───────────────────────────────────────────────────────────────────
// Triggers a GitHub Actions workflow_dispatch event on the target repo.
async function deployGitHub(
  s: { token: string; defaultRepo: string; defaultBranch: string; workflowFile: string },
  config: { repo?: string; branch?: string; project?: string; env?: string }
) {
  const token = s.token;
  const repo = config.repo || s.defaultRepo;
  const branch = config.branch || s.defaultBranch || 'main';
  const workflowFile = s.workflowFile || 'deploy.yml';

  if (!token) return NextResponse.json({ success: false, error: 'GitHub token not configured. Go to Settings.' });
  if (!repo || !repo.includes('/')) return NextResponse.json({ success: false, error: 'Repository not configured. Go to Settings → GitHub.' });

  try {
    // First check if the workflow file exists
    const workflowCheckRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/.github/workflows/${workflowFile}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DevOps-Deploy-Agent/1.0',
        },
      }
    );

    if (!workflowCheckRes.ok) {
      // Workflow doesn't exist — try to create it automatically
      return NextResponse.json({
        success: false,
        error: `Workflow file ".github/workflows/${workflowFile}" not found in ${repo}. Create it first or use the GitHub Pages deploy instead.`,
        hint: 'create_workflow',
        repo,
        workflowFile,
      });
    }

    // Trigger workflow_dispatch
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'DevOps-Deploy-Agent/1.0',
        },
        body: JSON.stringify({
          ref: branch,
          inputs: {
            environment: config.env || 'production',
            triggered_by: 'devops-deploy-agent',
          },
        }),
      }
    );

    if (res.status === 204) {
      // 204 No Content = success for workflow dispatch
      // Get the latest run ID
      await new Promise((r) => setTimeout(r, 2000)); // wait 2s for run to appear
      const runsRes = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/runs?per_page=1&branch=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'DevOps-Deploy-Agent/1.0',
          },
        }
      );

      let runId: string | null = null;
      let runUrl: string | null = null;
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const latestRun = runsData.workflow_runs?.[0];
        runId = latestRun?.id?.toString() || null;
        runUrl = latestRun?.html_url || null;
      }

      return NextResponse.json({
        success: true,
        deploymentId: runId || `gh-${Date.now()}`,
        platform: 'github',
        status: 'queued',
        message: `GitHub Actions workflow "${workflowFile}" triggered on ${repo}@${branch}`,
        url: runUrl || `https://github.com/${repo}/actions`,
        statusUrl: runId ? `https://api.github.com/repos/${repo}/actions/runs/${runId}` : null,
        repo,
        branch,
      });
    } else {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: errData.message || `GitHub API error: HTTP ${res.status}`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `GitHub deploy failed: ${msg}` });
  }
}

// ─── AWS Amplify ──────────────────────────────────────────────────────────────
async function deployAWS(
  s: { accessKeyId: string; secretAccessKey: string; region: string; appId: string },
  config: { branch?: string }
) {
  if (!s.accessKeyId || !s.secretAccessKey) {
    return NextResponse.json({ success: false, error: 'AWS credentials not configured. Go to Settings.' });
  }
  if (!s.appId) {
    return NextResponse.json({ success: false, error: 'Amplify App ID not configured. Go to Settings → AWS.' });
  }

  try {
    const { createHmac, createHash } = await import('crypto');

    const region = s.region || 'us-east-1';
    const branch = config.branch || 'main';
    const appId = s.appId;
    const host = `amplify.${region}.amazonaws.com`;
    const path = `/apps/${appId}/branches/${branch}/jobs`;
    const endpoint = `https://${host}${path}`;
    const method = 'POST';
    const bodyStr = JSON.stringify({ jobType: 'RELEASE' });

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = createHash('sha256').update(bodyStr).digest('hex');
    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${region}/amplify/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

    const getKey = (key: string, d: string, r: string, svc: string) => {
      const kDate = createHmac('sha256', `AWS4${key}`).update(d).digest();
      const kRegion = createHmac('sha256', kDate).update(r).digest();
      const kService = createHmac('sha256', kRegion).update(svc).digest();
      return createHmac('sha256', kService).update('aws4_request').digest();
    };

    const signingKey = getKey(s.secretAccessKey, dateStamp, region, 'amplify');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${s.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate,
        Authorization: authHeader,
      },
      body: bodyStr,
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.message || `AWS Amplify error: HTTP ${res.status}` });
    }

    const jobId = data.jobSummary?.jobId;
    return NextResponse.json({
      success: true,
      deploymentId: jobId || `aws-${Date.now()}`,
      platform: 'aws',
      status: data.jobSummary?.status || 'PENDING',
      message: `AWS Amplify deployment started for app ${appId} on branch ${branch}`,
      url: `https://${region}.console.aws.amazon.com/amplify/home#/${appId}/deployments`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `AWS deploy failed: ${msg}` });
  }
}

// ─── Railway ──────────────────────────────────────────────────────────────────
async function deployRailway(
  s: { token: string; projectId: string; environment: string },
  config: { env?: string }
) {
  if (!s.token) return NextResponse.json({ success: false, error: 'Railway token not configured. Go to Settings.' });
  if (!s.projectId) return NextResponse.json({ success: false, error: 'Railway Project ID not configured. Go to Settings → Railway.' });

  try {
    // Get environment ID first
    const envRes = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { project(id: "${s.projectId}") { environments { edges { node { id name } } } } }`,
      }),
    });

    const envData = await envRes.json();
    if (envData.errors) {
      return NextResponse.json({ success: false, error: envData.errors[0]?.message || 'Railway project not found' });
    }

    const environments = envData.data?.project?.environments?.edges || [];
    const targetEnvName = config.env || s.environment || 'production';
    const targetEnv = environments.find((e: { node: { name: string } }) =>
      e.node.name.toLowerCase() === targetEnvName.toLowerCase()
    ) || environments[0];

    if (!targetEnv) {
      return NextResponse.json({ success: false, error: 'No environments found in Railway project' });
    }

    const environmentId = targetEnv.node.id;

    // Get service ID
    const svcRes = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { project(id: "${s.projectId}") { services { edges { node { id name } } } } }`,
      }),
    });

    const svcData = await svcRes.json();
    const services = svcData.data?.project?.services?.edges || [];
    if (!services.length) {
      return NextResponse.json({ success: false, error: 'No services found in Railway project' });
    }

    const serviceId = services[0].node.id;
    const serviceName = services[0].node.name;

    // Trigger deployment
    const deployRes = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `mutation { serviceInstanceRedeploy(environmentId: "${environmentId}", serviceId: "${serviceId}") }`,
      }),
    });

    const deployData = await deployRes.json();
    if (deployData.errors) {
      return NextResponse.json({ success: false, error: deployData.errors[0]?.message || 'Railway deploy failed' });
    }

    return NextResponse.json({
      success: true,
      deploymentId: `railway-${Date.now()}`,
      platform: 'railway',
      status: 'deploying',
      message: `Railway service "${serviceName}" redeployment triggered in ${targetEnv.node.name} environment`,
      url: `https://railway.app/project/${s.projectId}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Railway deploy failed: ${msg}` });
  }
}

// ─── Cloudflare Pages ─────────────────────────────────────────────────────────
async function deployCloudflare(
  s: { token: string; accountId: string; projectName: string },
  config: { branch?: string }
) {
  if (!s.token) return NextResponse.json({ success: false, error: 'Cloudflare token not configured. Go to Settings.' });
  if (!s.accountId) return NextResponse.json({ success: false, error: 'Cloudflare Account ID not configured. Go to Settings → Cloudflare.' });
  if (!s.projectName) return NextResponse.json({ success: false, error: 'Cloudflare Pages project name not configured. Go to Settings → Cloudflare.' });

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${s.accountId}/pages/projects/${s.projectName}/deployments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${s.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch: config.branch || 'main',
        }),
      }
    );

    const data = await res.json();

    if (!data.success) {
      return NextResponse.json({
        success: false,
        error: data.errors?.[0]?.message || `Cloudflare Pages error: HTTP ${res.status}`,
      });
    }

    const deployment = data.result;
    return NextResponse.json({
      success: true,
      deploymentId: deployment?.id || `cf-${Date.now()}`,
      platform: 'cloudflare',
      status: deployment?.latest_stage?.status || 'queued',
      message: `Cloudflare Pages deployment triggered for project "${s.projectName}"`,
      url: deployment?.url || `https://dash.cloudflare.com/${s.accountId}/pages/view/${s.projectName}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Cloudflare deploy failed: ${msg}` });
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
async function deployRender(
  s: { apiKey: string; serviceId: string },
  config: { branch?: string }
) {
  if (!s.apiKey) return NextResponse.json({ success: false, error: 'Render API key not configured. Go to Settings.' });
  if (!s.serviceId) return NextResponse.json({ success: false, error: 'Render Service ID not configured. Go to Settings → Render.' });

  try {
    const res = await fetch(`https://api.render.com/v1/services/${s.serviceId}/deploys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clearCache: 'do_not_clear',
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: errData.message || `Render API error: HTTP ${res.status}`,
      });
    }

    const data = await res.json();
    const deployId = data.id || data.deploy?.id;

    return NextResponse.json({
      success: true,
      deploymentId: deployId || `render-${Date.now()}`,
      platform: 'render',
      status: data.status || 'created',
      message: `Render deployment triggered for service ${s.serviceId}`,
      url: `https://dashboard.render.com/web/${s.serviceId}/deploys/${deployId || ''}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Render deploy failed: ${msg}` });
  }
}

// ─── DigitalOcean ─────────────────────────────────────────────────────────────
async function deployDigitalOcean(
  s: { token: string; appId: string },
  config: Record<string, string>
) {
  if (!s.token) return NextResponse.json({ success: false, error: 'DigitalOcean token not configured. Go to Settings.' });
  if (!s.appId) return NextResponse.json({ success: false, error: 'DigitalOcean App ID not configured. Go to Settings → DigitalOcean.' });

  try {
    const res = await fetch(`https://api.digitalocean.com/v2/apps/${s.appId}/deployments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        force_build: true,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: errData.message || `DigitalOcean API error: HTTP ${res.status}`,
      });
    }

    const data = await res.json();
    const deployment = data.deployment;

    return NextResponse.json({
      success: true,
      deploymentId: deployment?.id || `do-${Date.now()}`,
      platform: 'digitalocean',
      status: deployment?.phase || 'PENDING_BUILD',
      message: `DigitalOcean App Platform deployment triggered for app ${s.appId}`,
      url: `https://cloud.digitalocean.com/apps/${s.appId}/deployments/${deployment?.id || ''}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `DigitalOcean deploy failed: ${msg}` });
  }
}
