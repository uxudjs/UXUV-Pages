import type { LucideIcon, LucideProps } from "lucide-react";

interface IconProps extends Omit<LucideProps, "ref"> {
  source: LucideIcon;
}

export function Icon({ source: Source, ...props }: IconProps) {
  return <Source aria-hidden="true" focusable="false" {...props} />;
}
