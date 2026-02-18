'use client';

import { Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlatformCardProps {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: React.ElementType;
  isDeploying: boolean;
  isActive: boolean;
  onClick: () => void;
}

export default function PlatformCard({
  id,
  name,
  description,
  color,
  icon: Icon,
  isDeploying,
  isActive,
  onClick,
}: PlatformCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={isDeploying}
      className={cn(
        'group relative overflow-hidden p-6 rounded-2xl border transition-all duration-300',
        `bg-gradient-to-br ${color}`,
        isDeploying
          ? 'opacity-50 cursor-not-allowed border-slate-600'
          : 'opacity-90 hover:opacity-100 hover:scale-105 hover:shadow-2xl border-white/10 hover:border-white/30',
        isActive && 'ring-2 ring-white/50 scale-105'
      )}
    >
      {/* Overlay */}
      <div className={cn(
        'absolute inset-0 transition-colors',
        isDeploying ? 'bg-black/30' : 'bg-black/20 group-hover:bg-black/10'
      )} />

      {/* Shimmer effect on hover */}
      {!isDeploying && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
        </div>
      )}

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-3 bg-white/10 rounded-xl backdrop-blur transition-transform duration-300',
            !isDeploying && 'group-hover:scale-110'
          )}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-lg text-white leading-tight">{name}</h3>
            <p className="text-sm text-white/70">{description}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <Rocket
            className={cn(
              'w-6 h-6 text-white/80 transition-all duration-300',
              isActive
                ? 'animate-bounce text-white'
                : !isDeploying && 'group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-white'
            )}
          />
          {isActive && (
            <span className="text-[10px] text-white/70 font-medium animate-pulse">
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Active deploy progress bar */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div className="h-full bg-white/60 animate-[progress_2s_ease-in-out_infinite]" 
               style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      )}
    </button>
  );
}
