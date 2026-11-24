import axios from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

export class SlackService {
  /**
   * Generates the Slack OAuth authorization URL
   */
  static getAuthorizationUrl(state: string): string {
    const scopes = ['chat:write', 'incoming-webhook'].join(',');
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', env.SLACK_CLIENT_ID || 'dummy_client_id');
    url.searchParams.set('scope', scopes);
    url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /**
   * Exchanges authorization code for permanent access token
   */
  static async handleOAuthCallback(code: string, userId: string) {
    if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
      throw new Error('Slack OAuth client credentials are not configured in environment variables');
    }

    const response = await axios.post(
      'https://slack.com/api/oauth.v2.access',
      new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: env.SLACK_REDIRECT_URI,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const data = response.data;
    if (!data.ok) {
      throw new Error(`Slack OAuth exchange failed: ${data.error || 'Unknown error'}`);
    }

    const accessToken = data.access_token;
    const teamId = data.team?.id;
    const teamName = data.team?.name;
    const channelId = data.incoming_webhook?.channel_id || null;
    const channelName = data.incoming_webhook?.channel || null;
    const incomingWebhookUrl = data.incoming_webhook?.url || null;

    // Upsert into SlackIntegration model
    return await prisma.slackIntegration.upsert({
      where: { userId },
      create: {
        userId,
        accessToken,
        teamId,
        teamName,
        channelId,
        channelName,
        incomingWebhookUrl,
      },
      update: {
        accessToken,
        teamId,
        teamName,
        channelId,
        channelName,
        incomingWebhookUrl,
        connectedAt: new Date(),
      },
    });
  }

  /**
   * Disconnects Slack for a given user
   */
  static async disconnect(userId: string) {
    try {
      await prisma.slackIntegration.deleteMany({ where: { userId } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if user has an active Slack integration
   */
  static async getIntegrationStatus(userId: string) {
    const integration = await prisma.slackIntegration.findUnique({
      where: { userId },
      select: {
        id: true,
        teamName: true,
        channelName: true,
        connectedAt: true,
      },
    });

    return {
      connected: !!integration,
      integration: integration || null,
      configuredInEnv: !!(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET),
    };
  }

  /**
   * Sends rate-limit warning notification to Slack
   */
  static async sendRateLimitAlert(params: {
    userId: string;
    senderEmail: string;
    hourlyLimit: number;
    currentUsage: number;
    resumesAt: Date;
  }): Promise<boolean> {
    const integration = await prisma.slackIntegration.findUnique({
      where: { userId: params.userId },
    });

    if (!integration) {
      return false;
    }

    const resumeFormatted = params.resumesAt.toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'medium',
    });

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ ReachInbox: Hourly Email Limit Reached',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Your email sending queue has reached the hourly safety threshold. Subsequent emails have been safely deferred to prevent reputation degradation or account suspension.`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Sender Account:*\n\`${params.senderEmail}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Hourly Limit:*\n${params.hourlyLimit} emails/hr`,
          },
          {
            type: 'mrkdwn',
            text: `*Current Usage:*\n${params.currentUsage} emails`,
          },
          {
            type: 'mrkdwn',
            text: `*Resuming Sending At:*\n${resumeFormatted} UTC`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 *ReachInbox Scheduler:* All queued emails remain preserved and will dispatch automatically once the window resets.',
          },
        ],
      },
    ];

    try {
      if (integration.incomingWebhookUrl) {
        await axios.post(integration.incomingWebhookUrl, { blocks });
        return true;
      } else if (integration.accessToken && integration.channelId) {
        await axios.post(
          'https://slack.com/api/chat.postMessage',
          {
            channel: integration.channelId,
            blocks,
            text: `⚠️ ReachInbox: Hourly limit (${params.hourlyLimit}) reached for ${params.senderEmail}. Resuming at ${resumeFormatted} UTC.`,
          },
          {
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn(`⚠️ Failed to deliver Slack rate-limit alert: ${err.message}`);
      return false;
    }
  }

  /**
   * Sends a test message to verify Slack configuration
   */
  static async sendTestMessage(userId: string): Promise<boolean> {
    const integration = await prisma.slackIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw new Error('Slack is not connected for this account');
    }

    const payload = {
      text: '🎉 ReachInbox: Slack Integration is successfully connected! You will now receive hourly rate-limit alerts here.',
    };

    if (integration.incomingWebhookUrl) {
      await axios.post(integration.incomingWebhookUrl, payload);
      return true;
    }

    if (integration.accessToken && integration.channelId) {
      await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          channel: integration.channelId,
          ...payload,
        },
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return true;
    }

    return false;
  }
}
