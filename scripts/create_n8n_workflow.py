#!/usr/bin/env python3
"""
DevOps Deploy Agent — n8n Workflow Creator
==========================================
Run this script to automatically create and activate the DevOps deployment
workflow in your n8n instance.

Usage:
    python scripts/create_n8n_workflow.py

Environment Variables (set in .env.local or export before running):
    N8N_URL           - n8n base URL (default: http://localhost:5678)
    N8N_API_KEY       - n8n API key (from n8n Settings > API)
    GITHUB_TOKEN      - GitHub Personal Access Token
    AWS_ACCESS_KEY    - AWS Access Key ID
    AWS_SECRET_KEY    - AWS Secret Access Key
    RAILWAY_TOKEN     - Railway API Token
    CLOUDFLARE_TOKEN  - Cloudflare API Token
    CF_ACCOUNT_ID     - Cloudflare Account ID
    RENDER_TOKEN      - Render API Token
    DO_TOKEN          - DigitalOcean Personal Access Token
"""

import json
import urllib.request
import urllib.error
import os
import sys


# ── Configuration ────────────────────────────────────────────────────────────

N8N = os.getenv("N8N_URL", "http://localhost:5678")
KEY = os.getenv("N8N_API_KEY", "your-n8n-api-key")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "ghp_...")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY", "AKIA...")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_KEY", "...")
RAILWAY_TOKEN = os.getenv("RAILWAY_TOKEN", "...")
CLOUDFLARE_TOKEN = os.getenv("CLOUDFLARE_TOKEN", "...")
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "...")
RENDER_TOKEN = os.getenv("RENDER_TOKEN", "...")
DO_TOKEN = os.getenv("DO_TOKEN", "...")


# ── Workflow Definition ───────────────────────────────────────────────────────

