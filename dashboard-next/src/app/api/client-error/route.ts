import { handleClientErrorPost } from '@/features/monitoring/server';

// Public, unauthenticated, per-request work: never cached or prerendered.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handleClientErrorPost(request);
}
