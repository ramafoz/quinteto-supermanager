export class AppError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; }
}
export function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new AppError(400,'INVALID_INPUT',message);
}
