import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ─── Platform Quick Setup API ─────────────────────────────────────────────────
// Creates platform resources automatically (repos, projects, services, apps)
// so users never have to leave the app.

export async function POST(req: Request) {
  try {
    const { platform, settings, repoName } = await req.json();

    switch (platform) {
      case 'github':
        return setupGitHub(settings, repoName || 'devops-deploy-agent');
      case 'railway':
        return setupRailway(settings, repoName || 'devops-deploy-agent');
      case 'cloudflare':
        return setupCloudflare(settings, repoName || 'devops-deploy-agent');
      case 'render':
        return setupRender(settings, repoName || 'devops-deploy-agent');
      case 'digitalocean':
        return setupDigitalOcean(settings, repoName || 'devops-deploy-agent');
      case 'aws':
        return setupAWS(settings, repoName || 'devops-deploy-agent');
      default:
        return NextResponse.json({ success: false, error: `Unknown platform: ${platform}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── GitHub Setup ─────────────────────────────────────────────────────────────
async function setupGitHub(
  s: { token: string; defaultBranch: string },
  repoName: string
) {
  if (!s.token) return NextResponse.json({ success: false, error: 'GitHub token required' });

  const steps: { step: string; status: 'ok' | 'error'; detail?: string }[] = [];

  try {
    // Step 1: Get username
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${s.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'DevOps-Deploy-Agent/1.0',
      },
    });
    if (!userRes.ok) {
      return NextResponse.json({ success: false, error: 'Invalid GitHub token' });
    }
    const user = await userRes.json();
    const username = user.login;
    steps.push({ step: `Authenticated as @${username}`, status: 'ok' });

    // Step 2: Create repo (ignore if already exists)
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'DevOps-Deploy-Agent/1.0',
      },
      body: JSON.stringify({
        name: repoName,
        description: 'One-click multi-platform deployment agent powered by n8n and Next.js',
        private: false,
        auto_init: false,
      }),
    });

    let repoUrl = `https://github.com/${username}/${repoName}`;
    if (createRes.status === 422) {
      // Repo already exists
      steps.push({ step: `Repo "${repoName}" already exists`, status: 'ok', detail: repoUrl });
    } else if (createRes.ok) {
      const repo = await createRes.json();
      repoUrl = repo.html_url;
      steps.push({ step: `Created repo: ${repoUrl}`, status: 'ok' });
    } else {
      const err = await createRes.json().catch(() => ({}));
      steps.push({ step: 'Create repo', status: 'error', detail: err.message || `HTTP ${createRes.status}` });
      return NextResponse.json({ success: false, steps, error: err.message || 'Failed to create repo' });
    }

    // Step 3: Push key project files via GitHub Contents API
    const filesToPush = [
      { path: 'README.md', localPath: 'README.md' },
      { path: 'package.json', localPath: 'package.json' },
      { path: 'next.config.mjs', localPath: 'next.config.mjs' },
      { path: '.github/workflows/deploy.yml', localPath: '.github/workflows/deploy.yml' },
      { path: 'app/page.tsx', localPath: 'app/page.tsx' },
      { path: 'app/settings/page.tsx', localPath: 'app/settings/page.tsx' },
      { path: 'app/api/deploy/route.ts', localPath: 'app/api/deploy/route.ts' },
      { path: 'app/api/test-connection/route.ts', localPath: 'app/api/test-connection/route.ts' },
      { path: 'Dockerfile', localPath: 'Dockerfile' },
      { path: 'docker-compose.yml', localPath: 'docker-compose.yml' },
    ];

    let pushedCount = 0;
    const branch = s.defaultBranch || 'main';

    for (const file of filesToPush) {
      try {
        const cwd = process.cwd();
        const content = readFileSync(join(cwd, file.localPath), 'utf-8');
        const encoded = Buffer.from(content).toString('base64');

        // Check if file exists (to get SHA for update)
        const checkRes = await fetch(
          `https://api.github.com/repos/${username}/${repoName}/contents/${file.path}`,
          {
            headers: {
              Authorization: `Bearer ${s.token}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'DevOps-Deploy-Agent/1.0',
            },
          }
        );

        const body: Record<string, string> = {
          message: `feat: add ${file.path}`,
          content: encoded,
          branch,
        };

        if (checkRes.ok) {
          const existing = await checkRes.json();
          body.sha = existing.sha; // Required for updates
        }

        const pushRes = await fetch(
          `https://api.github.com/repos/${username}/${repoName}/contents/${file.path}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${s.token}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'DevOps-Deploy-Agent/1.0',
            },
            body: JSON.stringify(body),
          }
        );

        if (pushRes.ok) pushedCount++;
      } catch {
        // Skip files that can't be read
      }
    }

    steps.push({ step: `Pushed ${pushedCount} files to ${branch} branch`, status: 'ok' });

    // Step 4: Enable GitHub Pages
    const pagesRes = await fetch(
      `https://api.github.com/repos/${username}/${repoName}/pages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${s.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'DevOps-Deploy-Agent/1.0',
        },
        body: JSON.stringify({
          source: { branch: 'gh-pages', path: '/' },
        }),
      }
    );

    const pagesUrl = `https://${username}.github.io/${repoName}`;
    if (pagesRes.ok || pagesRes.status === 409) {
      steps.push({ step: `GitHub Pages enabled: ${pagesUrl}`, status: 'ok' });
    } else {
      steps.push({ step: 'GitHub Pages (enable after first deploy)', status: 'ok' });
    }

    return NextResponse.json({
      success: true,
      steps,
      result: {
        repoUrl,
        pagesUrl,
        defaultRepo: `${username}/${repoName}`,
        message: `✅ GitHub repo created and ${pushedCount} files pushed!`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, steps, error: msg });
  }
}

// ─── Railway Setup ────────────────────────────────────────────────────────────
async function setupRailway(s: { token: string }, repoName: string) {
  if (!s.token) return NextResponse.json({ success: false, error: 'Railway token required' });

  const steps: { step: string; status: 'ok' | 'error'; detail?: string }[] = [];

  try {
    // Step 1: Verify token
    const meRes = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ me { id name email } }' }),
    });
    const meData = await meRes.json();
    if (meData.errors) {
      return NextResponse.json({ success: false, error: meData.errors[0]?.message || 'Invalid Railway token' });
    }
    const user = meData.data?.me;
    steps.push({ step: `Authenticated as ${user?.name || user?.email}`, status: 'ok' });

    // Step 2: Create project
    const createRes = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation { projectCreate(input: { name: "${repoName}", description: "DevOps Deploy Agent" }) { id name } }`,
      }),
    });
    const createData = await createRes.json();
    if (createData.errors) {
      steps.push({ step: 'Create project', status: 'error', detail: createData.errors[0]?.message });
      return NextResponse.json({ success: false, steps, error: createData.errors[0]?.message });
    }
    const project = createData.data?.projectCreate;
    steps.push({ step: `Created project: ${project?.name}`, status: 'ok' });

    // Step 3: Get environment ID
    const envRes = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query { project(id: "${project.id}") { environments { edges { node { id name } } } } }`,
      }),
    });
    const envData = await envRes.json();
    const envId = envData.data?.project?.environments?.edges?.[0]?.node?.id;
    steps.push({ step: 'Production environment ready', status: 'ok' });

    // Step 4: Create service
    const svcRes = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation { serviceCreate(input: { projectId: "${project.id}", name: "${repoName}" }) { id name } }`,
      }),
    });
    const svcData = await svcRes.json();
    const service = svcData.data?.serviceCreate;
    steps.push({ step: `Created service: ${service?.name}`, status: 'ok' });

    return NextResponse.json({
      success: true,
      steps,
      result: {
        projectId: project.id,
        environmentId: envId,
        serviceId: service?.id,
        projectUrl: `https://railway.app/project/${project.id}`,
        message: `✅ Railway project "${project.name}" created!`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, steps, error: msg });
  }
}

