export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitError";
  }
}
