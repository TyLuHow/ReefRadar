import { z } from 'zod';
import { MAX_DIGEST, MAX_MESSAGE, MAX_NAME, MAX_ROUTE, MAX_STACK_LINE, MAX_STACK_LINES, REPORT_SOURCES } from './scrub';

/**
 * The wire format of a client error report (03-12, PLAT-09): exactly eight
 * fields. Strict, so an unknown key is a 400 and never reaches the log.
 * Limits match what scrub.ts produces; the route scrubs again after parsing.
 */
export const clientErrorSchema = z.strictObject({
  v: z.literal(1),
  source: z.enum(REPORT_SOURCES),
  name: z.string().min(1).max(MAX_NAME),
  message: z.string().max(MAX_MESSAGE),
  stack: z.string().max(MAX_STACK_LINES * (MAX_STACK_LINE + 1)),
  // A pathname: starts with a slash, no whitespace, no query, no fragment.
  route: z.string().max(MAX_ROUTE).regex(/^\/[^\s?#]*$/),
  digest: z.string().max(MAX_DIGEST).nullable(),
  ts: z.number().int().positive(),
});

export type ClientErrorPayload = z.infer<typeof clientErrorSchema>;
