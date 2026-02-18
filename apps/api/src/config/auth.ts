const DEV_JWT_SECRET = 'dev-secret-change-in-production';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return DEV_JWT_SECRET;
}

export const JWT_SECRET = resolveJwtSecret();
