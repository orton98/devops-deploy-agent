export interface Deployment {
  id: string;
  platform: string;
  project: string;
  repo: string;
  branch: string;
  status: "idle" | "deploying" | "success" | "failed";
  startedAt: Date;
  completedAt?: Date;
  url?: string;
  deploymentId?: string;
  logs: string[];
}

export interface DeployConfig {
  repo: string;
  branch: string;
  project: string;
  appId: string;
  service: string;
  env: string;
  webhookUrl: string;
}

export interface Platform {
  id: string;
  name: string;
  description: string;
  color: string;
  hoverColor: string;
  borderColor: string;
  urlSuffix: string;
}

export interface N8nDeployResponse {
  success: boolean;
  deploymentId?: string;
  platform?: string;
  status?: string;
  message?: string;
  error?: string;
}
