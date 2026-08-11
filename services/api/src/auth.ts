// Authentication: signed JWT sessions, an admin email allowlist, an injectable
// Google ID-token verifier, and a dev login (env-gated, off in production).
//
// Students remain anonymous-first (spec §20/§23): no token is required for the
// diagnostic. Tokens add an OPTIONAL persistent identity, and gate admin access.

import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

export type Role = 'student' | 'admin';

export interface AuthIdentity {
  /** Stable subject id (email for logged-in users, or "dev:role" for dev tokens). */
  sub: string;
  role: Role;
  email?: string;
  /** Linked anonymous student, when the identity is a student. */
  studentId?: string;
}

export interface AuthConfig {
  jwtSecret: string;
  adminEmails: string[];
  devLoginEnabled: boolean;
  googleClientId?: string;
  /** Injectable for tests; defaults to real Google verification when set. */
  verifyGoogleIdToken: (idToken: string) => Promise<{ email: string } | null>;
}

const TOKEN_TTL = '30d';

/** Build auth config from environment (used by the running server). */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const googleClientId = env.GOOGLE_CLIENT_ID;
  const adminEmails = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // Dev login is on unless explicitly disabled or running in production.
  const devLoginEnabled =
    env.AUTH_DEV_LOGIN === 'true' ||
    (env.AUTH_DEV_LOGIN !== 'false' && env.NODE_ENV !== 'production');

  const client = googleClientId ? new OAuth2Client(googleClientId) : null;

  return {
    jwtSecret: env.JWT_SECRET ?? 'dev-secret-change-me',
    adminEmails,
    devLoginEnabled,
    googleClientId,
    verifyGoogleIdToken: async (idToken: string) => {
      if (!client || !googleClientId) return null;
      const ticket = await client.verifyIdToken({ idToken, audience: googleClientId });
      const email = ticket.getPayload()?.email;
      return email ? { email } : null;
    },
  };
}

/** admin if the email is in the allowlist, else student. */
export function roleForEmail(email: string, adminEmails: string[]): Role {
  return adminEmails.includes(email.toLowerCase()) ? 'admin' : 'student';
}

export function signToken(identity: AuthIdentity, config: AuthConfig): string {
  return jwt.sign(identity, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string, config: AuthConfig): AuthIdentity | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload & AuthIdentity;
    if (!decoded || (decoded.role !== 'student' && decoded.role !== 'admin')) return null;
    return {
      sub: decoded.sub as string,
      role: decoded.role,
      email: decoded.email,
      studentId: decoded.studentId,
    };
  } catch {
    return null;
  }
}

/** Extract a bearer token from an Authorization header value. */
export function bearerFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}
