export type RpcResult<T> =
  | { kind: "success"; value: T; attempts: number }
  | { kind: "deterministic-error"; error: string; attempts: number }
  | { kind: "unavailable"; error: string; attempts: number };

export type RpcAttemptRecord = {
  method: string;
  attempts: number;
  outcome: "success" | "deterministic-error" | "unavailable";
  error?: string;
};

export function compactError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message.replace(/\s+/g, " ").trim()}`;
  return String(error).replace(/\s+/g, " ").trim();
}

export function isTransientRpcError(error: unknown): boolean {
  const fragments: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      fragments.push(current.name, current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      fragments.push(String(current));
      break;
    }
  }
  const text = fragments.join(" ").toLowerCase();
  return [
    "timeout", "timed out", "fetch failed", "network", "econnreset", "econnrefused",
    "etimedout", "socket hang up", "http request failed", "status: 408", "status: 429",
    "status: 500", "status: 502", "status: 503", "status: 504",
  ].some((fragment) => text.includes(fragment));
}

export async function rpcWithRetry<T>(
  method: string,
  operation: () => Promise<T>,
  records: RpcAttemptRecord[],
  maximumAttempts = 3,
): Promise<RpcResult<T>> {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const value = await operation();
      records.push({ method, attempts: attempt, outcome: "success" });
      return { kind: "success", value, attempts: attempt };
    } catch (error) {
      const rendered = compactError(error);
      if (!isTransientRpcError(error)) {
        records.push({ method, attempts: attempt, outcome: "deterministic-error", error: rendered });
        return { kind: "deterministic-error", error: rendered, attempts: attempt };
      }
      if (attempt === maximumAttempts) {
        records.push({ method, attempts: attempt, outcome: "unavailable", error: rendered });
        return { kind: "unavailable", error: rendered, attempts: attempt };
      }
      console.log(`RPC RETRY: ${method} attempt ${attempt + 1}/${maximumAttempts} after ${rendered}`);
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw new Error("Unreachable retry state.");
}
