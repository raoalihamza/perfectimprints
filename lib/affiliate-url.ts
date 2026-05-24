const GEIGER_SOURCE_HOST = 'https://www.geiger.com';
const DEFAULT_AFFILIATE_HOST = 'https://patrickblack.geiger.com';

function getAffiliateHost(): string {
  const fromEnv = process.env.NEXT_PUBLIC_GEIGER_HOST;
  if (!fromEnv) return DEFAULT_AFFILIATE_HOST;
  return fromEnv.replace(/\/$/, '');
}

export function affiliateUrl(geigerUrl: string | null | undefined): string {
  const host = getAffiliateHost();
  if (!geigerUrl) return host;

  if (geigerUrl.startsWith(`${host}/`) || geigerUrl === host) {
    return geigerUrl;
  }

  if (geigerUrl.startsWith(`${GEIGER_SOURCE_HOST}/`) || geigerUrl === GEIGER_SOURCE_HOST) {
    return `${host}${geigerUrl.slice(GEIGER_SOURCE_HOST.length)}`;
  }

  if (geigerUrl.startsWith('/')) {
    return `${host}${geigerUrl}`;
  }

  return geigerUrl;
}
