/**
 * Repository tools: create branch, open PR, merge PR, get repo status.
 */

import { getCredentials } from '../vault.js';

// ─── create_branch ────────────────────────────────────────────────────────────
export async function createBranch(
  repo: string,
  branchName: string,
  fromBranch = 'main'
): Promise<{ success: boolean; branch?: string; url?: string; error?: string }> {
  const creds = getCredentials('github');
  const token = creds.token;
  const targetRepo = repo || creds.defaultRepo;

  if (!token) return { success: false, error: 'GitHub token not configured' };
  if (!targetRepo) return { success: false, error: 'Repository not specified' };

  try {
    // Get SHA of source branch
    const refRes = await fetch(
      `https://api.github.com/repos/${targetRepo}/git/ref/heads/${fromBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
        },
      }
    );
    const refData = await refRes.json() as { object?: { sha: string }; message?: string };
    if (!refData.object?.sha) {
      return { success: false, error: `Branch "${fromBranch}" not found: ${refData.message}` };
    }

    // Create new branch
    const createRes = await fetch(`https://api.github.com/repos/${targetRepo}/git/refs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
      },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: refData.object.sha }),
    });

    if (createRes.status === 201) {
      return {
        success: true,
        branch: branchName,
        url: `https://github.com/${targetRepo}/tree/${branchName}`,
      };
    }

    const err = await createRes.json() as { message?: string };
    return { success: false, error: err.message || `GitHub API error: HTTP ${createRes.status}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── create_pull_request ──────────────────────────────────────────────────────
export async function createPullRequest(
  repo: string,
  title: string,
  head: string,
  base = 'main',
  body = ''
): Promise<{ success: boolean; prNumber?: number; url?: string; error?: string }> {
  const creds = getCredentials('github');
  const token = creds.token;
  const targetRepo = repo || creds.defaultRepo;

  if (!token) return { success: false, error: 'GitHub token not configured' };
  if (!targetRepo) return { success: false, error: 'Repository not specified' };

  try {
    const res = await fetch(`https://api.github.com/repos/${targetRepo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
      },
      body: JSON.stringify({ title, head, base, body }),
    });

    const data = await res.json() as { number?: number; html_url?: string; message?: string };

    if (res.status === 201) {
      return { success: true, prNumber: data.number, url: data.html_url };
    }
    return { success: false, error: data.message || `GitHub API error: HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── merge_pull_request ───────────────────────────────────────────────────────
export async function mergePullRequest(
  repo: string,
  prNumber: number,
  mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash',
  commitTitle?: string
): Promise<{ success: boolean; sha?: string; merged?: boolean; error?: string }> {
  const creds = getCredentials('github');
  const token = creds.token;
  const targetRepo = repo || creds.defaultRepo;

  if (!token) return { success: false, error: 'GitHub token not configured' };
  if (!targetRepo) return { success: false, error: 'Repository not specified' };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${targetRepo}/pulls/${prNumber}/merge`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
        },
        body: JSON.stringify({
          merge_method: mergeMethod,
          commit_title: commitTitle,
        }),
      }
    );

    const data = await res.json() as { sha?: string; merged?: boolean; message?: string };

    if (res.status === 200) {
      return { success: true, sha: data.sha, merged: data.merged };
    }
    return { success: false, error: data.message || `GitHub API error: HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── get_repo_status ─────────────────────────────────────────────────────────
export async function getRepoStatus(repo: string): Promise<{
  success: boolean;
  defaultBranch?: string;
  openPRs?: number;
  recentCommits?: Array<{ sha: string; message: string; author: string; date: string }>;
  latestWorkflowRun?: { status: string; conclusion?: string; url: string };
  error?: string;
}> {
  const creds = getCredentials('github');
  const token = creds.token;
  const targetRepo = repo || creds.defaultRepo;

  if (!token) return { success: false, error: 'GitHub token not configured' };
  if (!targetRepo) return { success: false, error: 'Repository not specified' };

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
  };

  try {
    const [repoRes, prsRes, commitsRes, runsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${targetRepo}`, { headers }),
      fetch(`https://api.github.com/repos/${targetRepo}/pulls?state=open&per_page=1`, { headers }),
      fetch(`https://api.github.com/repos/${targetRepo}/commits?per_page=5`, { headers }),
      fetch(`https://api.github.com/repos/${targetRepo}/actions/runs?per_page=1`, { headers }),
    ]);

    const repoData = await repoRes.json() as Record<string, unknown>;
    const prsData = await prsRes.json() as Array<unknown>;
    const commitsData = await commitsRes.json() as Array<Record<string, unknown>>;
    const runsData = await runsRes.json() as { workflow_runs?: Array<Record<string, unknown>> };

    const recentCommits = Array.isArray(commitsData)
      ? commitsData.map((c) => ({
          sha: (c.sha as string).slice(0, 7),
          message: ((c.commit as Record<string, unknown>).message as string).split('\n')[0],
          author: ((c.commit as Record<string, Record<string, string>>).author?.name) || 'unknown',
          date: ((c.commit as Record<string, Record<string, string>>).author?.date) || '',
        }))
      : [];

    const latestRun = runsData.workflow_runs?.[0];

    return {
      success: true,
      defaultBranch: repoData.default_branch as string,
      openPRs: Array.isArray(prsData) ? prsData.length : 0,
      recentCommits,
      latestWorkflowRun: latestRun
        ? {
            status: latestRun.status as string,
            conclusion: latestRun.conclusion as string | undefined,
            url: latestRun.html_url as string,
          }
        : undefined,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── list_pull_requests ───────────────────────────────────────────────────────
export async function listPullRequests(
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open',
  limit = 10
): Promise<{
  success: boolean;
  prs?: Array<{ number: number; title: string; author: string; branch: string; url: string; createdAt: string }>;
  error?: string;
}> {
  const creds = getCredentials('github');
  const token = creds.token;
  const targetRepo = repo || creds.defaultRepo;

  if (!token) return { success: false, error: 'GitHub token not configured' };
  if (!targetRepo) return { success: false, error: 'Repository not specified' };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${targetRepo}/pulls?state=${state}&per_page=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DevOps-Deploy-Agent-MCP/2.0',
        },
      }
    );

    const data = await res.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(data)) {
      return { success: false, error: 'Failed to fetch pull requests' };
    }

    return {
      success: true,
      prs: data.map((pr) => ({
        number: pr.number as number,
        title: pr.title as string,
        author: (pr.user as Record<string, string>)?.login || 'unknown',
        branch: (pr.head as Record<string, string>)?.ref || '',
        url: pr.html_url as string,
        createdAt: pr.created_at as string,
      })),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
