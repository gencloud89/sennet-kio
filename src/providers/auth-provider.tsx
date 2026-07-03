import { useQueryClient } from "@tanstack/react-query";
import React, { createContext, useCallback, useContext, useState } from "react";

import {
  UserInfo,
  checkAuth,
  getUserInfo,
  loginV2board,
  logoutV2board,
} from "@/services/v2board";

interface AuthContextValue {
  userInfo: UserInfo | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserInfo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const queryClient = useQueryClient();

  const login = useCallback(async (email: string, password: string) => {
    await loginV2board(email, password);
    // Explicitly refresh proxies and config after login.
    // The backend emits verge://refresh-proxy-config during profile
    // activation but this happens while the login invoke is pending;
    // by the time the frontend processes the event the throttle window
    // may have closed. An explicit invalidation ensures the queries
    // refetch regardless of event timing.
    queryClient.invalidateQueries({ queryKey: ["getProxies"] });
    queryClient.invalidateQueries({ queryKey: ["getClashConfig"] });
    try {
      const info = await getUserInfo();
      setUserInfo(info);
    } catch {
      // non-critical — user info can load later
    }
  }, [queryClient]);

  const logout = useCallback(async () => {
    await logoutV2board();
    setUserInfo(null);
  }, []);

  const refreshUserInfo = useCallback(async () => {
    try {
      const info = await getUserInfo();
      setUserInfo(info);
    } catch {
      setUserInfo(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ userInfo, login, logout, refreshUserInfo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { checkAuth };