// ─── Cloudflare Setup ─────────────────────────────────────────────────────────
async function setupCloudflare(
  s: { token: string; accountId: string },
  repoName: string
) {
  if (!s.token) return NextResponse.json({ success: false, error: 'Cloudflare token required' });
  if (!s.accountId) return NextResponse.json({ success: false, error: 'Cloudflare Account ID required' });

  const steps: { step: string; status: 'ok' | 'error'; detail?: string }[] = [];

  try {
    // Step 1: Verify token
    const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return NextResponse.json({ success: false, error: 'Invalid Cloudflare token' });
    }
    steps.push({ step: `Token verified: ${verifyData.result?.status}`, status: 'ok' });

    // Step 2: Create Pages project
    const createRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${s.accountId}/pages/projects`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${s.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: repoName,
          production_branch: 'main',
          build_config: {
            build_command: 'npm run build',
            destination_dir: 'out',
            root_dir: '/',
          },
        }),
      }
    );

    const createData = await createRes.json();
    if (!createData.success) {
      // Check if already exists
      const errMsg = createData.errors?.[0]?.message || '';
      if (errMsg.includes('already exists') || errMsg.includes('duplicate')) {
        steps.push({ step: `Project "${repoName}" already exists`, status: 'ok' });
      } else {
        steps.push({ step: 'Create Pages project', status: 'error', detail: errMsg });
        return NextResponse.json({ success: false, steps, error: errMsg });
      }
    } else {
      steps.push({ step: `Created Pages project: ${repoName}`, status: 'ok' });
    }

    const projectUrl = `https://dash.cloudflare.com/${s.accountId}/pages/view/${repoName}`;
    const pagesUrl = `https://${repoName}.pages.dev`;
    steps.push({ step: `Pages URL: ${pagesUrl}`, status: 'ok' });

    return NextResponse.json({
      success: true,
      steps,
      result: {
        projectName: repoName,
        projectUrl,
        pagesUrl,
        message: `✅ Cloudflare Pages project "${repoName}" created!`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, steps, error: msg });
  }
}

