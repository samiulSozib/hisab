/** An expected business-rule violation whose message is safe to show to the user. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity = "Record") {
    // Deliberately identical for "missing" and "belongs to someone else" — no information leak.
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to do that");
    this.name = "UnauthorizedError";
  }
}
