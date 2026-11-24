import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { generateToken, AuthenticatedRequest } from '../middleware/auth.middleware.js';

const googleClient = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_CALLBACK_URL,
});

export class AuthController {
  /**
   * Generates Google OAuth 2.0 redirect URL
   */
  static getGoogleAuthUrl(req: Request, res: Response) {
    if (!env.GOOGLE_CLIENT_ID) {
      return res.status(400).json({
        success: false,
        message: 'Google OAuth Client ID is not configured in environment variables.',
        instructions: 'Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env',
      });
    }

    const authUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent',
    });

    return res.json({ success: true, url: authUrl });
  }

  /**
   * Handles Google OAuth callback code exchange or token verification (GET redirect or POST body)
   */
  static async handleGoogleCallback(req: Request, res: Response) {
    const isGet = req.method === 'GET';
    const code = (req.query.code as string) || req.body?.code;
    const credential = req.body?.credential;

    try {
      let email = '';
      let name = '';
      let googleId = '';
      let avatar: string | null = null;

      // Handle standard authorization code exchange
      if (code) {
        const { tokens } = await googleClient.getToken(code);
        googleClient.setCredentials(tokens);

        const ticket = await googleClient.verifyIdToken({
          idToken: tokens.id_token!,
          audience: env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          if (isGet) {
            return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent('Could not extract user details from Google token')}`);
          }
          return res.status(400).json({ success: false, message: 'Could not extract user details from Google token' });
        }

        email = payload.email;
        name = payload.name || payload.email.split('@')[0];
        googleId = payload.sub;
        avatar = payload.picture || null;
      }
      // Handle One-Tap credential ID token
      else if (credential) {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          return res.status(400).json({ success: false, message: 'Invalid Google credential token' });
        }

        email = payload.email;
        name = payload.name || payload.email.split('@')[0];
        googleId = payload.sub;
        avatar = payload.picture || null;
      } else {
        if (isGet) {
          return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent('No authorization code received from Google')}`);
        }
        return res.status(400).json({ success: false, message: 'Authorization code or credential token is required' });
      }

      // Upsert User in database
      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name,
          googleId,
          avatar,
        },
        create: {
          email,
          name,
          googleId,
          avatar,
        },
      });

      // Ensure default sender profile exists
      await prisma.emailSender.upsert({
        where: { id: `default-sender-${user.id}` },
        update: {},
        create: {
          id: `default-sender-${user.id}`,
          userId: user.id,
          email: user.email,
          name: user.name,
          provider: 'ethereal',
          isActive: true,
        },
      }).catch(() => {});

      const token = generateToken(user);

      if (isGet) {
        const userData = {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        };
        return res.redirect(
          `${env.FRONTEND_URL}/login?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userData))}`
        );
      }

      return res.json({
        success: true,
        message: 'Successfully authenticated with Google',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        },
      });
    } catch (err: any) {
      console.error('❌ Google Auth Error:', err);
      if (isGet) {
        return res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(err.message || 'Google authentication failed')}`);
      }
      return res.status(500).json({
        success: false,
        message: `Google authentication failed: ${err.message}`,
      });
    }
  }

  /**
   * Seamless developer / demo login for immediate local evaluation without Google Cloud setup
   */
  static async devLogin(req: Request, res: Response) {
    const email = req.body.email || 'demo.user@reachinbox.ai';
    const name = req.body.name || 'Demo Engineer';
    const avatar =
      req.body.avatar ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250';

    try {
      const user = await prisma.user.upsert({
        where: { email },
        update: { name, avatar },
        create: {
          email,
          name,
          googleId: `dev-${Date.now()}`,
          avatar,
        },
      });

      // Ensure default sender exists
      await prisma.emailSender.upsert({
        where: { id: `default-sender-${user.id}` },
        update: {},
        create: {
          id: `default-sender-${user.id}`,
          userId: user.id,
          email: user.email,
          name: user.name,
          provider: 'ethereal',
          isActive: true,
        },
      }).catch(() => {});

      const token = generateToken(user);

      return res.json({
        success: true,
        message: 'Authenticated successfully (Developer / Sandbox Mode)',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Failed to authenticate dev user: ${err.message}`,
      });
    }
  }

  /**
   * Retrieves current authenticated user profile
   */
  static async getProfile(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        senders: true,
        slackIntegration: {
          select: {
            id: true,
            teamName: true,
            channelName: true,
            connectedAt: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, user });
  }
}
