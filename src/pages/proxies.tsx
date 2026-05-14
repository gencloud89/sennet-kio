import BoltIcon from "@mui/icons-material/Bolt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import NetworkCheckIcon from "@mui/icons-material/NetworkCheck";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import {
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useLockFn } from "ahooks";
import { useMemo, useState } from "react";
import { delayGroup, selectNodeForGroup } from "tauri-plugin-mihomo-api";

import { isInfoNode } from "@/components/proxy/use-filter-sort";
import { useProxySelection } from "@/hooks/use-proxy-selection";
import { useAppRefreshers, useProxiesData } from "@/providers/app-data-context";

const BG = "#0D1117";
const ACCENT = "#2563EB";
const TEXT = "#F0F6FC";
const MUTED = "#8B949E";
const CARD = "#161B22";
const BORDER = "#21262d";

const TCP_TEST_TIMEOUT = 5000;
const DELAY_TEST_URL = "http://www.gstatic.com/generate_204";

function getNodeFlag(name: string): string {
  const n = (name ?? "").toLowerCase();
  if (
    n.includes("vietnam") ||
    n.includes("-hn") ||
    n.includes("-sg_vn") ||
    n.includes("-hp") ||
    n.includes("-dn") ||
    n.includes("-qn") ||
    n.includes("-qb")
  )
    return "🇻🇳";
  if (n.includes("singapore") || n.includes("-sg")) return "🇸🇬";
  if (n.includes("japan") || n.includes("-jp")) return "🇯🇵";
  if (n.includes("hong") || n.includes("-hk")) return "🇭🇰";
  if (n.includes("usa") || n.includes("united states") || n.includes("-us"))
    return "🇺🇸";
  if (n.includes("korea") || n.includes("-kr")) return "🇰🇷";
  return "🌐";
}

function formatProxyName(name: string): string {
  if (!name) return name;
  const withoutCountry = name.replace(/^[A-Z]+-/, "");
  return withoutCountry.replace("|", " · ");
}

function getDelay(history: { time: string; delay: number }[]): number {
  if (!history || history.length === 0) return -1;
  return history[history.length - 1].delay;
}

function DelayBadge({ delay, testing }: { delay: number; testing?: boolean }) {
  if (testing) {
    return <CircularProgress size={12} sx={{ color: ACCENT }} />;
  }
  if (delay < 0) {
    return (
      <Typography variant="caption" sx={{ color: "#555", fontSize: "0.72rem" }}>
        —
      </Typography>
    );
  }
  if (delay === 0) {
    return (
      <Typography
        variant="caption"
        sx={{
          color: "#f85149",
          fontSize: "0.72rem",
          bgcolor: "#2d0f0f",
          px: 0.8,
          py: 0.3,
          borderRadius: 1,
        }}
      >
        timeout
      </Typography>
    );
  }
  const color = delay < 200 ? "#22d3ee" : delay < 500 ? "#f59e0b" : "#f85149";
  const bg = delay < 200 ? "#0e2a2f" : delay < 500 ? "#2a1f0e" : "#2d0f0f";
  return (
    <Typography
      variant="caption"
      sx={{
        color,
        bgcolor: bg,
        px: 0.8,
        py: 0.3,
        borderRadius: 1,
        fontSize: "0.72rem",
        fontWeight: 600,
      }}
    >
      {delay}ms
    </Typography>
  );
}

const SELECTOR_NAMES = ["SENVIET", "Proxy", "节点选择", "代理选择"];
const SKIP_GROUPS = [
  "自动选择",
  "故障转移",
  "GLOBAL",
  "DIRECT",
  "REJECT",
  "🔰",
];

