import { Film } from "lucide-react";
import { MovieCard } from "@/components/home/MovieCard";
import { Icon } from "@/components/ui/Icon";
import type { HomeMovie } from "@/lib/content/api-client";
import { useInfiniteScroll } from "@/lib/hooks/useInfiniteScroll";

export type HomeFeedState = "loading" | "ready" | "empty" | "error";

interface MovieGridProps {
  movies: HomeMovie[];
  state: HomeFeedState;
  actionLabel: string;
  loadingLabel: string;
  emptyLabel: string;
  errorLabel: string;
  retryLabel: string;
  onMovieClick: (movie: HomeMovie) => void;
  onRetry: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadingMoreLabel?: string;
  noMoreLabel: string;
  onLoadMore?: () => void | Promise<void>;
}

export function MovieGrid({
  movies,
  state,
  actionLabel,
  loadingLabel,
  emptyLabel,
  errorLabel,
  retryLabel,
  onMovieClick,
  onRetry,
  hasMore = false,
  loadingMore = false,
  loadingMoreLabel = "",
  noMoreLabel,
  onLoadMore = () => {},
}: MovieGridProps) {
  const sentinelRef = useInfiniteScroll({ enabled: state === "ready" && hasMore && !loadingMore, onLoadMore });
  if (state === "loading") {
    return <div className="kvideo-home-state" role="status"><span className="kvideo-spinner" />{loadingLabel}</div>;
  }
  if (state === "error") {
    return (
      <div className="kvideo-home-state kvideo-home-error" role="alert">
        <p>{errorLabel}</p>
        <button type="button" autoFocus onClick={onRetry}>{retryLabel}</button>
      </div>
    );
  }
  if (state === "empty") {
    return <div className="kvideo-home-state" role="status"><Icon source={Film} size={64} />{emptyLabel}</div>;
  }
  return <>
    <div className="kvideo-movie-grid">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} actionLabel={actionLabel} onMovieClick={onMovieClick} />
      ))}
    </div>
    {hasMore && <div ref={sentinelRef} className="kvideo-infinite-sentinel" data-infinite-sentinel role="status"
      aria-label={loadingMoreLabel}>{loadingMore ? loadingMoreLabel : ""}</div>}
    {!hasMore && movies.length > 0 && <div className="kvideo-home-no-more"><p>{noMoreLabel}</p></div>}
  </>;
}
