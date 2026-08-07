import { responseError } from "./api-client";
import { videoFromApi, type ContentCapability, type Video, type VideoSource } from "./types";

export interface PremiumTag {
  id: string;
  label: string;
  value: string;
}

interface PremiumTypesResult {
  tags: PremiumTag[];
  capability: ContentCapability;
}

interface PremiumCategoryResult {
  videos: Video[];
  capability: ContentCapability;
}

function jsonHeaders() {
  return { "Content-Type": "application/json", Accept: "application/json" };
}

export async function unlockPremium(password: string): Promise<void> {
  const response = await fetch("/api/auth", {
    method: "POST", credentials: "same-origin", headers: jsonHeaders(),
    body: JSON.stringify({ type: "premium", password }),
  });
  if (!response.ok) throw await responseError(response, "Premium 解锁失败。");
}

export async function loadPremiumTypes(sources: VideoSource[], signal?: AbortSignal): Promise<PremiumTypesResult> {
  const response = await fetch("/api/premium/types", {
    method: "POST", credentials: "same-origin", headers: jsonHeaders(), signal,
    body: JSON.stringify({ sources }),
  });
  if (!response.ok) throw await responseError(response, "无法读取 Premium 分类。");
  const body = await response.json() as { tags?: PremiumTag[]; capability?: ContentCapability };
  if (!Array.isArray(body.tags) || !body.capability) throw new Error("Premium 分类响应无效。");
  return { tags: body.tags, capability: body.capability };
}

export async function loadPremiumCategory(
  sources: VideoSource[], category: string, signal?: AbortSignal,
): Promise<PremiumCategoryResult> {
  const response = await fetch("/api/premium/category", {
    method: "POST", credentials: "same-origin", headers: jsonHeaders(), signal,
    body: JSON.stringify({ sources, category, page: 1, limit: 20 }),
  });
  if (!response.ok) throw await responseError(response, "无法读取 Premium 内容。");
  const body = await response.json() as { videos?: unknown[]; capability?: ContentCapability };
  if (!Array.isArray(body.videos) || !body.capability) throw new Error("Premium 内容响应无效。");
  return { videos: body.videos.map((value) => videoFromApi(value)).filter((value): value is Video => !!value), capability: body.capability };
}
