import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router";

import { isInfoNode } from "@/components/proxy/use-filter-sort";
import { useCurrentProxy } from "@/hooks/use-current-proxy";
import { useSystemProxyState } from "@/hooks/use-system-proxy-state";
import { useTrafficData } from "@/hooks/use-traffic-data";

const BG = "#0D1117";
const ACCENT = "#2563EB";
const TEXT = "#F0F6FC";
const MUTED = "#8B949E";
const CARD = "#161B22";
const BORDER = "#21262d";

function formatSpeed(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB/s`;
}

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

export default function HomePage() {
  const navigate = useNavigate();
  const { indicator, configState, toggleSystemProxy } = useSystemProxyState();
  const { currentProxy } = useCurrentProxy();
  const { response: traffic } = useTrafficData();
  const [toggling, setToggling] = useState(false);

  // indicator = OS thực tế, configState = setting đã lưu
  // Đang chờ OS áp dụng khi 2 giá trị khác nhau
  const isPending = configState !== indicator && !toggling;
  const isConnected = indicator; // dùng trạng thái OS thực

  const handleToggle = async () => {
    setToggling(true);
    try {
      await toggleSystemProxy(!configState);
    } finally {
      setToggling(false);
    }
  };

  const upBytes = (traffic?.data as { up?: number } | null)?.up ?? 0;
  const downBytes = (traffic?.data as { down?: number } | null)?.down ?? 0;
  const rawName = currentProxy?.name ?? "";
  const isAutoSelect = rawName === "自动选择" || rawName === "故障转移";
  const proxyName =
    !rawName || isInfoNode(rawName)
      ? "Chưa chọn máy chủ"
      : isAutoSelect
        ? "Đang kiểm tra..."
        : rawName;
  const flag = getNodeFlag(proxyName);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: BG,
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Header bar — server selector */}
      <Box
        sx={{
          px: 2.5,
          pt: 2.5,
          pb: 0,
          flexShrink: 0,
        }}
      >
        <Box
          onClick={() => navigate("/proxies")}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2.5,
            py: 1.4,
            borderRadius: 3,
            bgcolor: CARD,
            border: `1px solid ${BORDER}`,
            cursor: "pointer",
            transition: "border-color 0.2s, box-shadow 0.2s",
            "&:hover": {
              borderColor: ACCENT,
              boxShadow: `0 0 0 1px ${ACCENT}44`,
            },
          }}
        >
          <Typography sx={{ fontSize: "1.3rem", lineHeight: 1, flexShrink: 0 }}>
            {flag}
          </Typography>
          <Typography
            sx={{
              color: TEXT,
              fontWeight: 600,
              fontSize: "0.88rem",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {proxyName}
          </Typography>
          <KeyboardArrowDownIcon
            sx={{ color: MUTED, fontSize: 18, flexShrink: 0 }}
          />
        </Box>
      </Box>

      {/* Power section card */}
      <Box
        sx={{
          flex: 1,
          mx: 2.5,
          mt: 2,
          mb: 2,
          borderRadius: 3,
          bgcolor: CARD,
          border: `1px solid ${isConnected ? `${ACCENT}44` : BORDER}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          transition: "border-color 0.4s",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle glow bg when connected */}
        {isConnected && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at 50% 50%, ${ACCENT}0A 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Power button */}
        <Box
          onClick={toggling ? undefined : handleToggle}
          sx={{
            position: "relative",
            cursor: toggling ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isConnected && (
            <>
              <Box
                sx={{
                  position: "absolute",
                  width: 210,
                  height: 210,
                  borderRadius: "50%",
                  bgcolor: `${ACCENT}0C`,
                  animation: "pulse 2s ease-in-out infinite",
                  "@keyframes pulse": {
                    "0%, 100%": { transform: "scale(1)", opacity: 1 },
                    "50%": { transform: "scale(1.06)", opacity: 0.6 },
                  },
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  width: 176,
                  height: 176,
                  borderRadius: "50%",
                  bgcolor: `${ACCENT}16`,
                }}
              />
            </>
          )}

          <Box
            sx={{
              width: 148,
              height: 148,
              borderRadius: "50%",
              border: `3px solid ${isConnected ? ACCENT : "#2a2f38"}`,
              bgcolor: isConnected ? `${ACCENT}1A` : "#0a0e14",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.4s ease",
              boxShadow: isConnected
                ? `0 0 28px ${ACCENT}44, inset 0 0 28px ${ACCENT}11`
                : "none",
              "&:hover": {
                borderColor: isConnected ? "#60a5fa" : "#444",
                boxShadow: isConnected
                  ? `0 0 40px ${ACCENT}66`
                  : `0 0 12px #ffffff0a`,
              },
            }}
          >
            {toggling ? (
              <CircularProgress size={48} sx={{ color: ACCENT }} />
            ) : (
              <PowerSettingsNewIcon
                sx={{
                  fontSize: 62,
                  color: isConnected ? ACCENT : "#3a4049",
                  transition: "color 0.4s ease",
                  filter: isConnected
                    ? `drop-shadow(0 0 8px ${ACCENT}88)`
                    : "none",
                }}
              />
            )}
          </Box>
        </Box>

        {/* Status */}
        <Typography
          variant="h6"
          sx={{
            color:
              toggling || isPending ? "#f59e0b" : isConnected ? ACCENT : MUTED,
            fontWeight: 700,
            letterSpacing: 0.5,
            fontSize: "0.95rem",
            transition: "color 0.4s ease",
          }}
        >
          {toggling
            ? "Đang xử lý..."
            : isPending
              ? "Đang áp dụng..."
              : isConnected
                ? "Đã kết nối"
                : "Chưa kết nối"}
        </Typography>

        {/* Warning: config=on but OS not applying */}
        {!toggling && configState && !isConnected && (
          <Box
            sx={{
              mx: 2,
              px: 2,
              py: 1,
              borderRadius: 2,
              bgcolor: "#2a1a00",
              border: "1px solid #f59e0b44",
              textAlign: "center",
            }}
          >
            <Typography
              sx={{ color: "#f59e0b", fontSize: "0.75rem", lineHeight: 1.5 }}
            >
              Proxy chưa được áp dụng vào hệ thống.
              <br />
              Kiểm tra quyền Network trong System Preferences.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Traffic stats */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          px: 2.5,
          pb: 2.5,
          flexShrink: 0,
        }}
      >
        {[
          {
            label: "Tải xuống",
            value: formatSpeed(downBytes),
            icon: "↓",
            color: "#22d3ee",
          },
          {
            label: "Tải lên",
            value: formatSpeed(upBytes),
            icon: "↑",
            color: "#a78bfa",
          },
        ].map(({ label, value, icon, color }) => (
          <Box
            key={label}
            sx={{
              flex: 1,
              textAlign: "center",
              px: 2,
              py: 1.5,
              borderRadius: 2.5,
              bgcolor: CARD,
              border: `1px solid ${BORDER}`,
            }}
          >
            <Typography sx={{ fontSize: "1.1rem", color, mb: 0.3 }}>
              {icon}
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{
                color: TEXT,
                fontWeight: 700,
                lineHeight: 1.2,
                fontSize: "0.9rem",
              }}
            >
              {value}
            </Typography>
            <Typography variant="caption" sx={{ color: MUTED }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
