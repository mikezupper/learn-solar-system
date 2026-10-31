/** One thing a lint found. The reader is usually an agent, so `fix` says exactly what to do next. */
export interface Violation {
  readonly rule: string
  readonly file: string
  readonly message: string
  readonly fix: string
}

export const formatViolation = ({ rule, file, message, fix }: Violation): string =>
  `${file}: [${rule}] ${message}\n  Fix: ${fix}`

export interface TextFile {
  readonly path: string
  readonly text: string
}
