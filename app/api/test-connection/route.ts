import { NextResponse } from 'next/server';

// ─── Test Connection API Route ────────────────────────────────────────────────
// Verifies API credentials for each platform by making a lightweight API call.
// Called server-side so tokens are never exposed to the browser.

export async function POST(req: Request) {
  try {
    const { platform, settings } = await req.json();

    switch (platform) {
      case 'github':
        return testGitHub(settings);
      case 'aws':
        return testAWS(settings);
      case 'railway':
        return testRailway(settings);
      case 'cloudflare':
        return testCloudflare(settings);
      case 'render':
        return testRender(settings);
      case 'digitalocean':
        return testDigitalOcean(settings);
      default:
        return NextResponse.json({ success: false, error: `Unknown platform: ${platform}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }
}

// ─── GitHub ───────────────────────────────────────────────────────────────────
async function testGitHub(s: { token: string; defaultRepo: string }) {
  if (!s.token) return NextResponse.json({ success: false, error: 'Token is required' });

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${s.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'DevOps-Deploy-Agent/1.0',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ success: false, error: err.message || `HTTP ${res.status}: Invalid token` });
    }

    const user = await res.json();

    // Also check repo access if provided
    let repoInfo = '';
    if (s.defaultRepo && s.defaultRepo.includes('/')) {
      const repoRes = await fetch(`https://api.github.com/repos/${s.defaultRepo}`, {
        headers: {
          Authorization: `Bearer ${s.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DevOps-Deploy-Agent/1.0',
        },
      });
      if (repoRes.ok) {
        const repo = await repoRes.json();
        repoInfo = ` · Repo: ${repo.full_name} (${repo.private ? 'private' : 'public'})`;
      } else {
        repoInfo = ` · ⚠️ Repo "${s.defaultRepo}" not found or no access`;
      }
    }

    return NextResponse.json({
      success: true,
      message: `✅ Connected as @${user.login} (${user.public_repos} repos)${repoInfo}`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Network error connecting to GitHub' });
  }
}

// ─── AWS ──────────────────────────────────────────────────────────────────────
async function testAWS(s: { accessKeyId: string; secretAccessKey: string; region: string }) {
  if (!s.accessKeyId || !s.secretAccessKey) {
    return NextResponse.json({ success: false, error: 'Access Key ID and Secret are required' });
  }

  // Use AWS STS GetCallerIdentity — works with any valid credentials
  try {
    const { createHmac, createHash } = await import('crypto');

    const service = 'sts';
    const region = s.region || 'us-east-1';
    const host = `sts.${region}.amazonaws.com`;
    const endpoint = `https://${host}/`;
    const method = 'POST';
    const body = 'Action=GetCallerIdentity&Version=2011-06-15';

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const canonicalRequest = [method, '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

    const getSignatureKey = (key: string, dateStamp: string, region: string, service: string) => {
      const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
      const kRegion = createHmac('sha256', kDate).update(region).digest();
      const kService = createHmac('sha256', kRegion).update(service).digest();
      return createHmac('sha256', kService).update('aws4_request').digest();
    };

    const signingKey = getSignatureKey(s.secretAccessKey, dateStamp, region, service);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${s.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Amz-Date': amzDate,
        Authorization: authHeader,
      },
      body,
    });

    const text = await res.text();
    if (res.ok && text.includes('GetCallerIdentityResult')) {
      const accountMatch = text.match(/<Account>(\d+)<\/Account>/);
      const arnMatch = text.match(/<Arn>([^<]+)<\/Arn>/);
      return NextResponse.json({
        success: true,
        message: `✅ AWS credentials valid · Account: ${accountMatch?.[1] || 'unknown'} · ${arnMatch?.[1] || ''}`,
      });
    } else {
      const errMatch = text.match(/<Message>([^<]+)<\/Message>/);
      return NextResponse.json({ success: false, error: errMatch?.[1] || 'Invalid AWS credentials' });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to verify AWS credentials' });
  }
}

// ─── Railway ──────────────────────────────────────────────────────────────────
async function testRailway(s: { token: string }) {
  if (!s.token) return NextResponse.json({ success: false, error: 'Token is required' });

  try {
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ me { id name email } }' }),
    });

    const data = await res.json();

    if (data.errors) {
      return NextResponse.json({ success: false, error: data.errors[0]?.message || 'Invalid Railway token' });
    }

    const user = data.data?.me;
    return NextResponse.json({
      success: true,
      message: `✅ Connected as ${user?.name || user?.email || 'Railway user'} (ID: ${user?.id?.slice(0, 8)}...)`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Network error connecting to Railway' });
  }
}

// ─── Cloudflare ───────────────────────────────────────────────────────────────
async function testCloudflare(s: { token: string; accountId: string }) {
  if (!s.token) return NextResponse.json({ success: false, error: 'API Token is required' });

  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (!data.success) {
      return NextResponse.json({ success: false, error: data.errors?.[0]?.message || 'Invalid Cloudflare token' });
    }

    // Also check account access if accountId provided
    let accountInfo = '';
    if (s.accountId) {
      const accRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${s.accountId}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      const accData = await accRes.json();
      if (accData.success) {
        accountInfo = ` · Account: ${accData.result?.name}`;
      }
    }

    return NextResponse.json({
      success: true,
      message: `✅ Token valid: ${data.result?.status}${accountInfo}`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Network error connecting to Cloudflare' });
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
async function testRender(s: { apiKey: string; serviceId: string }) {
  if (!s.apiKey) return NextResponse.json({ success: false, error: 'API Key is required' });

  try {
    const res = await fetch('https://api.render.com/v1/owners?limit=1', {
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `HTTP ${res.status}: Invalid Render API key` });
    }

    const data = await res.json();
    const owner = data?.[0]?.owner;

    // Check service if provided
    let serviceInfo = '';
    if (s.serviceId) {
      const svcRes = await fetch(`https://api.render.com/v1/services/${s.serviceId}`, {
        headers: { Authorization: `Bearer ${s.apiKey}`, Accept: 'application/json' },
      });
      if (svcRes.ok) {
        const svc = await svcRes.json();
        serviceInfo = ` · Service: ${svc.name} (${svc.type})`;
      } else {
        serviceInfo = ` · ⚠️ Service ID not found`;
      }
    }

    return NextResponse.json({
      success: true,
      message: `✅ Connected as ${owner?.name || owner?.email || 'Render user'}${serviceInfo}`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Network error connecting to Render' });
  }
}

// ─── DigitalOcean ─────────────────────────────────────────────────────────────
async function testDigitalOcean(s: { token: string; appId: string }) {
  if (!s.token) return NextResponse.json({ success: false, error: 'Token is required' });

  try {
    const res = await fetch('https://api.digitalocean.com/v2/account', {
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `HTTP ${res.status}: Invalid DigitalOcean token` });
    }

    const data = await res.json();
    const account = data.account;

    // Check app if provided
    let appInfo = '';
    if (s.appId) {
      const appRes = await fetch(`https://api.digitalocean.com/v2/apps/${s.appId}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (appRes.ok) {
        const app = await appRes.json();
        appInfo = ` · App: ${app.app?.spec?.name}`;
      } else {
        appInfo = ` · ⚠️ App ID not found`;
      }
    }

    return NextResponse.json({
      success: true,
      message: `✅ Connected as ${account?.email} (${account?.status})${appInfo}`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Network error connecting to DigitalOcean' });
  }
}
