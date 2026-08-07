export class ContentApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ContentApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function apiErrorFromPayload(value: unknown, status: number, fallback: string): ContentApiError {
  const container = isRecord(value) && isRecord(value.error) ? value.error : value;
  const code = isRecord(container) && typeof container.code === "string" ? container.code : "CONTENT_API_ERROR";
  const message = isRecord(container) && typeof container.message === "string" ? container.message : fallback;
  return new ContentApiError(status, code, message);
}

export async function responseError(response: Response, fallback: string): Promise<ContentApiError> {
  const text = await response.text();
  const data = text.split(/\r?\n/).find((line) => line.startsWith("data:"));
  try {
    return apiErrorFromPayload(JSON.parse(data ? data.slice(5).trimStart() : text), response.status, fallback);
  } catch {
    return new ContentApiError(response.status, "CONTENT_API_ERROR", fallback);
  }
}
