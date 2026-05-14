import {
  DarkModeRounded,
  LightModeRounded,
  SettingsBrightnessRounded,
} from "@mui/icons-material";
import {
  Box,
  MenuItem,
  Select,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useState } from "react";

import { useClash } from "@/hooks/use-clash";
import { useSystemProxyState } from "@/hooks/use-system-proxy-state";
import { useVerge } from "@/hooks/use-verge";
import { showNotice } from "@/services/notice-service";

const BG = "#0D1117";
const CARD = "#161B22";
const BORDER = "#21262d";
const TEXT = "#F0F6FC";
const MUTED = "#8B949E";
const ACCENT = "#2563EB";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        color: MUTED,
        fontSize: "0.72rem",
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: "uppercase",
        mb: 1,
        px: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 2,
        py: 1.5,
        borderBottom: `1px solid ${BORDER}`,
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Box>
        <Typography sx={{ color: TEXT, fontSize: "0.9rem", fontWeight: 500 }}>
          {label}
        </Typography>
        {description && (
          <Typography sx={{ color: MUTED, fontSize: "0.75rem", mt: 0.3 }}>
            {description}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}

function SettingCard({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        bgcolor: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 2,
        mb: 2,
        overflow: "hidden",
      }}
    >
      {children}
    </Box>
  );
}

