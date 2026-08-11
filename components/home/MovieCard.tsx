"use client";

import { memo, useState } from "react";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { HomeMovie } from "@/lib/content/api-client";

interface MovieCardProps {
  movie: HomeMovie;
  actionLabel: string;
  onMovieClick: (movie: HomeMovie) => void;
}

export const MovieCard = memo(function MovieCard({ movie, actionLabel, onMovieClick }: MovieCardProps) {
  const [imageError, setImageError] = useState(!movie.cover);
  const [fallbackError, setFallbackError] = useState(false);
  const poster = imageError ? "placeholder-poster.svg" : movie.cover;

  return (
    <button
      type="button"
      className="kvideo-movie-link"
      data-focusable
      aria-label={`${actionLabel} ${movie.title}`}
      onClick={() => onMovieClick(movie)}
    >
      <Card className="kvideo-movie-card">
        <div className="kvideo-poster-frame">
          {!fallbackError ? (
            // Static export deliberately avoids the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={movie.title}
              loading="eager"
              referrerPolicy="no-referrer"
              src={poster}
              onError={() => {
                if (!imageError) setImageError(true);
                else setFallbackError(true);
              }}
            />
          ) : <span className="kvideo-poster-text">Image Not Available</span>}
          {movie.rate && Number.parseFloat(movie.rate) > 0 && (
            <span className="kvideo-rating" aria-label={`${movie.rate} / 10`}>
              <Icon source={Star} size={12} />
              <strong>{movie.rate}</strong>
            </span>
          )}
        </div>
        <div className="kvideo-movie-copy"><h3>{movie.title}</h3></div>
      </Card>
    </button>
  );
});
