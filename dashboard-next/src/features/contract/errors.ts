/**
 * Typed errors for the contract module (02-07, T-02-07-01).
 *
 * Every failure to obtain verified contract data is one of these; none of them
 * carries a response body (only the version, the contract-relative artifact
 * path and an HTTP status), so an error can be logged or shown without leaking
 * or rendering untrusted content.
 */

export interface ContractErrorOptions {
  version?: number;
  path?: string;
}

export class ContractError extends Error {
  readonly version?: number;
  readonly path?: string;

  constructor(message: string, options: ContractErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.version = options.version;
    this.path = options.path;
  }
}

/** The configured base URL is not an allowed https (or localhost) URL. */
export class ContractConfigError extends ContractError {}

/** The CDN answered 403 or 404: this version or artifact does not exist (or is not published). */
export class ContractNotFoundError extends ContractError {}

/** Any other non-OK status, or a network failure. Retrying may help. */
export class ContractFetchError extends ContractError {
  readonly status?: number;

  constructor(message: string, options: ContractErrorOptions & { status?: number } = {}) {
    super(message, options);
    this.status = options.status;
  }
}

/** Bytes did not match the sha256 the pointer/manifest promised, or the data contradicts its own header. */
export class ContractIntegrityError extends ContractError {}

/** The bytes were authentic but do not match the contract schema. */
export class ContractSchemaError extends ContractError {}

/** An artifact uri that is not a plain relative path inside the contract base URL. Raised before any request. */
export class ContractUriError extends ContractError {}
