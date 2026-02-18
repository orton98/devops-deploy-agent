'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  Github,
  Cloud,
  Train,
  Globe,
  Server,
  Droplet,
  Rocket,
  RefreshCw,
  Settings,
  Activity,
  Zap,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import PlatformCard from '@/components/PlatformCard';
import DeploymentLog from '@/components/DeploymentLog';
import ConfigPanel from '@/components/ConfigPanel';
import type { Deployment, DeployConfig } from '@/types/deployment';
import type { PlatformSettings } from '@/app/settings/page';

const PLATFORMS = [
  {
    id: 'github',
    name: 'GitHub Pages',
    icon: Github,
    color: 'from-gray-600 to-gray-900',
    description: 'Static sites & Jekyll',
    urlSuffix: 'github.io',
  },
  {
    id: 'aws',
    name: 'AWS Amplify',
    icon: Cloud,
    color: 'from-orange-500 to-red-700',
    description: 'Full-stack web apps',
    urlSuffix: 'amplifyapp.com',
  },
  {
    id: 'railway',
    name: 'Railway',
    icon: Train,
    color: 'from-indigo-500 to-purple-700',
    description: 'Container deployments',
    urlSuffix: 'railway.app',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Pages',
    icon: Globe,
    color: 'from-orange-400 to-orange-700',
    description: 'Edge deployment',
    urlSuffix: 'pages.dev',
  },
  {
    id: 'render',
    name: 'Render',
    icon: Server,
    color: 'from-emerald-500 to-green-700',
    description: 'Web services & databases',
    urlSuffix: 'onrender.com',
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    icon: Droplet,
    color: 'from-blue-500 to-cyan-700',
    description: 'App Platform',
    urlSuffix: 'ondigitalocean.app',
  },
];

const DEPLOY_STEPS = [
  'Validating credentials...',
  'Connecting to platform API...',
  'Triggering deployment pipeline...',
  'Building project artifacts...',
  'Deploying to edge nodes...',
  'Running health checks...',
  'Warming up CDN cache...',
];

const DEFAULT_CONFIG: DeployConfig = {
  repo: '',
  branch: 'main',
  project: 'my-project',
  appId: '',
  service: '',
  env: 'production',
  webhookUrl: '',
};

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  github: { token: '', defaultRepo: '', defaultBranch: 'main', workflowFile: 'deploy.yml' },
  aws: { accessKeyId: '', secretAccessKey: '', region: 'us-east-1', appId: '' },
  railway: { token: '', projectId: '', environment: 'production' },
  cloudflare: { token: '', accountId: '', projectName: '' },
  render: { apiKey: '', serviceId: '' },
  digitalocean: { token: '', appId: '' },
};

