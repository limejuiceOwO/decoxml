export class CustomValidationError extends Error {
  constructor(public innerError: Error) {
    super(innerError.message);
    this.name = 'CustomValidationError';
  }
}

export class CustomParseError extends Error {
  constructor(public innerError: Error) {
    super(innerError.message);
    this.name = 'CustomParseError';
  }
}
