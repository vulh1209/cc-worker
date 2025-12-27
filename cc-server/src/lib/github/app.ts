/**
 * GitHub App Authentication
 *
 * Handles JWT generation and installation access token management
 * for GitHub App authentication.
 */

import { createPrivateKey, createSign } from 'crypto';
import prisma from '../prisma';

// Environment variables
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;

/**
 * Generate a JWT for GitHub App authentication
 * JWTs are valid for 10 minutes max
 */
export async function generateAppJWT(): Promise<string> {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds ago to account for clock drift
    exp: now + 600, // Expires in 10 minutes
    iss: GITHUB_APP_ID,
  };

  // Create JWT manually (avoiding external dependencies)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsignedToken = `${header}.${body}`;

  // Sign with private key
  const privateKey = createPrivateKey(GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'));
  const sign = createSign('RSA-SHA256');
  sign.update(unsignedToken);
  const signature = sign.sign(privateKey, 'base64url');

  return `${unsignedToken}.${signature}`;
}

/**
 * Get an installation access token for a GitHub App installation
 * Tokens are cached in the database and refreshed when expired
 */
export async function getInstallationAccessToken(installationId: number): Promise<string> {
  // Check cached token
  const installation = await prisma.gitHubInstallation.findUnique({
    where: { installationId },
  });

  // Return cached token if still valid (with 5 min buffer)
  if (installation?.accessToken && installation.tokenExpiresAt) {
    const expiresAt = new Date(installation.tokenExpiresAt);
    const bufferTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    if (expiresAt > bufferTime) {
      return installation.accessToken;
    }
  }

  // Generate new token
  const jwt = await generateAppJWT();

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get installation access token: ${response.status} ${error}`);
  }

  const data = await response.json();

  // Cache token in database
  if (installation) {
    await prisma.gitHubInstallation.update({
      where: { installationId },
      data: {
        accessToken: data.token,
        tokenExpiresAt: new Date(data.expires_at),
      },
    });
  }

  return data.token;
}

/**
 * Verify GitHub App is configured
 */
export function isGitHubAppConfigured(): boolean {
  return Boolean(GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY);
}

/**
 * Get GitHub App info
 */
export async function getAppInfo(): Promise<{
  id: string;
  name: string;
  slug: string;
} | null> {
  if (!isGitHubAppConfigured()) {
    return null;
  }

  try {
    const jwt = await generateAppJWT();
    const response = await fetch('https://api.github.com/app', {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
    };
  } catch {
    return null;
  }
}