export default function DeployDashboard() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [config, setConfig] = useState<DeployConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load platform settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('devops-agent-settings');
      if (stored) {
        const parsed: PlatformSettings = JSON.parse(stored);
        setPlatformSettings(parsed);
        // Auto-fill config from GitHub settings
        if (parsed.github?.defaultRepo) {
          setConfig((prev) => ({
            ...prev,
            repo: parsed.github.defaultRepo,
            branch: parsed.github.defaultBranch || 'main',
          }));
        }
      }
    } catch {}
    setSettingsLoaded(true);
  }, []);

  // Check if any platform is configured
  const configuredPlatforms = {
    github: !!platformSettings.github?.token,
    aws: !!platformSettings.aws?.accessKeyId,
    railway: !!platformSettings.railway?.token,
    cloudflare: !!platformSettings.cloudflare?.token,
    render: !!platformSettings.render?.apiKey,
    digitalocean: !!platformSettings.digitalocean?.token,
  };
  const anyConfigured = Object.values(configuredPlatforms).some(Boolean);

  const addLog = useCallback((id: string, message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setDeployments((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, logs: [...d.logs, `[${timestamp}] ${message}`] }
          : d
      )
    );
  }, []);

  const deploy = useCallback(
    async (platformId: string) => {
      if (activePlatform) return;

      const id = Math.random().toString(36).substring(2, 11);
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      const platform = PLATFORMS.find((p) => p.id === platformId)!;

      const newDeploy: Deployment = {
        id,
        platform: platformId,
        project: config.project,
        repo: config.repo,
        branch: config.branch,
        status: 'deploying',
        startedAt: new Date(),
        logs: [
          `[${timestamp}] 🚀 Initiating deployment to ${platform.name}...`,
          `[${timestamp}] 📦 Project: ${config.project} | Repo: ${config.repo}@${config.branch}`,
        ],
      };

      setDeployments((prev) => [newDeploy, ...prev]);
      setActivePlatform(platformId);

    // Call real deploy API (server-side, tokens never exposed to browser)
    try {
      addLog(id, `🔑 Loading platform credentials...`);

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platformId,
          settings: platformSettings[platformId as keyof PlatformSettings],
          config: {
            repo: config.repo,
            branch: config.branch,
            project: config.project,
            appId: config.appId,
            service: config.service,
            env: config.env,
          },
        }),
      });

      const data = await response.json();
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });

      if (data.success) {
        setDeployments((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  deploymentId: data.deploymentId,
                  status: 'success',
                  completedAt: new Date(),
                  url: data.url,
                  logs: [
                    ...d.logs,
                    `[${ts}] ✅ ${data.message}`,
                    `[${ts}] 🔗 Deployment ID: ${data.deploymentId}`,
                    data.url ? `[${ts}] 🌐 Track progress: ${data.url}` : '',
                  ].filter(Boolean),
                }
              : d
          )
        );
        setActivePlatform(null);
      } else {
        // Real error from platform API
        setDeployments((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: 'failed',
                  completedAt: new Date(),
                  logs: [
                    ...d.logs,
                    `[${ts}] ❌ ${data.error}`,
                    data.hint === 'create_workflow'
                      ? `[${ts}] 💡 Tip: Create .github/workflows/${data.workflowFile} in your repo first`
                      : '',
                  ].filter(Boolean),
                }
              : d
          )
        );
        setActivePlatform(null);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
      setDeployments((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                status: 'failed',
                completedAt: new Date(),
                logs: [...d.logs, `[${ts}] ❌ Network error: ${errorMsg}`],
              }
            : d
        )
      );
      setActivePlatform(null);
    }
    },
    [activePlatform, config, addLog]
  );

  const clearHistory = () => {
    if (activePlatform) return;
    setDeployments([]);
  };

  const successCount = deployments.filter((d) => d.status === 'success').length;
  const failedCount = deployments.filter((d) => d.status === 'failed').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Top nav bar */}
      <div className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                DevOps Deploy Agent
              </h1>
              <p className="text-xs text-slate-500">Powered by n8n automation</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="hidden sm:flex items-center gap-4 mr-2">
              <div className="flex items-center gap-1.5 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-slate-400">{successCount} deployed</span>
              </div>
              {failedCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-slate-400">{failedCount} failed</span>
                </div>
              )}
              {activePlatform && (
                <div className="flex items-center gap-1.5 text-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-blue-400">Deploying...</span>
                </div>
              )}
            </div>

            <Link
              href="/settings"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">API Settings</span>
            </Link>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                showConfig
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Config</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-2">
            One-Click Deployment
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Select a platform to trigger a real deployment. Configure API credentials in Settings first.
          </p>
        </div>

        {/* Warning banner if no settings configured */}
        {settingsLoaded && !anyConfigured && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
            <div className="flex-1">
              <span className="text-yellow-300 font-medium">No API credentials configured.</span>
              <span className="text-yellow-400/80 ml-2">Deployments will fail until you add your platform tokens.</span>
            </div>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure Now
            </Link>
          </div>
        )}

        {/* Configured platforms summary */}
        {settingsLoaded && anyConfigured && (
          <div className="mb-6 flex flex-wrap gap-2 justify-center">
            {PLATFORMS.map((p) => {
              const configured = configuredPlatforms[p.id as keyof typeof configuredPlatforms];
              return (
                <span
                  key={p.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    configured
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800/50 text-slate-600 border border-slate-700/50'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  {p.name}
                </span>
              );
            })}
            <Link
              href="/settings"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-slate-500 hover:text-slate-300 border border-slate-700/50 hover:border-slate-600 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Edit
            </Link>
          </div>
        )}

        {/* Config Panel */}
        {showConfig && (
          <ConfigPanel config={config} onChange={setConfig} />
        )}

        {/* Platform Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.id}
              id={platform.id}
              name={platform.name}
              description={platform.description}
              color={platform.color}
              icon={platform.icon}
              isDeploying={activePlatform !== null}
              isActive={activePlatform === platform.id}
              onClick={() => deploy(platform.id)}
            />
          ))}
        </div>

        {/* Deployment History */}
        <div className="bg-slate-800/40 backdrop-blur rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
              <Activity className="w-5 h-5 text-blue-400" />
              Deployment History
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                {deployments.length} {deployments.length === 1 ? 'deployment' : 'deployments'}
              </span>
              {deployments.length > 0 && !activePlatform && (
                <button
                  onClick={clearHistory}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-slate-700/50"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-700/30">
            {deployments.length === 0 ? (
              <div className="py-16 text-center text-slate-600">
                <Rocket className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium text-slate-500">No deployments yet</p>
                <p className="text-sm mt-1">Click a platform card above to start deploying</p>
              </div>
            ) : (
              deployments.map((deployment) => (
                <DeploymentLog key={deployment.id} deployment={deployment} />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-700 space-y-1">
          <p>DevOps Deploy Agent · Real deployments via server-side API routes</p>
          <p>
            <Link href="/settings" className="text-slate-600 hover:text-slate-400 underline">
              Configure API credentials
            </Link>
            {' · '}
            <a href="https://github.com/orton98" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-400 underline">
              GitHub: orton98
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
