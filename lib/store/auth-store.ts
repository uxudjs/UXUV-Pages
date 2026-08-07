"use client";

import { createContext, useContext } from "react";

export type Role = "super_admin" | "admin" | "viewer";

export interface AuthSession {
  accountId: string;
  profileId: string;
  username: string;
  name: string;
  role: Role;
  customPermissions: string[];
  mode: "managed";
}

export interface AuthContextValue {
  session: AuthSession;
  refreshSession: () => Promise<boolean>;
  markSessionExpired: () => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function isDirectPagesHost(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(".github.io");
}

export function useAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

