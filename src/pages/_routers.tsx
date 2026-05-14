import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import WifiRoundedIcon from "@mui/icons-material/WifiRounded";
import { createHashRouter, redirect, RouteObject } from "react-router";

import HomeSvg from "@/assets/image/itemicon/home.svg?react";
import ProxiesSvg from "@/assets/image/itemicon/proxies.svg?react";
import SettingsSvg from "@/assets/image/itemicon/settings.svg?react";
import { checkAuth } from "@/providers/auth-provider";

import Layout from "./_layout";
import HomePage from "./home";
import LoginPage from "./login";
import ProxiesPage from "./proxies";
import SettingsPage from "./settings";

// Only expose the 4 core nav items
export const navItems = [
  {
    label: "Trang chủ",
    path: "/",
    icon: [<HomeRoundedIcon key="mui" />, <HomeSvg key="svg" />],
    Component: HomePage,
  },
  {
    label: "Máy chủ",
    path: "/proxies",
    icon: [<WifiRoundedIcon key="mui" />, <ProxiesSvg key="svg" />],
    Component: ProxiesPage,
  },
  {
    label: "Tài khoản",
    path: "/account",
    icon: [<AccountCircleRoundedIcon key="mui" />, null],
    Component: () => null, // lazy-loaded in route
  },
  {
    label: "Cài đặt",
    path: "/settings",
    icon: [<SettingsRoundedIcon key="mui" />, <SettingsSvg key="svg" />],
    Component: SettingsPage,
  },
];

async function authLoader() {
  const ok = await checkAuth();
  if (!ok) return redirect("/login");
  return null;
}

export const router = createHashRouter([
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/",
    Component: Layout,
    loader: authLoader,
    children: [
      { path: "/", Component: HomePage },
      { path: "/proxies", Component: ProxiesPage },
      {
        path: "/account",
        lazy: async () => {
          const { default: AccountPage } = await import("./account");
          return { Component: AccountPage };
        },
      },
      { path: "/settings", Component: SettingsPage },
    ] as RouteObject[],
  },
]);
