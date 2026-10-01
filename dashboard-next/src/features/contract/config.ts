import { ContractConfigError } from './errors';

/**
 * The CloudFront distribution that serves the published contract. This string
 * equals infrastructure/resources.json cloudfront.distributions.contract.domain_name
 * (a unit test keeps the two in sync). Override per environment with
 * NEXT_PUBLIC_CONTRACT_BASE_URL.
 */
export const DEFAULT_CONTRACT_BASE_URL = 'https://d7dr1fzple2sg.cloudfront.net/';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export { ContractConfigError };

/**
 * The contract base URL, always with exactly one trailing slash.
 *
 * Accepts only https URLs, or http on localhost / 127.0.0.1 for local fixture
 * servers (T-02-07-05). Credentials, a query string or a fragment in the URL
 * are refused. The environment variable is read by literal static property
 * access because Next.js inlines only that form into the client bundle.
 */
export function contractBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_CONTRACT_BASE_URL;
  const value = raw !== undefined && raw.trim() !== '' ? raw.trim() : DEFAULT_CONTRACT_BASE_URL;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ContractConfigError('The contract base URL is not a valid URL.');
  }

  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  if (!allowed) {
    throw new ContractConfigError('The contract base URL must be https (or http on localhost).');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new ContractConfigError('The contract base URL must not carry credentials, a query string or a fragment.');
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`;
}
