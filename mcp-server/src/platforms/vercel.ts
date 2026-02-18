/**
 * Vercel platform integration.
 */

import { getCredentials } from '../vault.js';

export async function deployVercel(config: {
  projectId?: string;
  teamId?: string;
  branch?: string;
}): Promise<{ success: boolean; deploymentId?: string; url?: string; status?: string; error?: string }> {
  const creds = getCredentials('vercel');
  const token = creds.token;
  const projectId = config.projectId || creds.projectId;
  const teamId = config.teamId || creds.teamId;

  if (!token) return { success: false, error: 'VERCEL_TOKEN not configured. Go to Settings → Vercel.' };
  if (!projectId) return { success: false, error: 'Vercel project ID not configured. Go to Settings → Vercel.' };

  try {
    const url = teamId
      ? `https://api.vercel.com/v13/deployments?teamId=${teamId}`
      : 'https://api.vercel.com/v13/deployments';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectId,
        gitSource: {
          type: 'github',
          ref: config.branch || 'main',
        },
        target: 'production',
      }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      return { success: false, error: (data.error as Record<string, string>)?.message || `Vercel API error: HTTP ${res.status}` };
    }

    return {
      success: true,
      deploymentId: data.id as string,
      url: data.url ? `https://${data.url}` : undefined,
      status: data.readyState as string,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function testVercelConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
  const creds = getCredentials('vercel');
  if (!creds.token) return { success: false, error: 'VERCEL_TOKEN not configured' };

  try {
    const res = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    const data = await res.json() as { user?: { username?: string; email?: string }; error?: { message: string } };

    if (!res.ok) return { success: false, error: data.error?.message || `Vercel API error: HTTP ${res.status}` };

    return {
      success: true,
      message: `✅ Connected as @${data.user?.username || data.user?.email}`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function setupVercel(projectName: string): Promise<{
  success: boolean;
  steps: Array<{ step: string; status: string; detail?: string }>;
  result?: Record<string, string>;
  error?: string;
}> {
  const creds = getCredentials('vercel');
  const steps: Array<{ step: string; status: string; detail?: string }> = [];

  if (!creds.token) {
    return { success: false, steps, error: 'VERCEL_TOKEN not configured' };
  }

  // Step 1: Verify auth
  const authRes = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${creds.token}` },
  });
  const authData = await authRes.json() as { user?: { username?: string } };
  if (!authRes.ok) {
    steps.push({ step: 'Authenticate', status: 'error', detail: 'Invalid token' });
    return { success: false, steps, error: 'Authentication failed' };
  }
  steps.push({ step: `Authenticated as @${authData.user?.username}`, status: 'ok' });

  // Step 2: Create project
  const createUrl = creds.teamId
    ? `https://api.vercel.com/v10/projects?teamId=${creds.teamId}`
    : 'https://api.vercel.com/v10/projects';

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: projectName, framework: 'nextjs' }),
  });
  const createData = await createRes.json() as { id?: string; name?: string; link?: { url?: string }; error?: { message: string } };

  if (createRes.status === 409) {
    steps.push({ step: `Project "${projectName}" already exists`, status: 'ok' });
  } else if (!createRes.ok) {
    steps.push({ step: 'Create project', status: 'error', detail: createData.error?.message });
    return { success: false, steps, error: createData.error?.message };
  } else {
    steps.push({ step: `Created project "${projectName}"`, status: 'ok', detail: createData.id });
  }

  return {
    success: true,
    steps,
    result: {
      projectId: createData.id || projectName,
      projectName,
      message: `✅ Vercel project "${projectName}" ready`,
    },
  };
}
