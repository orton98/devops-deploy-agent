/**
 * Fly.io platform integration.
 */

import { getCredentials } from '../vault.js';

const FLY_API = 'https://api.machines.dev/v1';

export async function deployFlyio(config: {
  appName?: string;
  region?: string;
  image?: string;
}): Promise<{ success: boolean; deploymentId?: string; url?: string; error?: string }> {
  const creds = getCredentials('flyio');
  const token = creds.token;
  const appName = config.appName || creds.appName;

  if (!token) return { success: false, error: 'FLY_API_TOKEN not configured. Get it from: fly auth token' };
  if (!appName) return { success: false, error: 'FLY_APP_NAME not configured. Go to Settings → Fly.io.' };

  try {
    // Trigger a new release via Fly Machines API
    const res = await fetch(`${FLY_API}/apps/${appName}/machines`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          image: config.image || `registry.fly.io/${appName}:latest`,
          restart: { policy: 'always' },
        },
        region: config.region || 'iad',
      }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      return { success: false, error: (data.error as string) || `Fly.io API error: HTTP ${res.status}` };
    }

    return {
      success: true,
      deploymentId: data.id as string,
      url: `https://${appName}.fly.dev`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function testFlyioConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
  const creds = getCredentials('flyio');
  if (!creds.token) return { success: false, error: 'FLY_API_TOKEN not configured' };

  try {
    const res = await fetch('https://api.fly.io/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ viewer { email name } }' }),
    });
    const data = await res.json() as { data?: { viewer?: { email?: string; name?: string } }; errors?: Array<{ message: string }> };

    if (data.errors) return { success: false, error: data.errors[0]?.message };
    if (!data.data?.viewer) return { success: false, error: 'Authentication failed' };

    return {
      success: true,
      message: `✅ Connected as ${data.data.viewer.name || data.data.viewer.email}`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function scaleFlyio(
  appName: string,
  count: number,
  region?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const creds = getCredentials('flyio');
  if (!creds.token) return { success: false, error: 'FLY_API_TOKEN not configured' };

  const name = appName || creds.appName;
  if (!name) return { success: false, error: 'App name required' };

  try {
    const res = await fetch(`${FLY_API}/apps/${name}/machines/count`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ count, region: region || 'iad' }),
    });

    if (res.ok) return { success: true, message: `Scaled ${name} to ${count} machine(s)` };
    return { success: false, error: `Fly.io scale error: HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
