"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/store/auth-store";

interface AdminGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AdminGate({ children, fallback = null }: AdminGateProps) {
  const auth = useAuth();
  if (auth?.session?.role !== "super_admin") return <>{fallback}</>;
  return <>{children}</>;
}