// ─── Render Setup ─────────────────────────────────────────────────────────────
async function setupRender(s: { apiKey: string }, repoName: string) {
  if (!s.apiKey) return NextResponse.json({ success: false, error: 'Render API key required' });

  const steps: { step: string; status: 'ok' | 'error'; detail?: string }[] = [];

  try {
    // Step 1: Verify key + get owner ID
    const ownersRes = await fetch('https://api.render.com/v1/owners?limit=1', {
      headers: { Authorization: `Bearer ${s.apiKey}`, Accept: 'application/json' },
    });
    if (!ownersRes.ok) {
      return NextResponse.json({ success: false, error: 'Invalid Render API key' });
    }
    const ownersData = await ownersRes.json();
    const owner = ownersData?.[0]?.owner;
    const ownerId = owner?.id;
    steps.push({ step: `Authenticated as ${owner?.name || owner?.email}`, status: 'ok' });

    // Step 2: Create web service
    const createRes = await fetch('https://api.render.com/v1/services', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'web_service',
        name: repoName,
        ownerId,
        serviceDetails: {
          env: 'node',
          buildCommand: 'npm install && npm run build',
          startCommand: 'npm start',
          plan: 'free',
          region: 'oregon',
          numInstances: 1,
        },
        autoDeploy: 'yes',
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      const errMsg = errData.message || `HTTP ${createRes.status}`;
      steps.push({ step: 'Create web service', status: 'error', detail: errMsg });
      return NextResponse.json({ success: false, steps, error: errMsg });
    }

    const createData = await createRes.json();
    const service = createData.service || createData;
    const serviceId = service?.id;
    const serviceUrl = service?.serviceDetails?.url || `https://${repoName}.onrender.com`;

    steps.push({ step: `Created service: ${service?.name}`, status: 'ok' });
    steps.push({ step: `Service URL: ${serviceUrl}`, status: 'ok' });

    return NextResponse.json({
      success: true,
      steps,
      result: {
        serviceId,
        serviceUrl,
        dashboardUrl: `https://dashboard.render.com/web/${serviceId}`,
        message: `✅ Render service "${service?.name}" created!`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, steps, error: msg });
  }
}

// ─── DigitalOcean Setup ───────────────────────────────────────────────────────
async function setupDigitalOcean(s: { token: string }, repoName: string) {
  if (!s.token) return NextResponse.json({ success: false, error: 'DigitalOcean token required' });

  const steps: { step: string; status: 'ok' | 'error'; detail?: string }[] = [];

  try {
    // Step 1: Verify token
    const accountRes = await fetch('https://api.digitalocean.com/v2/account', {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (!accountRes.ok) {
      return NextResponse.json({ success: false, error: 'Invalid DigitalOcean token' });
    }
    const accountData = await accountRes.json();
    steps.push({ step: `Authenticated as ${accountData.account?.email}`, status: 'ok' });

    // Step 2: Create App Platform app
    const createRes = await fetch('https://api.digitalocean.com/v2/apps', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spec: {
          name: repoName,
          region: 'nyc',
          services: [
            {
              name: repoName,
              build_command: 'npm install && npm run build',
              run_command: 'npm start',
              environment_slug: 'node-js',
              instance_count: 1,
              instance_size_slug: 'basic-xxs',
              http_port: 3000,
            },
          ],
        },
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      const errMsg = errData.message || `HTTP ${createRes.status}`;
      steps.push({ step: 'Create App Platform app', status: 'error', detail: errMsg });
      return NextResponse.json({ success: false, steps, error: errMsg });
    }

    const createData = await createRes.json();
    const app = createData.app;
    const appId = app?.id;
    const appUrl = app?.live_url || `https://${repoName}.ondigitalocean.app`;

    steps.push({ step: `Created app: ${app?.spec?.name}`, status: 'ok' });
    steps.push({ step: `App URL: ${appUrl}`, status: 'ok' });

    return NextResponse.json({
      success: true,
      steps,
      result: {
        appId,
        appUrl,
        dashboardUrl: `https://cloud.digitalocean.com/apps/${appId}`,
        message: `✅ DigitalOcean app "${app?.spec?.name}" created!`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, steps, error: msg });
  }
}

// ─── AWS Amplify Setup ────────────────────────────────────────────────────────
async function setupAWS(
  s: { accessKeyId: string; secretAccessKey: string; region: string },
  repoName: string
) {
  if (!s.accessKeyId || !s.secretAccessKey) {
    return NextResponse.json({ success: false, error: 'AWS credentials required' });
  }

  const steps: { step: string; status: 'ok' | 'error'; detail?: string }[] = [];

  try {
    const { createHmac, createHash } = await import('crypto');

    const region = s.region || 'us-east-1';
    const host = `amplify.${region}.amazonaws.com`;
    const path = '/apps';
    const method = 'POST';
    const bodyStr = JSON.stringify({
      name: repoName,
      description: 'DevOps Deploy Agent',
      platform: 'WEB',
      buildSpec: `version: 1\nfrontend:\n  phases:\n    preBuild:\n      commands:\n        - npm install\n    build:\n      commands:\n        - npm run build\n  artifacts:\n    baseDirectory: out\n    files:\n      - '**/*'\n  cache:\n    paths:\n      - node_modules/**/*`,
    });

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

    steps.push({ step: 'Signing AWS request...', status: 'ok' });

    const res = await fetch(`https://${host}${path}`, {
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
      const errMsg = data.message || `HTTP ${res.status}`;
      steps.push({ step: 'Create Amplify app', status: 'error', detail: errMsg });
      return NextResponse.json({ success: false, steps, error: errMsg });
    }

    const app = data.app;
    const appId = app?.appId;
    const appUrl = app?.defaultDomain ? `https://${app.defaultDomain}` : `https://${region}.console.aws.amazon.com/amplify/home#/${appId}`;

    steps.push({ step: `Created Amplify app: ${app?.name}`, status: 'ok' });
    steps.push({ step: `App ID: ${appId}`, status: 'ok' });

    return NextResponse.json({
      success: true,
      steps,
      result: {
        appId,
        appUrl,
        consoleUrl: `https://${region}.console.aws.amazon.com/amplify/home#/${appId}`,
        message: `✅ AWS Amplify app "${app?.name}" created!`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, steps, error: msg });
  }
}
