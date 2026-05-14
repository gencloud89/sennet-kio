import { useMemo } from "react";

import {
  useAppRefreshers,
  useClashConfigData,
  useProxiesData,
} from "@/providers/app-data-context";

interface ProxyGroup {
  name: string;
  now: string;
  type?: string;
}

const SENNET_MAIN_GROUPS = ["SENVIET"];
const SKIP_GROUPS = ["GLOBAL", "DIRECT", "REJECT"];

export const useCurrentProxy = () => {
  const { proxies } = useProxiesData();
  const { clashConfig } = useClashConfigData();
  const { refreshProxy } = useAppRefreshers();

  const currentMode = clashConfig?.mode?.toLowerCase() || "rule";

  const currentProxyInfo = useMemo(() => {
    if (!proxies) return { currentProxy: null, primaryGroupName: null };

    const { global, groups, records } = proxies;

    let primaryGroupName = "GLOBAL";
    let currentName = global?.now;

    if (currentMode === "rule" && groups.length > 0) {
      // 1. Look for SENVIET (main selector) first
      const sennetGroup = groups.find((g: ProxyGroup) =>
        SENNET_MAIN_GROUPS.includes(g.name),
      );

      if (sennetGroup) {
        primaryGroupName = sennetGroup.name;
        const senvietNow = sennetGroup.now;

        if (senvietNow) {
          // If SENVIET points to another group (e.g. 自动选择), follow it
          const subGroup = groups.find(
            (g: ProxyGroup) => g.name === senvietNow,
          );
          if (subGroup && subGroup.now) {
            // Use the sub-group's actual selection (e.g. 自动选择 → VIETNAM-HN1|GOD)
            currentName = subGroup.now;
          } else if (subGroup && !subGroup.now) {
            // Sub-group (url-test) still running — use its name as placeholder
            currentName = senvietNow;
          } else {
            // SENVIET points directly to a proxy node
            currentName = senvietNow;
          }
        }
      } else {
        // Fallback: first non-SKIP group
        const fallback = groups.find(
          (g: ProxyGroup) => !SKIP_GROUPS.includes(g.name),
        );
        if (fallback) {
          primaryGroupName = fallback.name;
          currentName = fallback.now;
        }
      }
    }

    if (!currentName) return { currentProxy: null, primaryGroupName };

    const currentProxy = records[currentName] || {
      name: currentName,
      type: "Unknown",
      udp: false,
      xudp: false,
      tfo: false,
      mptcp: false,
      smux: false,
      history: [],
    };

    return { currentProxy, primaryGroupName };
  }, [proxies, currentMode]);

  return {
    currentProxy: currentProxyInfo.currentProxy,
    primaryGroupName: currentProxyInfo.primaryGroupName,
    mode: currentMode,
    refreshProxy,
  };
};