export default function SettingsPage() {
  const { verge, mutateVerge, patchVerge } = useVerge();
  const { clash, patchClash } = useClash();
  const { indicator: sysProxyOn, toggleSystemProxy } = useSystemProxyState();

  const [portInput, setPortInput] = useState<string>("");

  const tunMode = verge?.enable_tun_mode ?? false;
  const autoLaunch = verge?.enable_auto_launch ?? false;
  const silentStart = verge?.enable_silent_start ?? false;
  const themeMode = verge?.theme_mode ?? "system";
  const language = verge?.language ?? "vi";
  const clashMode = clash?.mode ?? "rule";
  const mixedPort = verge?.verge_mixed_port ?? 7897;

  const patch = async (key: keyof IVergeConfig, value: unknown) => {
    try {
      mutateVerge({ ...verge, [key]: value } as IVergeConfig, false);
      await patchVerge({ [key]: value } as Partial<IVergeConfig>);
    } catch (e) {
      showNotice.error(e);
    }
  };

  const handlePortBlur = async () => {
    const num = parseInt(portInput, 10);
    if (!portInput) return;
    if (isNaN(num) || num < 1024 || num > 65535) {
      showNotice.error("Cổng không hợp lệ (1024–65535)");
      setPortInput("");
      return;
    }
    try {
      await patchVerge({ verge_mixed_port: num });
      mutateVerge({ ...verge, verge_mixed_port: num } as IVergeConfig, false);
    } catch (e) {
      showNotice.error(e);
    }
    setPortInput("");
  };

  return (
    <Box
      sx={{
        bgcolor: BG,
        height: "100%",
        p: 3,
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      <Typography
        variant="h6"
        sx={{ color: TEXT, fontWeight: 700, mb: 3, letterSpacing: 0.5 }}
      >
        Cài đặt
      </Typography>

      {/* Kết nối */}
      <SectionTitle>Kết nối</SectionTitle>
      <SettingCard>
        <SettingRow
          label="Proxy hệ thống"
          description="Định tuyến traffic qua proxy của ứng dụng"
        >
          <Switch
            checked={sysProxyOn}
            onChange={(_, v) => toggleSystemProxy(v).catch(() => {})}
            sx={{
              "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                bgcolor: ACCENT,
              },
            }}
          />
        </SettingRow>
        <SettingRow
          label="Chế độ TUN"
          description="Chặn toàn bộ traffic ở cấp độ hệ điều hành"
        >
          <Switch
            checked={tunMode}
            onChange={(_, v) => patch("enable_tun_mode", v)}
            sx={{
              "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                bgcolor: ACCENT,
              },
            }}
          />
        </SettingRow>
        <SettingRow label="Chế độ proxy">
          <Select
            value={clashMode}
            size="small"
            onChange={(e) =>
              patchClash({ mode: e.target.value as IConfigData["mode"] }).catch(
                () => {},
              )
            }
            sx={{
              color: TEXT,
              fontSize: "0.85rem",
              bgcolor: "#0D1117",
              border: `1px solid ${BORDER}`,
              borderRadius: 1,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "& .MuiSvgIcon-root": { color: MUTED },
              minWidth: 110,
            }}
          >
            <MenuItem value="rule">Rule (Quy tắc)</MenuItem>
            <MenuItem value="global">Global (Toàn cục)</MenuItem>
            <MenuItem value="direct">Direct (Trực tiếp)</MenuItem>
          </Select>
        </SettingRow>
        <SettingRow
          label="Cổng Mixed"
          description="Cổng HTTP/SOCKS proxy hỗn hợp"
        >
          <Box
            component="input"
            type="number"
            value={portInput !== "" ? portInput : mixedPort}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPortInput(e.target.value)
            }
            onBlur={handlePortBlur}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handlePortBlur();
            }}
            sx={{
              width: 90,
              bgcolor: "#0D1117",
              border: `1px solid ${BORDER}`,
              borderRadius: 1,
              color: TEXT,
              fontSize: "0.85rem",
              px: 1.5,
              py: 0.8,
              outline: "none",
              "&:focus": { borderColor: ACCENT },
              textAlign: "center",
            }}
          />
        </SettingRow>
      </SettingCard>

      {/* Khởi động */}
      <SectionTitle>Khởi động</SectionTitle>
      <SettingCard>
        <SettingRow
          label="Khởi động cùng hệ thống"
          description="Tự động mở ứng dụng khi bật máy"
        >
          <Switch
            checked={autoLaunch}
            onChange={(_, v) => patch("enable_auto_launch", v)}
            sx={{
              "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                bgcolor: ACCENT,
              },
            }}
          />
        </SettingRow>
        <SettingRow
          label="Khởi động ẩn"
          description="Chạy trong khay hệ thống, không hiện cửa sổ"
        >
          <Switch
            checked={silentStart}
            onChange={(_, v) => patch("enable_silent_start", v)}
            sx={{
              "& .MuiSwitch-switchBase.Mui-checked": { color: ACCENT },
              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                bgcolor: ACCENT,
              },
            }}
          />
        </SettingRow>
      </SettingCard>

      {/* Giao diện */}
      <SectionTitle>Giao diện</SectionTitle>
      <SettingCard>
        <SettingRow label="Chủ đề">
          <ToggleButtonGroup
            value={themeMode}
            exclusive
            size="small"
            onChange={(_, v) => v && patch("theme_mode", v)}
            sx={{
              "& .MuiToggleButton-root": {
                color: MUTED,
                borderColor: BORDER,
                px: 1.5,
                py: 0.5,
                "&.Mui-selected": {
                  bgcolor: `${ACCENT}22`,
                  color: ACCENT,
                  borderColor: ACCENT,
                },
              },
            }}
          >
            <ToggleButton value="light" title="Sáng">
              <LightModeRounded sx={{ fontSize: 16 }} />
            </ToggleButton>
            <ToggleButton value="dark" title="Tối">
              <DarkModeRounded sx={{ fontSize: 16 }} />
            </ToggleButton>
            <ToggleButton value="system" title="Hệ thống">
              <SettingsBrightnessRounded sx={{ fontSize: 16 }} />
            </ToggleButton>
          </ToggleButtonGroup>
        </SettingRow>
        <SettingRow label="Ngôn ngữ">
          <Select
            value={language}
            size="small"
            onChange={(e) => patch("language", e.target.value)}
            sx={{
              color: TEXT,
              fontSize: "0.85rem",
              bgcolor: "#0D1117",
              border: `1px solid ${BORDER}`,
              borderRadius: 1,
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "& .MuiSvgIcon-root": { color: MUTED },
              minWidth: 140,
            }}
          >
            <MenuItem value="vi">Tiếng Việt</MenuItem>
            <MenuItem value="en">English</MenuItem>
            <MenuItem value="zh">中文</MenuItem>
          </Select>
        </SettingRow>
      </SettingCard>
    </Box>
  );
}