export default function ProxiesPage() {
  const { proxies, isProxiesPending } = useProxiesData();
  const { refreshProxy } = useAppRefreshers();
  const { changeProxy } = useProxySelection({
    onSuccess: () => refreshProxy(),
  });

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [autoSelecting, setAutoSelecting] = useState(false);
  // Track per-node delays and testing state
  const [delayMap, setDelayMap] = useState<Record<string, number>>({});
  const [testingSet, setTestingSet] = useState<Set<string>>(new Set());

  const mainGroup = useMemo(() => {
    if (!proxies?.groups) return null;
    const named = proxies.groups.find((g: IProxyGroupItem) =>
      SELECTOR_NAMES.includes(g.name),
    );
    if (named) return named;
    return (
      proxies.groups.find(
        (g: IProxyGroupItem) =>
          g.type?.toLowerCase() === "selector" && !SKIP_GROUPS.includes(g.name),
      ) ?? null
    );
  }, [proxies]);

  const groupName = mainGroup?.name ?? "SENVIET";
  const currentSelected = mainGroup?.now ?? "";

  const members = useMemo(() => {
    if (!mainGroup?.all) return [];
    return (mainGroup.all as IProxyItem[]).filter(
      (proxy) =>
        !isInfoNode(proxy.name) &&
        !SKIP_GROUPS.includes(proxy.name) &&
        (!search ||
          proxy.name.toLowerCase().includes(search.toLowerCase()) ||
          formatProxyName(proxy.name)
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
  }, [mainGroup, search]);

  const handleSelect = (proxyName: string) => {
    changeProxy(groupName, proxyName, currentSelected);
  };

  // Test all nodes (refresh)
  const handleRefreshDelay = useLockFn(async () => {
    setRefreshing(true);
    try {
      await delayGroup(groupName, DELAY_TEST_URL, TCP_TEST_TIMEOUT);
      await refreshProxy();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  });

  // Test all nodes and auto-select the one with lowest latency
  const handleAutoSelect = useLockFn(async () => {
    setAutoSelecting(true);
    try {
      // delayGroup returns Record<nodeName, delayMs>; timeout nodes are excluded
      const results = await delayGroup(
        groupName,
        DELAY_TEST_URL,
        TCP_TEST_TIMEOUT,
      );
      const best = Object.entries(results)
        .filter(([n]) => !isInfoNode(n) && !SKIP_GROUPS.includes(n))
        .sort(([, a], [, b]) => a - b)[0];
      if (best) {
        await selectNodeForGroup(groupName, best[0]);
        await refreshProxy();
      }
    } catch {
      // ignore
    } finally {
      setAutoSelecting(false);
    }
  });

  // Test a single node — TCP ping (direct TCP connect to proxy server:port)
  const handlePingOne = async (proxyName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // don't select the node
    if (testingSet.has(proxyName)) return;

    setTestingSet((prev) => {
      const next = new Set(prev);
      next.add(proxyName);
      return next;
    });

    try {
      const delayMs = await invoke<number>("tcp_ping_proxy", {
        name: proxyName,
        timeoutMs: TCP_TEST_TIMEOUT,
      });
      setDelayMap((prev) => ({ ...prev, [proxyName]: delayMs }));
    } catch {
      setDelayMap((prev) => ({ ...prev, [proxyName]: 0 }));
    } finally {
      setTestingSet((prev) => {
        const next = new Set(prev);
        next.delete(proxyName);
        return next;
      });
      await refreshProxy();
    }
  };

  if (isProxiesPending) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          bgcolor: BG,
        }}
      >
        <CircularProgress sx={{ color: ACCENT }} />
      </Box>
    );
  }

  if (!mainGroup) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          bgcolor: BG,
          gap: 2,
          p: 4,
        }}
      >
        <Typography sx={{ color: MUTED, textAlign: "center" }}>
          Chưa có máy chủ. Vui lòng đăng xuất và đăng nhập lại để tải cấu hình.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: BG,
        userSelect: "none",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pt: 2.5,
          pb: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexShrink: 0,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, color: TEXT, flex: 1, fontSize: "1.05rem" }}
        >
          Máy chủ
        </Typography>
        <Typography variant="caption" sx={{ color: MUTED }}>
          {members.length} máy chủ
        </Typography>
        <Tooltip title="Tự động chọn máy chủ tốt nhất">
          <IconButton
            size="small"
            onClick={handleAutoSelect}
            disabled={autoSelecting || refreshing}
            sx={{ color: MUTED, "&:hover": { color: "#f59e0b" } }}
          >
            {autoSelecting ? (
              <CircularProgress size={16} sx={{ color: "#f59e0b" }} />
            ) : (
              <BoltIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Test ping tất cả máy chủ">
          <IconButton
            size="small"
            onClick={handleRefreshDelay}
            disabled={refreshing || autoSelecting}
            sx={{ color: MUTED, "&:hover": { color: ACCENT } }}
          >
            {refreshing ? (
              <CircularProgress size={16} sx={{ color: ACCENT }} />
            ) : (
              <RefreshIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2.5, py: 1.5, flexShrink: 0 }}>
        <TextField
          size="small"
          placeholder="Tìm kiếm máy chủ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: MUTED, fontSize: 18 }} />
                </InputAdornment>
              ),
              sx: {
                bgcolor: CARD,
                color: TEXT,
                borderRadius: 2,
                fontSize: "0.875rem",
                "& fieldset": { borderColor: BORDER },
                "&:hover fieldset": { borderColor: "#444" },
                "&.Mui-focused fieldset": { borderColor: ACCENT },
              },
            },
          }}
          sx={{ "& .MuiInputLabel-root": { color: MUTED } }}
        />
      </Box>

      {/* Server list */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, pb: 2 }}>
        {members.length === 0 ? (
          <Box sx={{ textAlign: "center", mt: 6 }}>
            <Typography variant="body2" sx={{ color: MUTED }}>
              Không tìm thấy máy chủ
            </Typography>
          </Box>
        ) : (
          members.map((proxy) => {
            const isSelected = proxy.name === currentSelected;
            const historyDelay = getDelay(proxy.history);
            const displayDelay =
              delayMap[proxy.name] !== undefined
                ? delayMap[proxy.name]
                : historyDelay;
            const isTesting = testingSet.has(proxy.name);
            const flag = getNodeFlag(proxy.name);
            const displayName = formatProxyName(proxy.name);

            return (
              <Box
                key={proxy.name}
                onClick={() => handleSelect(proxy.name)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.8,
                  py: 1.2,
                  mb: 0.7,
                  borderRadius: 2,
                  bgcolor: isSelected ? `${ACCENT}18` : CARD,
                  border: `1px solid ${isSelected ? ACCENT : BORDER}`,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    borderColor: isSelected ? ACCENT : "#444",
                    bgcolor: isSelected ? `${ACCENT}22` : "#1a2030",
                  },
                  "&:hover .ping-btn": { opacity: 1 },
                }}
              >
                {/* Flag */}
                <Typography
                  sx={{ fontSize: "1.15rem", lineHeight: 1, flexShrink: 0 }}
                >
                  {flag}
                </Typography>

                {/* Name */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      color: isSelected ? TEXT : "#cdd5de",
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: "0.855rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName}
                  </Typography>
                </Box>

                {/* TCP Ping button (show on hover) */}
                <Tooltip title="TCP Ping">
                  <IconButton
                    className="ping-btn"
                    size="small"
                    onClick={(e) => handlePingOne(proxy.name, e)}
                    disabled={isTesting}
                    sx={{
                      opacity: 0,
                      p: 0.4,
                      color: MUTED,
                      transition: "opacity 0.15s, color 0.15s",
                      "&:hover": { color: ACCENT },
                      flexShrink: 0,
                    }}
                  >
                    <NetworkCheckIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>

                {/* Selected checkmark */}
                {isSelected && (
                  <CheckCircleIcon
                    sx={{ fontSize: 15, color: ACCENT, flexShrink: 0 }}
                  />
                )}

                {/* Delay badge */}
                <Box sx={{ flexShrink: 0, minWidth: 40, textAlign: "right" }}>
                  <DelayBadge delay={displayDelay} testing={isTesting} />
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
