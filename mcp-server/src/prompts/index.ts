/**
 * MCP Prompts — pre-built AI workflows for common DevOps tasks.
 */

export const PROMPTS = [
  {
    name: 'deploy_pipeline',
    description: 'Full deployment pipeline: test → build → deploy → health check → notify',
    arguments: [
      { name: 'platform', description: 'Target platform (github, railway, cloudflare, render, digitalocean, vercel, flyio)', required: true },
      { name: 'repo', description: 'GitHub repo (owner/name)', required: false },
      { name: 'environment', description: 'Target environment (production, staging)', required: false },
      { name: 'notify_channel', description: 'Notification channel (slack, discord)', required: false },
    ],
  },
  {
    name: 'emergency_rollback',
    description: 'Emergency rollback: detect failed deploy → rollback → health check → incident report',
    arguments: [
      { name: 'platform', description: 'Platform where the failure occurred', required: true },
      { name: 'deployment_id', description: 'Failed deployment ID to roll back from', required: false },
      { name: 'notify_channel', description: 'Notification channel for incident alert', required: false },
    ],
  },
  {
    name: 'setup_cicd',
    description: 'Set up CI/CD pipeline: create repo → configure secrets → add workflow → test deploy',
    arguments: [
      { name: 'platform', description: 'Target deployment platform', required: true },
      { name: 'project_name', description: 'Name for the new project', required: true },
      { name: 'framework', description: 'App framework (nextjs, react, python, node, go)', required: false },
    ],
  },
  {
    name: 'multi_platform_deploy',
    description: 'Deploy to multiple platforms simultaneously for redundancy',
    arguments: [
      { name: 'platforms', description: 'Comma-separated list of platforms (e.g. "render,railway,cloudflare")', required: true },
      { name: 'repo', description: 'GitHub repo (owner/name)', required: false },
    ],
  },
  {
    name: 'deploy_cheapest_free',
    description: 'Analyze project and deploy to the best free-tier platform automatically',
    arguments: [
      { name: 'repo', description: 'GitHub repo to analyze and deploy', required: true },
      { name: 'framework', description: 'App framework (auto-detected if not provided)', required: false },
    ],
  },
  {
    name: 'incident_response',
    description: 'Automated incident response: detect → diagnose → remediate → report',
    arguments: [
      { name: 'platform', description: 'Platform experiencing the incident', required: true },
      { name: 'service_url', description: 'URL of the affected service', required: false },
    ],
  },
];

export function getPromptMessages(name: string, args: Record<string, string>): Array<{ role: string; content: string }> {
  switch (name) {
    case 'deploy_pipeline':
      return [
        {
          role: 'user',
          content: `Run a full deployment pipeline for ${args.platform}:
1. First call test_connection(platform="${args.platform}") to verify credentials
2. Call deploy(platform="${args.platform}"${args.repo ? `, repo="${args.repo}"` : ''}${args.environment ? `, environment="${args.environment}"` : ''}) to trigger the deployment
3. Call watch_deployment with the returned deployment ID to wait for completion
4. Call check_service_health on the deployed URL to verify it's running
5. Call get_deployment_logs to show the build output
${args.notify_channel ? `6. Call notify(channel="${args.notify_channel}") with the deployment result` : ''}
Report the final status with the live URL.`,
        },
      ];

    case 'emergency_rollback':
      return [
        {
          role: 'user',
          content: `Emergency rollback procedure for ${args.platform}:
1. Call get_deployment_logs(platform="${args.platform}", limit=5) to see recent deployments
2. Identify the last successful deployment before the failure
3. Call rollback_deployment(platform="${args.platform}"${args.deployment_id ? `, deployment_id="${args.deployment_id}"` : ''})
4. Call watch_deployment to confirm rollback completes
5. Call check_service_health to verify the service is healthy
${args.notify_channel ? `6. Call notify(channel="${args.notify_channel}") with: "🚨 INCIDENT: Emergency rollback executed on ${args.platform}. Service restored."` : ''}
Create a brief incident summary with: what failed, what was rolled back to, and current status.`,
        },
      ];

    case 'setup_cicd':
      return [
        {
          role: 'user',
          content: `Set up a complete CI/CD pipeline for ${args.project_name} on ${args.platform}:
1. Call setup_platform(platform="${args.platform}", project_name="${args.project_name}") to create the project
2. Note the returned IDs (project ID, service ID, etc.)
3. Call create_branch(branch_name="feature/initial-setup") to create a working branch
4. Call deploy(platform="${args.platform}", project="${args.project_name}") to test the first deployment
5. Call watch_deployment to confirm it succeeds
6. Report the live URL and all the IDs needed for future deployments
The framework is: ${args.framework || 'auto-detect from repo'}`,
        },
      ];

    case 'multi_platform_deploy':
      return [
        {
          role: 'user',
          content: `Deploy to multiple platforms simultaneously:
Platforms: ${args.platforms}
${args.repo ? `Repo: ${args.repo}` : ''}

For each platform in [${args.platforms}]:
1. Call test_connection(platform=<platform>) to verify credentials
2. Call deploy(platform=<platform>${args.repo ? `, repo="${args.repo}"` : ''}) to trigger deployment
3. Note the deployment ID

Then for each deployment:
4. Call get_deployment_status to check progress
5. Report final status for all platforms with their live URLs

Show a summary table at the end: Platform | Status | URL | Duration`,
        },
      ];

    case 'deploy_cheapest_free':
      return [
        {
          role: 'user',
          content: `Find the best free-tier platform for ${args.repo} and deploy it:

Free tier comparison:
- Cloudflare Pages: Best for static sites, unlimited bandwidth, global CDN
- Railway: Best for Node.js/Python apps, $5/month free credit
- Render: Best for web services, 750 hours/month free
- Vercel: Best for Next.js, 100GB bandwidth free
- Fly.io: Best for containers, 3 shared VMs free

Steps:
1. Call get_repo_status(repo="${args.repo}") to analyze the project
2. Based on the framework${args.framework ? ` (${args.framework})` : ''}, recommend the best free platform
3. Call test_connection for the recommended platform
4. Call setup_platform to create the project
5. Call deploy to trigger the first deployment
6. Report the live URL and estimated monthly cost ($0 for free tier)`,
        },
      ];

    case 'incident_response':
      return [
        {
          role: 'user',
          content: `Automated incident response for ${args.platform}:

1. DETECT: ${args.service_url ? `Call check_service_health(url="${args.service_url}") to confirm the issue` : `Call get_deployment_logs(platform="${args.platform}") to check for errors`}
2. DIAGNOSE: Call get_deployment_status for the latest deployment to understand what changed
3. REMEDIATE: Based on the diagnosis:
   - If latest deploy failed → call rollback_deployment
   - If service is down → call restart_service(platform="${args.platform}")
   - If high load → call scale_service(platform="${args.platform}", instances=3)
4. VERIFY: Call check_service_health again to confirm recovery
5. REPORT: Summarize the incident:
   - What happened
   - Root cause
   - Action taken
   - Time to recovery
   - Recommendations to prevent recurrence`,
        },
      ];

    default:
      return [{ role: 'user', content: `Run the ${name} workflow with args: ${JSON.stringify(args)}` }];
  }
}
