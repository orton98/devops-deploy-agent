/**
 * Infrastructure tools: scale service, set/get env vars, restart service.
 */

import { getCredentials } from '../vault.js';

// ─── scale_service ────────────────────────────────────────────────────────────
export async function scaleService(
  platform: string,
  instances: number,
  serviceId?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (platform === 'render') {
    const creds = getCredentials('render');
    const id = serviceId || creds.serviceId;
    if (!creds.apiKey || !id) return { success: false, error: 'Render API key and service ID required' };

    const res = await fetch(`https://api.render.com/v1/services/${id}/scale`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ numInstances: instances }),
    });
    if (res.ok) return { success: true, message: `Scaled ${id} to ${instances} instance(s)` };
    const err = await res.json() as { message?: string };
    return { success: false, error: err.message || `Render scale error: HTTP ${res.status}` };
  }

  if (platform === 'digitalocean') {
    const creds = getCredentials('digitalocean');
    const id = serviceId || creds.appId;
    if (!creds.token || !id) return { success: false, error: 'DigitalOcean token and app ID required' };

    // Get current spec first
    const specRes = await fetch(`https://api.digitalocean.com/v2/apps/${id}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    const specData = await specRes.json() as { app?: { spec?: Record<string, unknown> } };
    const spec = specData.app?.spec;
    if (!spec) return { success: false, error: 'Could not fetch app spec' };

    // Update instance count in spec
    const services = (spec.services as Array<Record<string, unknown>>) || [];
    for (const svc of services) svc.instance_count = instances;

    const updateRes = await fetch(`https://api.digitalocean.com/v2/apps/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec }),
    });
    if (updateRes.ok) return { success: true, message: `Scaled DO app ${id} to ${instances} instance(s)` };
    return { success: false, error: `DigitalOcean scale error: HTTP ${updateRes.status}` };
  }

  return { success: false, error: `Scaling not supported for platform: ${platform}` };
}

// ─── set_env_variable ─────────────────────────────────────────────────────────
export async function setEnvVariable(
  platform: string,
  key: string,
  value: string,
  serviceId?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (platform === 'render') {
    const creds = getCredentials('render');
    const id = serviceId || creds.serviceId;
    if (!creds.apiKey || !id) return { success: false, error: 'Render API key and service ID required' };

    // Get existing env vars
    const getRes = await fetch(`https://api.render.com/v1/services/${id}/env-vars`, {
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: 'application/json' },
    });
    const existing = await getRes.json() as Array<{ envVar: { key: string; value: string } }>;
    const envVars = Array.isArray(existing) ? existing.map((e) => e.envVar) : [];

    // Upsert
    const idx = envVars.findIndex((e) => e.key === key);
    if (idx >= 0) envVars[idx].value = value;
    else envVars.push({ key, value });

    const putRes = await fetch(`https://api.render.com/v1/services/${id}/env-vars`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(envVars),
    });
    if (putRes.ok) return { success: true, message: `Set ${key} on Render service ${id}` };
    return { success: false, error: `Render env var error: HTTP ${putRes.status}` };
  }

  if (platform === 'railway') {
    const creds = getCredentials('railway');
    if (!creds.token || !creds.projectId) return { success: false, error: 'Railway token and project ID required' };

    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation { variableUpsert(input: { projectId: "${creds.projectId}", name: "${key}", value: "${value}" }) }`,
      }),
    });
    const data = await res.json() as { errors?: Array<{ message: string }> };
    if (data.errors) return { success: false, error: data.errors[0]?.message };
    return { success: true, message: `Set ${key} on Railway project ${creds.projectId}` };
  }

  if (platform === 'vercel') {
    const creds = getCredentials('vercel');
    if (!creds.token || !creds.projectId) return { success: false, error: 'Vercel token and project ID required' };

    const url = creds.teamId
      ? `https://api.vercel.com/v10/projects/${creds.projectId}/env?teamId=${creds.teamId}`
      : `https://api.vercel.com/v10/projects/${creds.projectId}/env`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview', 'development'] }),
    });
    if (res.ok || res.status === 201) return { success: true, message: `Set ${key} on Vercel project ${creds.projectId}` };
    const err = await res.json() as { error?: { message: string } };
    return { success: false, error: err.error?.message || `Vercel env var error: HTTP ${res.status}` };
  }

  return { success: false, error: `Env var management not supported for platform: ${platform}` };
}

