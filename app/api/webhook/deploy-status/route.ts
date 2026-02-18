import { NextResponse } from 'next/server';

interface DeployStatusPayload {
  platform: string;
  status: string;
  project: string;
  url?: string;
  deploymentId?: string;
  timestamp: string;
  error?: string;
}

// In-memory store for demo (use Redis/DB in production)
const deploymentStatuses: DeployStatusPayload[] = [];

export async function POST(req: Request) {
  try {
    const data: DeployStatusPayload = await req.json();

    console.log('[Deploy Status Webhook]', JSON.stringify(data, null, 2));

    // Store the status update
    deploymentStatuses.unshift(data);

    // Keep only last 100 entries
    if (deploymentStatuses.length > 100) {
      deploymentStatuses.splice(100);
    }

    // Here you could:
    // 1. Broadcast via WebSocket to connected clients
    // 2. Store in a database (Postgres, Redis, etc.)
    // 3. Send Slack/Discord notification
    // 4. Update a deployment tracking system

    return NextResponse.json(
      {
        received: true,
        platform: data.platform,
        status: data.status,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Deploy Status Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook payload' },
      { status: 400 }
    );
  }
}

export async function GET() {
  // Return recent deployment statuses (useful for polling)
  return NextResponse.json({
    statuses: deploymentStatuses.slice(0, 20),
    total: deploymentStatuses.length,
  });
}
