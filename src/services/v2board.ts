import { invoke } from "@tauri-apps/api/core";

export interface UserInfo {
  email: string;
  expired_at: number | null;
  upload: number;
  download: number;
  total: number;
  plan_name: string;
  reset_day: number | null;
}

export async function loginV2board(
  email: string,
  password: string,
): Promise<void> {
  return invoke<void>("login_v2board", { email, password });
}

export async function logoutV2board(): Promise<void> {
  return invoke<void>("logout");
}

export async function getUserInfo(): Promise<UserInfo> {
  return invoke<UserInfo>("get_user_info");
}

export async function checkAuth(): Promise<boolean> {
  return invoke<boolean>("check_auth");
}

export async function ensureSubscription(): Promise<void> {
  return invoke<void>("ensure_subscription");
}
