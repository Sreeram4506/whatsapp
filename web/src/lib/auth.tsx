import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { Me } from "./types";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({ me: null, loading: true, refresh: async () => null, logout: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Me>("/api/auth/me");
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    setMe(null);
  }, []);
  useEffect(() => {
    void refresh();
    const h = () => setMe(null);
    window.addEventListener("cos:unauthorized", h);
    return () => window.removeEventListener("cos:unauthorized", h);
  }, [refresh]);
  return <Ctx.Provider value={{ me, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function homeFor(role: string) {
  if (role === "PLATFORM_ADMIN") return "/platform";
  if (role === "FIELD_OFFICER") return "/app/field";
  return "/app";
}