// ─── get_env_variables ────────────────────────────────────────────────────────
export async function getEnvVariables(
  platform: string,
  serviceId?: string
): Promise<{ success: boolean; vars?: Array<{ key: string; value: string }>; error?: string }> {
  if (platform === 'render') {
    const creds = getCredentials('render');
    const id = serviceId || creds.serviceId;
    if (!creds.apiKey || !id) return { success: false, error: 'Render API key and service ID required' };

    const res = await fetch(`https://api.render.com/v1/services/${id}/env-vars`, {
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: 'application/json' },
    });
    const data = await res.json() as Array<{ envVar: { key: string; value: string } }>;
    if (!Array.isArray(data)) return { success: false, error: 'Failed to fetch env vars' };

    return {
      success: true,
      vars: data.map((e) => ({
        key: e.envVar.key,
        value: e.envVar.value.replace(/./g, '*').slice(0, 4) + '****', // mask values
      })),
    };
  }

  if (platform === 'vercel') {
    const creds = getCredentials('vercel');
    if (!creds.token || !creds.projectId) return { success: false, error: 'Vercel token and project ID required' };

    const url = creds.teamId
      ? `https://api.vercel.com/v10/projects/${creds.projectId}/env?teamId=${creds.teamId}`
      : `https://api.vercel.com/v10/projects/${creds.projectId}/env`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    const data = await res.json() as { envs?: Array<{ key: string; type: string }> };
    if (!data.envs) return { success: false, error: 'Failed to fetch Vercel env vars' };

    return {
      success: true,
      vars: data.envs.map((e) => ({ key: e.key, value: `[${e.type}]` })),
    };
  }

  return { success: false, error: `Env var listing not supported for platform: ${platform}` };
}

// ─── restart_service ──────────────────────────────────────────────────────────
export async function restartService(
  platform: string,
  serviceId?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (platform === 'render') {
    const creds = getCredentials('render');
    const id = serviceId || creds.serviceId;
    if (!creds.apiKey || !id) return { success: false, error: 'Render API key and service ID required' };

    const res = await fetch(`https://api.render.com/v1/services/${id}/restart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}`, Accept: 'application/json' },
    });
    if (res.ok || res.status === 204) return { success: true, message: `Restarted Render service ${id}` };
    return { success: false, error: `Render restart error: HTTP ${res.status}` };
  }

  if (platform === 'railway') {
    const creds = getCredentials('railway');
    if (!creds.token || !creds.projectId) return { success: false, error: 'Railway token and project ID required' };

    // Railway restart = redeploy
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation { serviceInstanceRedeploy(environmentId: "${creds.environment || 'production'}", serviceId: "${serviceId || ''}") }`,
      }),
    });
    const data = await res.json() as { errors?: Array<{ message: string }> };
    if (data.errors) return { success: false, error: data.errors[0]?.message };
    return { success: true, message: `Restarted Railway service` };
  }

  if (platform === 'digitalocean') {
    const creds = getCredentials('digitalocean');
    const id = serviceId || creds.appId;
    if (!creds.token || !id) return { success: false, error: 'DigitalOcean token and app ID required' };

    const res = await fetch(`https://api.digitalocean.com/v2/apps/${id}/restart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    });
    if (res.ok) return { success: true, message: `Restarted DigitalOcean app ${id}` };
    return { success: false, error: `DigitalOcean restart error: HTTP ${res.status}` };
  }

  return { success: false, error: `Restart not supported for platform: ${platform}` };
}
