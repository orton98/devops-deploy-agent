'use client';

import { Terminal, Info } from 'lucide-react';
import type { DeployConfig } from '@/types/deployment';

interface ConfigPanelProps {
  config: DeployConfig;
  onChange: (config: DeployConfig) => void;
}

interface FieldProps {
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  onChange: (value: string) => void;
}

function Field({ label, value, placeholder, hint, onChange }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg 
                   text-white placeholder-slate-600 text-sm
                   focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                   transition-colors"
      />
      {hint && (
        <p className="mt-1 text-xs text-slate-600 flex items-center gap-1">
          <Info className="w-3 h-3" />
          {hint}
        </p>
      )}
    </div>
  );
}

export default function ConfigPanel({ config, onChange }: ConfigPanelProps) {
  const update = (key: keyof DeployConfig) => (value: string) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="mb-8 p-6 bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 animate-[fadeIn_0.3s_ease-in-out]">
      <h3 className="text-lg font-semibold mb-5 flex items-center gap-2 text-white">
        <Terminal className="w-5 h-5 text-blue-400" />
        Deployment Configuration
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field
          label="Repository"
          value={config.repo}
          placeholder="user/repo-name"
          hint="GitHub repository (owner/name)"
          onChange={update('repo')}
        />
        <Field
          label="Branch"
          value={config.branch}
          placeholder="main"
          hint="Branch to deploy from"
          onChange={update('branch')}
        />
        <Field
          label="Project Name"
          value={config.project}
          placeholder="my-project"
          hint="Used for Railway, Cloudflare, Render"
          onChange={update('project')}
        />
        <Field
          label="App ID"
          value={config.appId}
          placeholder="app-xxxxxxxx"
          hint="AWS Amplify or DigitalOcean App ID"
          onChange={update('appId')}
        />
        <Field
          label="Service ID"
          value={config.service}
          placeholder="srv-xxxxxxxx"
          hint="Render service ID"
          onChange={update('service')}
        />
        <Field
          label="Environment"
          value={config.env}
          placeholder="production"
          hint="Target environment (Railway)"
          onChange={update('env')}
        />
      </div>

      <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
        <p className="text-xs text-slate-500 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500/70" />
          <span>
            API tokens are configured in your <code className="text-blue-400">.env.local</code> file and 
            loaded by the n8n workflow. Run <code className="text-blue-400">python scripts/create_n8n_workflow.py</code> to 
            set up the backend automation.
          </span>
        </p>
      </div>
    </div>
  );
}
