export const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

export const assertUnreachable = (value: never, context: string): never => {
  throw new Error(`Unreachable case in ${context}: ${JSON.stringify(value)}`);
};
