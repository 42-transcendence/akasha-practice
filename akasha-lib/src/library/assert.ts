export class AssertionError extends Error {
  override get name() {
    return "AssertionError";
  }

  get [Symbol.toStringTag]() {
    return this.name;
  }
}

export function assert(
  value: unknown,
  message?: string | undefined
): asserts value {
  if (!value) {
    throw new AssertionError(message);
  }
}
