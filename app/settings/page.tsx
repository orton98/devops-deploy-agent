'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Github,
  Cloud,
  Train,
  Globe,
  Server,
  Droplet,
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Upload,
  Zap,
  AlertCircle,
  Wand2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PlatformSettings {
  github: {
    token: string;
    defaultRepo: string;
    defaultBranch: string;
    workflowFile: string;
  };
  aws: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    appId: string;
  };
  railway: {
    token: string;
    projectId: string;
    environment: string;
  };
  cloudflare: {
    token: string;
    accountId: string;
    projectName: string;
  };
  render: {
    apiKey: string;
    serviceId: string;
  };
  digitalocean: {
    token: string;
    appId: string;
  };
}

const DEFAULT_SETTINGS: PlatformSettings = {
  github: { token: '', defaultRepo: '', defaultBranch: 'main', workflowFile: 'deploy.yml' },
  aws: { accessKeyId: '', secretAccessKey: '', region: 'us-east-1', appId: '' },
  railway: { token: '', projectId: '', environment: 'production' },
  cloudflare: { token: '', accountId: '', projectName: '' },
  render: { apiKey: '', serviceId: '' },
  digitalocean: { token: '', appId: '' },
};

type Platform = keyof PlatformSettings;
type TestStatus = 'idle' | 'testing' | 'success' | 'failed';
type SetupStatus = 'idle' | 'running' | 'success' | 'failed';

interface SetupStep {
  step: string;
  status: 'ok' | 'error';
  detail?: string;
}

interface SetupResult {
  message: string;
  repoUrl?: string;
  pagesUrl?: string;
  defaultRepo?: string;
  projectId?: string;
  projectUrl?: string;
  serviceId?: string;
  serviceUrl?: string;
  dashboardUrl?: string;
  appId?: string;
  appUrl?: string;
  consoleUrl?: string;
  projectName?: string;
}

interface SetupApiResponse {
  success: boolean;
  steps?: SetupStep[];
  result?: SetupResult;
  error?: string;
  hint?: string;
  createRepoUrl?: string;
}

const PLATFORMS: { id: Platform; name: string; icon: React.ElementType; color: string; docsUrl: string }[] = [
  { id: 'github', name: 'GitHub', icon: Github, color: 'from-gray-600 to-gray-800', docsUrl: 'https://github.com/settings/tokens' },
  { id: 'aws', name: 'AWS Amplify', icon: Cloud, color: 'from-orange-500 to-red-700', docsUrl: 'https://console.aws.amazon.com/iam' },
  { id: 'railway', name: 'Railway', icon: Train, color: 'from-indigo-500 to-purple-700', docsUrl: 'https://railway.app/account/tokens' },
  { id: 'cloudflare', name: 'Cloudflare', icon: Globe, color: 'from-orange-400 to-orange-700', docsUrl: 'https://dash.cloudflare.com/profile/api-tokens' },
  { id: 'render', name: 'Render', icon: Server, color: 'from-emerald-500 to-green-700', docsUrl: 'https://dashboard.render.com/u/settings#api-keys' },
  { id: 'digitalocean', name: 'DigitalOcean', icon: Droplet, color: 'from-blue-500 to-cyan-700', docsUrl: 'https://cloud.digitalocean.com/account/api/tokens' },
];

