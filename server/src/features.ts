import { FeatureFlag } from '@hotel/shared';

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return process.env[`FEATURE_${flag}`] === 'true';
}
