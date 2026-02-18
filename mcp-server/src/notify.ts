/**
 * Notification channels: Slack, Discord, email (SendGrid), Telegram.
 */

import { getCredentials } from './vault.js';

export interface NotifyResult {
  success: boolean;
  channel: string;
  message?: string;
  error?: string;
}

// ─── Slack ────────────────────────────────────────────────────────────────────
export async function notifySlack(
  message: string,
  channel?: string,
  webhookUrl?: string
): Promise<NotifyResult> {
  const creds = getCredentials('slack');
  const url = webhookUrl || creds.webhookUrl;

  if (!url) {
    return { success: false, channel: 'slack', error: 'SLACK_WEBHOOK_URL not configured' };
  }

  try {
    const payload: Record<string, unknown> = { text: message };
    if (channel) payload.channel = channel;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return { success: true, channel: 'slack', message: 'Notification sent to Slack' };
    }
    return { success: false, channel: 'slack', error: `Slack API error: HTTP ${res.status}` };
  } catch (err) {
    return { success: false, channel: 'slack', error: (err as Error).message };
  }
}

// ─── Discord ──────────────────────────────────────────────────────────────────
export async function notifyDiscord(
  message: string,
  webhookUrl?: string
): Promise<NotifyResult> {
  const creds = getCredentials('discord');
  const url = webhookUrl || creds.webhookUrl;

  if (!url) {
    return { success: false, channel: 'discord', error: 'DISCORD_WEBHOOK_URL not configured' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });

    if (res.ok || res.status === 204) {
      return { success: true, channel: 'discord', message: 'Notification sent to Discord' };
    }
    return { success: false, channel: 'discord', error: `Discord API error: HTTP ${res.status}` };
  } catch (err) {
    return { success: false, channel: 'discord', error: (err as Error).message };
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────
export async function notifyTelegram(
  message: string,
  chatId: string,
  botToken?: string
): Promise<NotifyResult> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return { success: false, channel: 'telegram', error: 'TELEGRAM_BOT_TOKEN not configured' };
  }
  if (!chatId) {
    return { success: false, channel: 'telegram', error: 'chat_id is required' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });

    const data = await res.json() as { ok: boolean; description?: string };
    if (data.ok) {
      return { success: true, channel: 'telegram', message: 'Notification sent to Telegram' };
    }
    return { success: false, channel: 'telegram', error: data.description || 'Telegram API error' };
  } catch (err) {
    return { success: false, channel: 'telegram', error: (err as Error).message };
  }
}

// ─── Email (SendGrid) ─────────────────────────────────────────────────────────
export async function notifyEmail(
  to: string,
  subject: string,
  body: string,
  apiKey?: string
): Promise<NotifyResult> {
  const key = apiKey || process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL || 'devops@example.com';

  if (!key) {
    return { success: false, channel: 'email', error: 'SENDGRID_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });

    if (res.status === 202) {
      return { success: true, channel: 'email', message: `Email sent to ${to}` };
    }
    return { success: false, channel: 'email', error: `SendGrid error: HTTP ${res.status}` };
  } catch (err) {
    return { success: false, channel: 'email', error: (err as Error).message };
  }
}

// ─── Multi-channel broadcast ──────────────────────────────────────────────────
export async function broadcastNotification(
  message: string,
  channels: string[]
): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];

  for (const channel of channels) {
    switch (channel) {
      case 'slack':
        results.push(await notifySlack(message));
        break;
      case 'discord':
        results.push(await notifyDiscord(message));
        break;
      default:
        results.push({ success: false, channel, error: `Unknown channel: ${channel}` });
    }
  }

  return results;
}
