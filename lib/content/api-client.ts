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

export interface HomeMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

export type HomeContentType = "movie" | "tv";

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

function doubanUrl(path: "tags" | "recommend", parameters: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) searchParams.set(key, value);
  return `/api/douban/${path}?${searchParams.toString()}`;
}

export async function fetchHomeTags(type: HomeContentType, signal: AbortSignal): Promise<string[]> {
  const response = await fetch(doubanUrl("tags", { type }), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await responseError(response, `Unable to load home tags (${response.status}).`);
  const value: unknown = await response.json();
  if (!isRecord(value) || !Array.isArray(value.tags)) {
    throw new ContentApiError(502, "HOME_TAGS_INVALID", "Home tags response is invalid.");
  }
  const tags = value.tags
    .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0 && tag.length <= 80)
    .map((tag) => tag.trim())
    .filter((tag, index, values) => values.indexOf(tag) === index)
    .slice(0, 30);
  return tags.includes("热门") ? tags : ["热门", ...tags];
}

export async function fetchHomeMovies(
  {
    type,
    tag,
    pageStart = 0,
    pageLimit = 20,
  }: { type: HomeContentType; tag: string; pageStart?: number; pageLimit?: number },
  signal: AbortSignal,
): Promise<HomeMovie[]> {
  const response = await fetch(doubanUrl("recommend", {
    type,
    tag,
    page_limit: String(pageLimit),
    page_start: String(pageStart),
  }), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await responseError(response, `Unable to load home content (${response.status}).`);

  const value: unknown = await response.json();
  if (!isRecord(value) || !Array.isArray(value.subjects)) {
    throw new ContentApiError(502, "HOME_CONTENT_INVALID", "Home content response is invalid.");
  }
  return value.subjects.flatMap((subject): HomeMovie[] => {
    if (!isRecord(subject) || typeof subject.id !== "string" || typeof subject.title !== "string") return [];
    return [{
      id: subject.id,
      title: subject.title,
      cover: typeof subject.cover === "string" ? subject.cover : "",
      rate: typeof subject.rate === "string" ? subject.rate : "",
      url: typeof subject.url === "string" ? subject.url : "",
    }];
  });
}
