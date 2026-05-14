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

  const login = useCallback(async (email: string, password: string) => {
    await loginV2board(email, password);
    try {
      const info = await getUserInfo();
      setUserInfo(info);
    } catch {
      // non-critical — user info can load later
    }
  }, []);

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
