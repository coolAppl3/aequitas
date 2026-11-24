export function containsInvalidWhitespace(str: string): boolean {
  return /^\s|\s$|\s{2,}/.test(str);
}
