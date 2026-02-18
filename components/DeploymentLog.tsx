'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deployment } from '@/types/deployment';

interface DeploymentLogProps {
  deployment: Deployment;
}

function StatusIcon({ status }: { status: Deployment['status'] }) {
  switch (status) {
    case 'deploying':
      return <Loader2 className="w-5 h-5 animate-spin text-blue-400" />;
    case 'success':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-400" />;
    default:
      return <Clock className="w-5 h-5 text-slate-400" />;
  }
}

function StatusBadge({ status }: { status: Deployment['status'] }) {
  const styles = {
    deploying: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    failed: 'bg-red-500/20 text-red-300 border-red-500/30',
    idle: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  };

  return (
    <span className={cn(
      'px-2 py-0.5 rounded-full text-xs font-medium border uppercase tracking-wide',
      styles[status]
    )}>
      {status}
    </span>
  );
}

function getDuration(start: Date, end?: Date): string {
  const ms = (end || new Date()).getTime() - start.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function DeploymentLog({ deployment }: DeploymentLogProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deployment.logs]);

  return (
    <div className={cn(
      'p-5 transition-all duration-300 animate-[slideUp_0.3s_ease-out]',
      deployment.status === 'deploying' && 'bg-blue-500/5',
      deployment.status === 'success' && 'bg-emerald-500/5',
      deployment.status === 'failed' && 'bg-red-500/5',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <StatusIcon status={deployment.status} />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-white capitalize">{deployment.platform}</h4>
              <StatusBadge status={deployment.status} />
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              {deployment.project} · {deployment.repo} ({deployment.branch})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-right">
          {deployment.url && (
            <a
              href={deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Visit <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <div className="text-xs text-slate-500">
            <div>{deployment.startedAt.toLocaleTimeString()}</div>
            <div className="text-slate-600">
              {getDuration(deployment.startedAt, deployment.completedAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Terminal Log */}
      <div className={cn(
        'bg-slate-950 rounded-xl p-4 font-mono text-xs overflow-y-auto max-h-48 border',
        deployment.status === 'deploying' && 'border-blue-500/20',
        deployment.status === 'success' && 'border-emerald-500/20',
        deployment.status === 'failed' && 'border-red-500/20',
        deployment.status === 'idle' && 'border-slate-700/50',
      )}>
        {/* Terminal header dots */}
        <div className="flex gap-1.5 mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          <span className="ml-2 text-slate-600 text-[10px]">deploy-agent — {deployment.platform}</span>
        </div>

        {deployment.logs.map((log, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-pre-wrap leading-relaxed',
              log.includes('✅') || log.includes('success') ? 'text-emerald-400' :
              log.includes('❌') || log.includes('Error') || log.includes('failed') ? 'text-red-400' :
              log.includes('⚠️') ? 'text-yellow-400' :
              log.includes('Deployment ID') ? 'text-blue-300' :
              'text-green-400'
            )}
          >
            {log}
          </div>
        ))}

        {deployment.status === 'deploying' && (
          <span className="text-green-400 cursor-blink">█</span>
        )}

        <div ref={logsEndRef} />
      </div>

      {/* Deployment ID */}
      {deployment.deploymentId && (
        <div className="mt-2 text-xs text-slate-600 font-mono">
          ID: {deployment.deploymentId}
        </div>
      )}
    </div>
  );
}