workflow = {
    "name": "DevOps Deploy Agent",
    "nodes": [
        # ── 1. Webhook Entry Point ──────────────────────────────────────────
        {
            "id": "webhook",
            "name": "Deploy Webhook",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [200, 400],
            "webhookId": "deploy-agent",
            "parameters": {
                "httpMethod": "POST",
                "path": "deploy",
                "responseMode": "responseNode",
                "options": {}
            }
        },

        # ── 2. Validate & Sanitize Request ──────────────────────────────────
        {
            "id": "validate",
            "name": "Validate Request",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [420, 400],
            "parameters": {
                "jsCode": r"""
const body = $input.first().json.body || $input.first().json || {};
const required = ['platform', 'project', 'repo'];
const missing = required.filter(k => !body[k]);

if (missing.length > 0) {
  return [{ json: {
    error: `Missing required fields: ${missing.join(', ')}`,
    status: 'validation_failed',
    timestamp: new Date().toISOString()
  }}];
}

const platforms = ['github', 'aws', 'railway', 'cloudflare', 'render', 'digitalocean'];
if (!platforms.includes(body.platform)) {
  return [{ json: {
    error: `Invalid platform: "${body.platform}". Must be one of: ${platforms.join(', ')}`,
    status: 'validation_failed',
    timestamp: new Date().toISOString()
  }}];
}

return [{ json: {
  ...body,
  status: 'validated',
  timestamp: new Date().toISOString()
}}];
"""
            }
        },

        # ── 3. Platform Router (Switch) ─────────────────────────────────────
        {
            "id": "switch",
            "name": "Platform Router",
            "type": "n8n-nodes-base.switch",
            "typeVersion": 3,
            "position": [640, 400],
            "parameters": {
                "mode": "rules",
                "rules": {
                    "values": [
                        {
                            "conditions": {
                                "conditions": [{"leftValue": "={{ $json.platform }}", "rightValue": "github", "operator": {"type": "string", "operation": "equals"}}],
                                "combinator": "and"
                            },
                            "outputKey": "github"
                        },
                        {
                            "conditions": {
                                "conditions": [{"leftValue": "={{ $json.platform }}", "rightValue": "aws", "operator": {"type": "string", "operation": "equals"}}],
                                "combinator": "and"
                            },
                            "outputKey": "aws"
                        },
                        {
                            "conditions": {
                                "conditions": [{"leftValue": "={{ $json.platform }}", "rightValue": "railway", "operator": {"type": "string", "operation": "equals"}}],
                                "combinator": "and"
                            },
                            "outputKey": "railway"
                        },
                        {
                            "conditions": {
                                "conditions": [{"leftValue": "={{ $json.platform }}", "rightValue": "cloudflare", "operator": {"type": "string", "operation": "equals"}}],
                                "combinator": "and"
                            },
                            "outputKey": "cloudflare"
                        },
                        {
                            "conditions": {
                                "conditions": [{"leftValue": "={{ $json.platform }}", "rightValue": "render", "operator": {"type": "string", "operation": "equals"}}],
                                "combinator": "and"
                            },
                            "outputKey": "render"
                        },
                        {
                            "conditions": {
                                "conditions": [{"leftValue": "={{ $json.platform }}", "rightValue": "digitalocean", "operator": {"type": "string", "operation": "equals"}}],
                                "combinator": "and"
                            },
                            "outputKey": "digitalocean"
                        }
                    ]
                }
            }
        },

        # ── 4a. GitHub Pages Deploy ─────────────────────────────────────────
        {
            "id": "github_deploy",
            "name": "GitHub Pages Deploy",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [880, 80],
            "parameters": {
                "method": "POST",
                "url": "={{ `https://api.github.com/repos/${$json.repo}/pages/builds` }}",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Authorization", "value": f"Bearer {GITHUB_TOKEN}"},
                        {"name": "Accept", "value": "application/vnd.github.v3+json"},
                        {"name": "X-GitHub-Api-Version", "value": "2022-11-28"}
                    ]
                },
                "options": {}
            }
        },

        # ── 4b. AWS Amplify Deploy ──────────────────────────────────────────
        {
            "id": "aws_deploy",
            "name": "AWS Amplify Deploy",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [880, 200],
            "parameters": {
                "method": "POST",
                "url": "={{ `https://amplify.${$json.region || 'us-east-1'}.amazonaws.com/apps/${$json.appId}/branches/${$json.branch || 'main'}/jobs` }}",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Content-Type", "value": "application/json"}
                    ]
                },
                "sendBody": True,
                "contentType": "json",
                "body": "={{ JSON.stringify({ jobType: 'RELEASE', commitId: $json.commit || 'HEAD' }) }}",
                "options": {}
            }
        },

        # ── 4c. Railway Deploy ──────────────────────────────────────────────
        {
            "id": "railway_deploy",
            "name": "Railway Deploy",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [880, 320],
            "parameters": {
                "method": "POST",
                "url": "https://backboard.railway.app/graphql/v2",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Authorization", "value": f"Bearer {RAILWAY_TOKEN}"},
                        {"name": "Content-Type", "value": "application/json"}
                    ]
                },
                "sendBody": True,
                "contentType": "json",
                "body": '={{ JSON.stringify({ query: `mutation { deploymentCreate(input: { projectId: "${$json.project}", environmentId: "${$json.env || \'production\'}" }) { id status } }` }) }}',
                "options": {}
            }
        },

        # ── 4d. Cloudflare Pages Deploy ─────────────────────────────────────
        {
            "id": "cloudflare_deploy",
            "name": "Cloudflare Pages Deploy",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [880, 440],
            "parameters": {
                "method": "POST",
                "url": f"={{`https://api.cloudflare.com/client/v4/accounts/${{$json.accountId || '{CF_ACCOUNT_ID}'}}/pages/projects/${{$json.project}}/deployments`}}",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Authorization", "value": f"Bearer {CLOUDFLARE_TOKEN}"},
                        {"name": "Content-Type", "value": "application/json"}
                    ]
                },
                "options": {}
            }
        },

        # ── 4e. Render Deploy ───────────────────────────────────────────────
        {
            "id": "render_deploy",
            "name": "Render Deploy",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [880, 560],
            "parameters": {
                "method": "POST",
                "url": "={{ `https://api.render.com/v1/services/${$json.service}/deploys` }}",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Authorization", "value": f"Bearer {RENDER_TOKEN}"},
                        {"name": "Accept", "value": "application/json"},
                        {"name": "Content-Type", "value": "application/json"}
                    ]
                },
                "sendBody": True,
                "contentType": "json",
                "body": '={{ JSON.stringify({ clearCache: "do_not_clear" }) }}',
                "options": {}
            }
        },

        # ── 4f. DigitalOcean App Deploy ─────────────────────────────────────
        {
            "id": "do_deploy",
            "name": "DigitalOcean App Deploy",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [880, 680],
            "parameters": {
                "method": "POST",
                "url": "={{ `https://api.digitalocean.com/v2/apps/${$json.appId}/deployments` }}",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Authorization", "value": f"Bearer {DO_TOKEN}"},
                        {"name": "Content-Type", "value": "application/json"}
                    ]
                },
                "sendBody": True,
                "contentType": "json",
                "body": '={{ JSON.stringify({ force_build: true }) }}',
                "options": {}
            }
        },

        # ── 5. Respond to Client Immediately ────────────────────────────────
        {
            "id": "respond",
            "name": "Respond to Client",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1,
            "position": [1120, 400],
            "parameters": {
                "respondWith": "json",
                "responseBody": '={{ JSON.stringify({ success: true, deploymentId: $json.id || $json.jobId || $json.data?.deploymentCreate?.id, platform: $json.platform, status: "initiated", message: `Deployment to ${$json.platform} started successfully`, timestamp: new Date().toISOString() }) }}',
                "options": {"responseCode": 200}
            }
        },

        # ── 6. Wait Before Status Check ─────────────────────────────────────
        {
            "id": "wait_status",
            "name": "Wait 15s",
            "type": "n8n-nodes-base.wait",
            "typeVersion": 1,
            "position": [1120, 560],
            "parameters": {
                "resume": "afterTimeInterval",
                "amount": 15,
                "unit": "seconds"
            }
        },

        # ── 7. Check Deployment Status ──────────────────────────────────────
        {
            "id": "check_status",
            "name": "Check Deployment Status",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [1340, 560],
            "parameters": {
                "jsCode": r"""
const input = $input.first().json;
const platform = input.platform;
const jobId = input.id || input.jobId || input.data?.deploymentCreate?.id;

const statusEndpoints = {
  github: `https://api.github.com/repos/${input.repo}/pages`,
  render: `https://api.render.com/v1/services/${input.service}/deploys/${jobId}`,
  digitalocean: `https://api.digitalocean.com/v2/apps/${input.appId}/deployments/${jobId}`,
  railway: null, // Uses GraphQL polling
  cloudflare: `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/pages/projects/${input.project}/deployments/${jobId}`,
  aws: `https://amplify.us-east-1.amazonaws.com/apps/${input.appId}/jobs/${jobId}`
};

return [{ json: {
  platform,
  jobId,
  status: 'polling',
  checkUrl: statusEndpoints[platform] || null,
  originalPayload: input,
  checkedAt: new Date().toISOString()
}}];
"""
            }
        },

        # ── 8. Send Status Notification ─────────────────────────────────────
        {
            "id": "notify",
            "name": "Send Status Notification",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [1560, 560],
            "parameters": {
                "method": "POST",
                "url": "={{ $json.originalPayload?.webhookUrl || 'http://localhost:3000/api/webhook/deploy-status' }}",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Content-Type", "value": "application/json"}
                    ]
                },
                "sendBody": True,
                "contentType": "json",
                "body": '={{ JSON.stringify({ platform: $json.platform, status: $json.status, jobId: $json.jobId, project: $json.originalPayload?.project, timestamp: new Date().toISOString() }) }}',
                "options": {
                    "timeout": 5000,
                    "response": {"response": {"neverError": True}}
                }
            }
        }
    ],

    # ── Node Connections ──────────────────────────────────────────────────────
    "connections": {
        "Deploy Webhook": {
            "main": [[{"node": "Validate Request", "type": "main", "index": 0}]]
        },
        "Validate Request": {
            "main": [[{"node": "Platform Router", "type": "main", "index": 0}]]
        },
        "Platform Router": {
            "main": [
                [{"node": "GitHub Pages Deploy", "type": "main", "index": 0}],
                [{"node": "AWS Amplify Deploy", "type": "main", "index": 0}],
                [{"node": "Railway Deploy", "type": "main", "index": 0}],
                [{"node": "Cloudflare Pages Deploy", "type": "main", "index": 0}],
                [{"node": "Render Deploy", "type": "main", "index": 0}],
                [{"node": "DigitalOcean App Deploy", "type": "main", "index": 0}]
            ]
        },
        "GitHub Pages Deploy": {
            "main": [[
                {"node": "Respond to Client", "type": "main", "index": 0},
                {"node": "Wait 15s", "type": "main", "index": 0}
            ]]
        },
        "AWS Amplify Deploy": {
            "main": [[
                {"node": "Respond to Client", "type": "main", "index": 0},
                {"node": "Wait 15s", "type": "main", "index": 0}
            ]]
        },
        "Railway Deploy": {
            "main": [[
                {"node": "Respond to Client", "type": "main", "index": 0},
                {"node": "Wait 15s", "type": "main", "index": 0}
            ]]
        },
        "Cloudflare Pages Deploy": {
            "main": [[
                {"node": "Respond to Client", "type": "main", "index": 0},
                {"node": "Wait 15s", "type": "main", "index": 0}
            ]]
        },
        "Render Deploy": {
            "main": [[
                {"node": "Respond to Client", "type": "main", "index": 0},
                {"node": "Wait 15s", "type": "main", "index": 0}
            ]]
        },
        "DigitalOcean App Deploy": {
            "main": [[
                {"node": "Respond to Client", "type": "main", "index": 0},
                {"node": "Wait 15s", "type": "main", "index": 0}
            ]]
        },
        "Wait 15s": {
            "main": [[{"node": "Check Deployment Status", "type": "main", "index": 0}]]
        },
        "Check Deployment Status": {
            "main": [[{"node": "Send Status Notification", "type": "main", "index": 0}]]
        }
    },

    "settings": {
        "executionOrder": "v1",
        "saveManualExecutions": True,
        "callerPolicy": "workflowsFromSameOwner"
    }
}


