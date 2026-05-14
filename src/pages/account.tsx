import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import LogoutIcon from "@mui/icons-material/Logout";
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/providers/auth-provider";
import { UserInfo } from "@/services/v2board";

const BG = "#0D1117";
const CARD = "#161B22";
const ACCENT = "#2563EB";
const TEXT = "#F0F6FC";
const MUTED = "#8B949E";
const BORDER = "#21262d";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 GB";
  const gb = bytes / 1_073_741_824;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1_048_576;
  return `${mb.toFixed(0)} MB`;
}

function formatExpiry(ts: number | null): string {
  if (!ts) return "Không giới hạn";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Box
      sx={{
        bgcolor: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 2,
        p: 2,
        flex: 1,
        textAlign: "center",
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 700, color: TEXT }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: MUTED }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { userInfo, refreshUserInfo, logout } = useAuth();
  const [loading, setLoading] = useState(!userInfo);

  useEffect(() => {
    if (!userInfo) {
      refreshUserInfo().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <CircularProgress sx={{ color: ACCENT }} />
      </Box>
    );
  }

  const info: UserInfo | null = userInfo;
  const used = info ? info.upload + info.download : 0;
  const total = info ? info.total : 1;
  const usedPct = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  return (
    <Box
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        bgcolor: BG,
        minHeight: "100%",
        color: TEXT,
      }}
    >
      {/* Profile header */}
      <Box
        sx={{
          bgcolor: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 2,
          p: 3,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <AccountCircleIcon sx={{ fontSize: 52, color: MUTED }} />
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: TEXT }}>
            {info?.email ?? "—"}
          </Typography>
          <Typography variant="body2" sx={{ color: MUTED }}>
            Gói: {info?.plan_name ?? "—"}
          </Typography>
        </Box>
      </Box>

      {/* Stats row */}
      <Box sx={{ display: "flex", gap: 2 }}>
        <StatCard
          label="Hết hạn"
          value={formatExpiry(info?.expired_at ?? null)}
        />
        <StatCard
          label="Đã dùng"
          value={`${formatBytes(used)} / ${formatBytes(total)}`}
        />
        {info?.reset_day != null && (
          <StatCard label="Reset sau" value={`${info.reset_day} ngày`} />
        )}
      </Box>

      {/* Traffic progress */}
      <Box
        sx={{
          bgcolor: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 2,
          p: 3,
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="body2" sx={{ color: MUTED }}>
            Lưu lượng
          </Typography>
          <Typography variant="body2" sx={{ color: TEXT }}>
            {usedPct.toFixed(1)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={usedPct}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: "#21262d",
            "& .MuiLinearProgress-bar": { bgcolor: ACCENT, borderRadius: 4 },
          }}
        />
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: MUTED }}>
            Upload: {formatBytes(info?.upload ?? 0)}
          </Typography>
          <Typography variant="caption" sx={{ color: MUTED }}>
            Download: {formatBytes(info?.download ?? 0)}
          </Typography>
        </Box>
      </Box>

      {/* Logout */}
      <Button
        variant="outlined"
        color="error"
        startIcon={<LogoutIcon />}
        onClick={handleLogout}
        sx={{
          textTransform: "none",
          borderColor: "#f85149",
          color: "#f85149",
          "&:hover": { bgcolor: "#2d0f0f", borderColor: "#f85149" },
        }}
      >
        Đăng xuất
      </Button>
    </Box>
  );
}
