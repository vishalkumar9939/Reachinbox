import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { SlackService } from '../integrations/slack.service.js';
import { env } from '../config/env.js';

export class SlackController {
  /**
   * Returns Slack authorization URL
   */
  static getAuthUrl(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    // Pass user ID inside state token for callback reference
    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
    const authUrl = SlackService.getAuthorizationUrl(state);

    return res.json({
      success: true,
      url: authUrl,
      configuredInEnv: !!(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET),
    });
  }

  /**
   * OAuth Callback handler
   */
  static async handleCallback(req: Request, res: Response) {
    const { code, state, error } = req.query;

    if (error) {
      console.warn(`Slack OAuth error: ${error}`);
      return res.redirect(`${env.FRONTEND_URL}/settings?slack=error&reason=${encodeURIComponent(String(error))}`);
    }

    if (!code || !state) {
      return res.redirect(`${env.FRONTEND_URL}/settings?slack=error&reason=missing_parameters`);
    }

    try {
      const decodedState = JSON.parse(Buffer.from(String(state), 'base64').toString('utf8'));
      const userId = decodedState.userId;

      if (!userId) {
        throw new Error('Invalid OAuth state payload');
      }

      await SlackService.handleOAuthCallback(String(code), userId);

      return res.redirect(`${env.FRONTEND_URL}/settings?slack=connected`);
    } catch (err: any) {
      console.error('❌ Slack OAuth callback failure:', err);
      return res.redirect(
        `${env.FRONTEND_URL}/settings?slack=error&reason=${encodeURIComponent(err.message || 'unknown')}`
      );
    }
  }

  /**
   * Get current Slack integration status
   */
  static async getStatus(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    try {
      const status = await SlackService.getIntegrationStatus(userId);
      return res.json({ success: true, ...status });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to check Slack status: ${err.message}` });
    }
  }

  /**
   * Disconnect Slack integration
   */
  static async disconnect(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    try {
      await SlackService.disconnect(userId);
      return res.json({ success: true, message: 'Slack integration disconnected successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to disconnect Slack: ${err.message}` });
    }
  }

  /**
   * Send test notification
   */
  static async sendTestNotification(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    try {
      const sent = await SlackService.sendTestMessage(userId);
      if (!sent) {
        return res.status(400).json({ success: false, message: 'Could not send test message. Check Slack credentials.' });
      }
      return res.json({ success: true, message: 'Test notification sent to Slack successfully!' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to send test message: ${err.message}` });
    }
  }
}