// ─── Masked Input ─────────────────────────────────────────────────────────────
function SecretInput({
  label, value, onChange, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm font-mono text-slate-200 placeholder-slate-600"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function TextInput({
  label, value, onChange, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm text-slate-200 placeholder-slate-600"
      />
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Platform Forms ───────────────────────────────────────────────────────────
function GitHubForm({ s, set }: { s: PlatformSettings['github']; set: (v: PlatformSettings['github']) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <SecretInput label="Personal Access Token" value={s.token} onChange={(v) => set({ ...s, token: v })}
          placeholder="github_pat_..." hint="Requires: repo, workflow scopes" />
      </div>
      <TextInput label="Default Repository" value={s.defaultRepo} onChange={(v) => set({ ...s, defaultRepo: v })}
        placeholder="username/repo-name" hint="e.g. orton98/devops-deploy-agent" />
      <TextInput label="Default Branch" value={s.defaultBranch} onChange={(v) => set({ ...s, defaultBranch: v })}
        placeholder="main" />
      <TextInput label="Workflow File" value={s.workflowFile} onChange={(v) => set({ ...s, workflowFile: v })}
        placeholder="deploy.yml" hint=".github/workflows/deploy.yml" />
    </div>
  );
}

function AWSForm({ s, set }: { s: PlatformSettings['aws']; set: (v: PlatformSettings['aws']) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SecretInput label="Access Key ID" value={s.accessKeyId} onChange={(v) => set({ ...s, accessKeyId: v })}
        placeholder="AKIAIOSFODNN7EXAMPLE" />
      <SecretInput label="Secret Access Key" value={s.secretAccessKey} onChange={(v) => set({ ...s, secretAccessKey: v })}
        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" />
      <TextInput label="Region" value={s.region} onChange={(v) => set({ ...s, region: v })}
        placeholder="us-east-1" />
      <TextInput label="Amplify App ID" value={s.appId} onChange={(v) => set({ ...s, appId: v })}
        placeholder="d1234abcd5678" hint="Found in Amplify Console → App settings" />
    </div>
  );
}

function RailwayForm({ s, set }: { s: PlatformSettings['railway']; set: (v: PlatformSettings['railway']) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <SecretInput label="API Token" value={s.token} onChange={(v) => set({ ...s, token: v })}
          placeholder="railway_token_..." hint="Railway Dashboard → Account → Tokens" />
      </div>
      <TextInput label="Project ID" value={s.projectId} onChange={(v) => set({ ...s, projectId: v })}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" hint="Railway Dashboard → Project → Settings" />
      <TextInput label="Environment" value={s.environment} onChange={(v) => set({ ...s, environment: v })}
        placeholder="production" />
    </div>
  );
}

function CloudflareForm({ s, set }: { s: PlatformSettings['cloudflare']; set: (v: PlatformSettings['cloudflare']) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <SecretInput label="API Token" value={s.token} onChange={(v) => set({ ...s, token: v })}
          placeholder="cf_token_..." hint="Cloudflare Dashboard → Profile → API Tokens" />
      </div>
      <TextInput label="Account ID" value={s.accountId} onChange={(v) => set({ ...s, accountId: v })}
        placeholder="abcdef1234567890abcdef1234567890" hint="Cloudflare Dashboard → right sidebar" />
      <TextInput label="Pages Project Name" value={s.projectName} onChange={(v) => set({ ...s, projectName: v })}
        placeholder="my-pages-project" />
    </div>
  );
}

function RenderForm({ s, set }: { s: PlatformSettings['render']; set: (v: PlatformSettings['render']) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <SecretInput label="API Key" value={s.apiKey} onChange={(v) => set({ ...s, apiKey: v })}
          placeholder="rnd_..." hint="Render Dashboard → Account Settings → API Keys" />
      </div>
      <TextInput label="Service ID" value={s.serviceId} onChange={(v) => set({ ...s, serviceId: v })}
        placeholder="srv-xxxxxxxxxxxxxxxx" hint="Render Dashboard → Service → Settings" />
    </div>
  );
}

function DigitalOceanForm({ s, set }: { s: PlatformSettings['digitalocean']; set: (v: PlatformSettings['digitalocean']) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <SecretInput label="Personal Access Token" value={s.token} onChange={(v) => set({ ...s, token: v })}
          placeholder="dop_v1_..." hint="DigitalOcean → API → Personal access tokens" />
      </div>
      <TextInput label="App ID" value={s.appId} onChange={(v) => set({ ...s, appId: v })}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" hint="DigitalOcean → Apps → App Settings" />
    </div>
  );
}

// ─── Quick Setup Panel ────────────────────────────────────────────────────────
function QuickSetupPanel({
  platform,
  settings,
  onSuccess,
}: {
  platform: Platform;
  settings: PlatformSettings;
  onSuccess: (platform: Platform, result: SetupResult) => void;
}) {
  const [status, setStatus] = useState<SetupStatus>('idle');
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState('');
  const [manualRepoUrl, setManualRepoUrl] = useState('');
  const [repoName, setRepoName] = useState('devops-deploy-agent');
  const [expanded, setExpanded] = useState(false);

  const SETUP_LABELS: Record<Platform, { label: string; desc: string }> = {
    github: { label: 'Create Repo & Push Code', desc: 'Creates GitHub repo, pushes project files, enables Pages' },
    railway: { label: 'Create Railway Project', desc: 'Creates project + service via Railway API' },
    cloudflare: { label: 'Create Pages Project', desc: 'Creates Cloudflare Pages project with build config' },
    render: { label: 'Create Render Service', desc: 'Creates a free web service on Render' },
    digitalocean: { label: 'Create DO App', desc: 'Creates App Platform app on DigitalOcean' },
    aws: { label: 'Create Amplify App', desc: 'Creates AWS Amplify app with build spec' },
  };

  const runSetup = async () => {
    setStatus('running');
    setSteps([]);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/platform-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          settings: settings[platform],
          repoName,
        }),
      });
      const data: SetupApiResponse = await res.json();

      if (data.steps) setSteps(data.steps);

      if (data.success && data.result) {
        setStatus('success');
        setResult(data.result);
        setExpanded(true);
        onSuccess(platform, data.result);
      } else if (data.hint === 'create_repo_manually' && data.createRepoUrl) {
        setStatus('failed');
        setError(data.error || 'Setup failed');
        setManualRepoUrl(data.createRepoUrl);
      } else {
        setStatus('failed');
        setError(data.error || 'Setup failed');
      }
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Network error');
    }
  };

  const info = SETUP_LABELS[platform];

  return (
    <div className="mt-6 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-900/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Wand2 className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">⚡ Quick Setup: {info.label}</p>
            <p className="text-xs text-slate-500">{info.desc}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {expanded && (
        <div className="p-4 bg-slate-950/50 border-t border-slate-700/50">
          {/* Repo name input */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Project / App Name</label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                placeholder="devops-deploy-agent"
              />
            </div>
            <div className="pt-5">
              <button
                onClick={runSetup}
                disabled={status === 'running'}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  status === 'running'
                    ? 'bg-purple-600/50 text-purple-300 cursor-not-allowed'
                    : status === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {status === 'running' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</>
                ) : status === 'success' ? (
                  <><CheckCircle2 className="w-4 h-4" /> Done!</>
                ) : (
                  <><Wand2 className="w-4 h-4" /> Run Setup</>
                )}
              </button>
            </div>
          </div>

          {/* Steps progress */}
          {steps.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {steps.map((s, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs px-3 py-1.5 rounded-lg ${
                  s.status === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                }`}>
                  {s.status === 'ok'
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span>{s.step}{s.detail ? ` — ${s.detail}` : ''}</span>
                </div>
              ))}
              {status === 'running' && (
                <div className="flex items-center gap-2 text-xs px-3 py-1.5 text-blue-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Working...</span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="space-y-2 mb-3">
              <div className="flex items-start gap-2 text-xs px-3 py-2 bg-red-500/10 text-red-300 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {error}
              </div>
              {manualRepoUrl && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs">
                  <span className="text-blue-300">👉 Create the repo first, then run Quick Setup again to push files:</span>
                  <a
                    href={manualRepoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 underline font-medium whitespace-nowrap"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Create on GitHub →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm">
              <p className="text-emerald-300 font-medium mb-2">{result.message}</p>
              <div className="flex flex-wrap gap-2">
                {(result.repoUrl || result.projectUrl || result.dashboardUrl || result.consoleUrl) && (
                  <a
                    href={result.repoUrl || result.projectUrl || result.dashboardUrl || result.consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open Dashboard
                  </a>
                )}
                {(result.pagesUrl || result.serviceUrl || result.appUrl) && (
                  <a
                    href={result.pagesUrl || result.serviceUrl || result.appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View Live Site
                  </a>
                )}
              </div>
              {/* Show auto-filled IDs */}
              {result.defaultRepo && (
                <p className="text-xs text-slate-400 mt-2">✅ Default Repo auto-filled: <code className="text-slate-300">{result.defaultRepo}</code></p>
              )}
              {result.projectId && (
                <p className="text-xs text-slate-400 mt-1">✅ Project ID auto-filled: <code className="text-slate-300">{result.projectId}</code></p>
              )}
              {result.serviceId && (
                <p className="text-xs text-slate-400 mt-1">✅ Service ID auto-filled: <code className="text-slate-300">{result.serviceId}</code></p>
              )}
              {result.appId && (
                <p className="text-xs text-slate-400 mt-1">✅ App ID auto-filled: <code className="text-slate-300">{result.appId}</code></p>
              )}
              {result.projectName && (
                <p className="text-xs text-slate-400 mt-1">✅ Project Name auto-filled: <code className="text-slate-300">{result.projectName}</code></p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<Platform>('github');
  const [testStatus, setTestStatus] = useState<Record<Platform, TestStatus>>({
    github: 'idle', aws: 'idle', railway: 'idle',
    cloudflare: 'idle', render: 'idle', digitalocean: 'idle',
  });
  const [testMessages, setTestMessages] = useState<Record<Platform, string>>({
    github: '', aws: '', railway: '', cloudflare: '', render: '', digitalocean: '',
  });
  const [saved, setSaved] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('devops-agent-settings');
      if (stored) setSettings(JSON.parse(stored));
    } catch {}
  }, []);

  const save = () => {
    localStorage.setItem('devops-agent-settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const testConnection = async (platform: Platform) => {
    setTestStatus((p) => ({ ...p, [platform]: 'testing' }));
    setTestMessages((p) => ({ ...p, [platform]: '' }));

    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, settings: settings[platform] }),
      });
      const data = await res.json();

      if (data.success) {
        setTestStatus((p) => ({ ...p, [platform]: 'success' }));
        setTestMessages((p) => ({ ...p, [platform]: data.message || 'Connection successful!' }));
      } else {
        setTestStatus((p) => ({ ...p, [platform]: 'failed' }));
        setTestMessages((p) => ({ ...p, [platform]: data.error || 'Connection failed' }));
      }
    } catch (err) {
      setTestStatus((p) => ({ ...p, [platform]: 'failed' }));
      setTestMessages((p) => ({ ...p, [platform]: 'Network error — check console' }));
    }
  };

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devops-agent-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch {
        alert('Invalid settings file');
      }
    };
    reader.readAsText(file);
  };

  const updatePlatform = <K extends Platform>(platform: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [platform]: value }));
    setTestStatus((p) => ({ ...p, [platform]: 'idle' }));
  };

  // Called when Quick Setup succeeds — auto-fill the relevant ID fields
  const handleSetupSuccess = (platform: Platform, result: SetupResult) => {
    setSettings((prev) => {
      const updated = { ...prev };
      if (platform === 'github' && result.defaultRepo) {
        updated.github = { ...prev.github, defaultRepo: result.defaultRepo };
      }
      if (platform === 'railway' && result.projectId) {
        updated.railway = { ...prev.railway, projectId: result.projectId };
      }
      if (platform === 'cloudflare' && result.projectName) {
        updated.cloudflare = { ...prev.cloudflare, projectName: result.projectName };
      }
      if (platform === 'render' && result.serviceId) {
        updated.render = { ...prev.render, serviceId: result.serviceId };
      }
      if (platform === 'digitalocean' && result.appId) {
        updated.digitalocean = { ...prev.digitalocean, appId: result.appId };
      }
      if (platform === 'aws' && result.appId) {
        updated.aws = { ...prev.aws, appId: result.appId };
      }
      // Auto-save
      localStorage.setItem('devops-agent-settings', JSON.stringify(updated));
      return updated;
    });
  };

  const activePlatform = PLATFORMS.find((p) => p.id === activeTab)!;
  const Icon = activePlatform.icon;
  const ts = testStatus[activeTab];
  const tm = testMessages[activeTab];

  // Check which platforms are configured
  const isConfigured = (p: Platform) => {
    const s = settings[p];
    if (p === 'github') return !!(s as PlatformSettings['github']).token;
    if (p === 'aws') return !!(s as PlatformSettings['aws']).accessKeyId;
    if (p === 'railway') return !!(s as PlatformSettings['railway']).token;
    if (p === 'cloudflare') return !!(s as PlatformSettings['cloudflare']).token;
    if (p === 'render') return !!(s as PlatformSettings['render']).apiKey;
    if (p === 'digitalocean') return !!(s as PlatformSettings['digitalocean']).token;
    return false;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Nav */}
      <div className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                DevOps Deploy Agent
              </h1>
              <p className="text-xs text-slate-500">API Settings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Deploy
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Platform API Settings</h2>
            <p className="text-slate-400 text-sm mt-1">
              Configure credentials for each deployment platform. Settings are stored locally in your browser.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Import */}
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              Import
              <input type="file" accept=".json" onChange={importSettings} className="hidden" />
            </label>
            {/* Export */}
            <button
              onClick={exportSettings}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {/* Save */}
            <button
              onClick={save}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Status overview */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
          {PLATFORMS.map((p) => {
            const configured = isConfigured(p.id);
            const ts = testStatus[p.id];
            return (
              <button
                key={p.id}
                onClick={() => setActiveTab(p.id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-medium ${
                  activeTab === p.id
                    ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <p.icon className="w-5 h-5" />
                <span className="truncate w-full text-center">{p.name}</span>
                <div className="flex items-center gap-1">
                  {ts === 'success' ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : ts === 'failed' ? (
                    <XCircle className="w-3 h-3 text-red-400" />
                  ) : configured ? (
                    <div className="w-2 h-2 rounded-full bg-yellow-400" title="Configured, not tested" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-600" title="Not configured" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active platform form */}
        <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 overflow-hidden">
          {/* Platform header */}
          <div className={`p-6 bg-gradient-to-r ${activePlatform.color} bg-opacity-20`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/10 rounded-xl backdrop-blur">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{activePlatform.name}</h3>
                  <a
                    href={activePlatform.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-white/60 hover:text-white/90 underline"
                  >
                    Get API credentials →
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ts === 'success' && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" /> Connected
                  </span>
                )}
                {ts === 'failed' && (
                  <span className="flex items-center gap-1.5 text-sm text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg">
                    <XCircle className="w-4 h-4" /> Failed
                  </span>
                )}
                <button
                  onClick={() => testConnection(activeTab)}
                  disabled={ts === 'testing'}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  {ts === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Test Connection
                </button>
              </div>
            </div>
            {tm && (
              <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                ts === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
              }`}>
                {ts === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {tm}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="p-6">
            {activeTab === 'github' && (
              <GitHubForm s={settings.github} set={(v) => updatePlatform('github', v)} />
            )}
            {activeTab === 'aws' && (
              <AWSForm s={settings.aws} set={(v) => updatePlatform('aws', v)} />
            )}
            {activeTab === 'railway' && (
              <RailwayForm s={settings.railway} set={(v) => updatePlatform('railway', v)} />
            )}
            {activeTab === 'cloudflare' && (
              <CloudflareForm s={settings.cloudflare} set={(v) => updatePlatform('cloudflare', v)} />
            )}
            {activeTab === 'render' && (
              <RenderForm s={settings.render} set={(v) => updatePlatform('render', v)} />
            )}
            {activeTab === 'digitalocean' && (
              <DigitalOceanForm s={settings.digitalocean} set={(v) => updatePlatform('digitalocean', v)} />
            )}

            {/* Quick Setup Panel — shown for all platforms */}
            <QuickSetupPanel
              platform={activeTab}
              settings={settings}
              onSuccess={handleSetupSuccess}
            />
          </div>
        </div>

        {/* Info box */}
        <div className="mt-4 flex items-start gap-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 text-sm text-slate-400">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-300">Security note:</strong> Settings are stored in your browser&apos;s localStorage.
            When you click Deploy, credentials are sent to the Next.js server-side API route (never exposed in the browser network tab).
            For production use, store tokens in environment variables instead.
          </div>
        </div>
      </div>
    </div>
  );
}
