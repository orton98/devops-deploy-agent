# 🚀 DevOps Deploy Agent

A sleek one-click deployment interface powered by **Next.js 14** and **n8n** automation. Deploy to 6 major platforms with a single click.

```
[Frontend UI] → [n8n Webhook] → [Switch Router] → [Platform APIs]
     ↓              ↓                ↓
  One-click    Authenticate    GitHub/AWS/Railway/
  Deploy       Validate        Cloudflare/Render/DO
  Button       Queue Job       → Status Webhook
```

## ✨ Features

| Feature | Details |
|---|---|
| **One-Click Deploy** | Platform cards with hover effects & shimmer animations |
| **6 Platforms** | GitHub Pages, AWS Amplify, Railway, Cloudflare, Render, DigitalOcean |
| **Live Terminal Logs** | Real-time step-by-step deployment output |
| **Simulation Mode** | Works without n8n for demo/testing |
| **Config Panel** | Repo, branch, project, appId, service settings |
| **Deployment History** | Full log of all past deployments with status badges |
| **Status Webhook** | API endpoint receives n8n status callbacks |
| **n8n Automation** | Python script auto-creates the full workflow |

## 🏗️ Project Structure

```
devops-deploy-agent/
├── app/
│   ├── page.tsx                          # Main deploy dashboard
│   ├── layout.tsx                        # Root layout
│   ├── globals.css                       # Global styles
│   └── api/webhook/deploy-status/
│       └── route.ts                     # n8n status callback handler
├── components/
│   ├── PlatformCard.tsx                  # Deploy button cards
│   ├── DeploymentLog.tsx                 # Live terminal log viewer
│   └── ConfigPanel.tsx                  # Project settings panel
├── scripts/
│   └── create_n8n_workflow.py           # Auto-creates n8n workflow
├── types/
│   └── deployment.ts                    # TypeScript interfaces
├── lib/
│   └── utils.ts                         # Utility functions
├── .env.local                           # Your tokens (gitignored)
└── .env.example                         # Template (safe to commit)
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
# Edit .env.local with your API tokens
```

### 3. Start the Frontend

```bash
npm run dev
# Open http://localhost:3000
```

### 4. (Optional) Set Up n8n Backend

```bash
# Start n8n
npx n8n start

# Get your API key from n8n: Settings > n8n API > Create API key
# Add it to .env.local as N8N_API_KEY

# Create the workflow
python scripts/create_n8n_workflow.py
```

> **Note:** The frontend works in **simulation mode** without n8n — great for demos!

## 🔧 Platform Configuration

### GitHub Pages
- Token: `GITHUB_TOKEN` (needs `repo` + `pages` scope)
- Config: Set `repo` to `owner/repo-name`

### AWS Amplify
- Credentials: `AWS_ACCESS_KEY` + `AWS_SECRET_KEY`
- Config: Set `appId` to your Amplify App ID

### Railway
- Token: `RAILWAY_TOKEN`
- Config: Set `project` to your Railway Project ID

### Cloudflare Pages
- Token: `CLOUDFLARE_TOKEN` + `CF_ACCOUNT_ID`
- Config: Set `project` to your Pages project name

### Render
- Token: `RENDER_TOKEN`
- Config: Set `service` to your Render Service ID (e.g., `srv-xxxxx`)

### DigitalOcean
- Token: `DO_TOKEN`
- Config: Set `appId` to your DO App ID

## 🔌 n8n Workflow Architecture

```
Deploy Webhook (POST /webhook/deploy)
    │
    ▼
Validate Request (Code Node)
    │ Checks: platform, project, repo fields
    ▼
Platform Router (Switch Node)
    ├── github    → GitHub Pages Deploy (HTTP Request)
    ├── aws       → AWS Amplify Deploy (HTTP Request)
    ├── railway   → Railway Deploy (GraphQL)
    ├── cloudflare→ Cloudflare Pages Deploy (HTTP Request)
    ├── render    → Render Deploy (HTTP Request)
    └── digitalocean → DigitalOcean Deploy (HTTP Request)
         │
         ├── Respond to Client (immediate 200 OK)
         │
         └── Wait 15s → Check Status → Send Notification
                                            │
                                            ▼
                              POST /api/webhook/deploy-status
```

## 📡 Status Webhook API

The frontend exposes a webhook endpoint that n8n calls with deployment status updates:

```
POST /api/webhook/deploy-status
GET  /api/webhook/deploy-status  (returns last 20 statuses)
```

**Payload:**
```json
{
  "platform": "github",
  "status": "success",
  "project": "my-project",
  "url": "https://my-project.github.io",
  "deploymentId": "abc123",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🛠️ Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Icons:** Lucide React
- **Backend:** n8n (workflow automation)
- **Script:** Python 3.10+ (stdlib only, no pip install needed)

## 📝 License

MIT
