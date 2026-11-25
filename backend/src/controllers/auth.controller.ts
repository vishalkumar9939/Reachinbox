import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { generateToken, AuthenticatedRequest } from '../middleware/auth.middleware.js';

const getCallbackUrl = (req: Request): string => {
  if (env.GOOGLE_CALLBACK_URL && !env.GOOGLE_CALLBACK_URL.includes('localhost')) {
    return env.GOOGLE_CALLBACK_URL;
  }
  const host = req.get('host') || req.headers.host;
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  if (host && !host.includes('localhost')) {
    return `${protocol}://${host}/api/auth/google/callback`;
  }
  return env.GOOGLE_CALLBACK_URL;
};

// Whitelist of allowed frontend origins to prevent open-redirect attacks
const ALLOWED_FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://reachinbox-frontend-beta.vercel.app',
];

const isAllowedOrigin = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    if (ALLOWED_FRONTEND_ORIGINS.includes(origin)) return true;
    if (origin === env.FRONTEND_URL) return true;
    // Allow any *.vercel.app preview deployments
    if (parsed.hostname.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
};

const getFrontendUrl = (req: Request, state?: string): string => {
  // Only trust state if it matches a whitelisted origin
  if (state && (state.startsWith('http://') || state.startsWith('https://')) && isAllowedOrigin(state)) {
    try {
      const u = new URL(state);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  if (env.FRONTEND_URL && !env.FRONTEND_URL.includes('localhost')) {
    return env.FRONTEND_URL;
  }
  return env.FRONTEND_URL;
};

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

    const redirectUri = getCallbackUrl(req);
    const client = new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    });

    // Always use the configured FRONTEND_URL for the state parameter to prevent open redirect
    const rawFrontend = (req.query.frontendUrl as string) || env.FRONTEND_URL;
    const frontendTarget = isAllowedOrigin(rawFrontend) ? rawFrontend : env.FRONTEND_URL;

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent',
      state: frontendTarget,
    });

    return res.json({ success: true, url: authUrl, redirectUri });
  }

  /**
   * Handles Google OAuth callback code exchange or token verification (GET redirect or POST body)
   */
  static async handleGoogleCallback(req: Request, res: Response) {
    const isGet = req.method === 'GET';
    const code = (req.query.code as string) || req.body?.code;
    const credential = req.body?.credential;
    const state = req.query.state as string | undefined;
    const targetFrontend = getFrontendUrl(req, state);
    const redirectUri = getCallbackUrl(req);

    const client = new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    });

    try {
      let email = '';
      let name = '';
      let googleId = '';
      let avatar: string | null = null;

      // Handle standard authorization code exchange
      if (code) {
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token!,
          audience: env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          if (isGet) {
            return res.redirect(`${targetFrontend}/login?error=${encodeURIComponent('Could not extract user details from Google token')}`);
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
        const ticket = await client.verifyIdToken({
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
          return res.redirect(`${targetFrontend}/login?error=${encodeURIComponent('No authorization code received from Google')}`);
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
          `${targetFrontend}/login?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userData))}`
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
    if (env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Developer login is disabled in production. Use Google OAuth to sign in.',
      });
    }

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
