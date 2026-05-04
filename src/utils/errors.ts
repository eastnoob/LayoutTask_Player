export class LayoutTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutTaskError";
  }
}

export class ConfigValidationError extends LayoutTaskError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}