# ── API Helpers ───────────────────────────────────────────────────────────────

def n8n_request(path: str, method: str = "GET", data: dict = None) -> dict:
    """Make an authenticated request to the n8n API."""
    url = f"{N8N}/api/v1{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "X-N8N-API-KEY": KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        method=method
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def check_n8n_connection() -> bool:
    """Verify n8n is reachable and API key is valid."""
    try:
        result = n8n_request("/workflows?limit=1")
        return True
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print(f"❌ Authentication failed — check your N8N_API_KEY")
        else:
            print(f"❌ n8n API error: HTTP {e.code}")
        return False
    except Exception as e:
        print(f"❌ Cannot reach n8n at {N8N}: {e}")
        return False


def find_existing_workflow(name: str) -> str | None:
    """Find an existing workflow by name, return its ID."""
    try:
        result = n8n_request("/workflows?limit=50")
        for wf in result.get("data", []):
            if wf.get("name") == name:
                return wf["id"]
    except Exception:
        pass
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  DevOps Deploy Agent — n8n Workflow Setup")
    print("=" * 60)
    print(f"\n📡 n8n URL: {N8N}")
    print(f"🔑 API Key: {'*' * (len(KEY) - 4) + KEY[-4:] if len(KEY) > 4 else '****'}\n")

    # 1. Check connection
    print("🔍 Checking n8n connection...")
    if not check_n8n_connection():
        print("\n💡 Make sure n8n is running: npx n8n start")
        print("   Then get your API key from: Settings > n8n API > Create an API key")
        sys.exit(1)
    print("✅ Connected to n8n successfully!\n")

    # 2. Check for existing workflow
    existing_id = find_existing_workflow("DevOps Deploy Agent")
    if existing_id:
        print(f"⚠️  Found existing workflow (id={existing_id})")
        print("   Deleting and recreating...")
        try:
            n8n_request(f"/workflows/{existing_id}", method="DELETE")
            print("   ✅ Deleted old workflow")
        except Exception as e:
            print(f"   ⚠️  Could not delete: {e}")

    # 3. Create workflow
    print("📝 Creating DevOps Deploy Agent workflow...")
    try:
        result = n8n_request("/workflows", method="POST", data=workflow)
        wid = result["id"]
        print(f"✅ Workflow created! ID: {wid}")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"❌ Failed to create workflow: HTTP {e.code}")
        print(f"   Response: {error_body[:500]}")
        sys.exit(1)

    # 4. Activate workflow
    print("🔄 Activating workflow...")
    try:
        n8n_request(f"/workflows/{wid}/activate", method="POST", data={})
        print("✅ Workflow activated!")
    except urllib.error.HTTPError as e:
        print(f"⚠️  Could not activate: HTTP {e.code} — activate manually in n8n UI")

    # 5. Summary
    print("\n" + "=" * 60)
    print("  🚀 Setup Complete!")
    print("=" * 60)
    print(f"\n  Webhook URL: {N8N}/webhook/deploy")
    print(f"  Workflow ID: {wid}")
    print(f"\n  Next steps:")
    print(f"  1. Add your API tokens to .env.local")
    print(f"  2. Run: npm run dev")
    print(f"  3. Open: http://localhost:3000")
    print(f"  4. Click any platform card to deploy!\n")


if __name__ == "__main__":
    main()
