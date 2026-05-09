/**
 * Validates environment variables at startup.
 * Keeps failures obvious in production rather than ambiguous runtime errors later.
 */

function prodLike(nodeEnv: string): boolean {
  const e = (nodeEnv || 'development').toLowerCase();
  return e === 'production' || e === 'staging';
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_ENV_VALIDATION === '1') {
    return config;
  }

  const errors: string[] = [];

  const databaseUrl =
    typeof config.DATABASE_URL === 'string' ? config.DATABASE_URL.trim() : '';
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  }

  const nodeEnv = typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development';
  const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET.trim() : '';

  if (prodLike(nodeEnv) && jwtSecret.length < 24) {
    errors.push(
      'JWT_SECRET must be at least 24 characters when NODE_ENV indicates production-like mode',
    );
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n  - ${errors.join('\n  - ')}\n`);
  }

  return config;
}
