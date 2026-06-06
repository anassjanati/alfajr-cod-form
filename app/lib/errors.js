export class CodError extends Error {
  constructor(message, statusCode = 500, data = {}) {
    super(message);
    this.name = "CodError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

export class ValidationError extends CodError {
  constructor(errors) {
    super("Validation failed", 422, { errors });
    this.name = "ValidationError";
  }
}

export class RateLimitError extends CodError {
  constructor(retryAfter = 60) {
    super("Rate limit exceeded", 429, { retryAfter });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class IdempotencyError extends CodError {
  constructor(message = "Request processing") {
    super(message, 409, {});
    this.name = "IdempotencyError";
  }
}
