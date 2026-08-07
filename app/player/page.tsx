import { Suspense } from "react";
import { PlayerExperience } from "@/components/PlayerExperience";

export default function PlayerPage() {
  return <Suspense fallback={<p className="content-message">正在准备播放器…</p>}><PlayerExperience /></Suspense>;
}
