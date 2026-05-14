import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import ShieldIcon from "@mui/icons-material/Shield";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/providers/auth-provider";
import { hideInitialOverlay } from "@/pages/_layout/utils";

const ACCENT = "#2563EB";
const BG = "#0D1117";
const CARD = "#161B22";
const TEXT = "#F0F6FC";
const MUTED = "#8B949E";
const BORDER = "#21262d";

const features = [
  "Kết nối an toàn, mã hoá end-to-end",
  "Hơn 18 máy chủ tốc độ cao tại Việt Nam",
  "Không lưu nhật ký hoạt động",
  "Tự động chọn máy chủ tối ưu",
];

function DarkInput({
  label,
  type,
  value,
  onChange,
  disabled,
  startIcon,
  endIcon,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        sx={{
          color: MUTED,
          fontSize: "0.78rem",
          fontWeight: 600,
          mb: 0.8,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          bgcolor: "#0a0e14",
          border: `1px solid ${BORDER}`,
          borderRadius: 2,
          px: 1.5,
          gap: 1,
          transition: "border-color 0.2s",
          "&:focus-within": { borderColor: ACCENT },
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {startIcon && (
          <Box sx={{ color: MUTED, display: "flex", flexShrink: 0 }}>
            {startIcon}
          </Box>
        )}
        <Box
          component="input"
          type={type}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
          disabled={disabled}
          sx={{
            flex: 1,
            bgcolor: "transparent",
            border: "none",
            outline: "none",
            color: TEXT,
            fontSize: "0.9rem",
            py: 1.4,
            fontFamily: "inherit",
            "&::placeholder": { color: "#4a5568" },
            "&:disabled": { cursor: "not-allowed" },
          }}
        />
        {endIcon && (
          <Box sx={{ color: MUTED, display: "flex", flexShrink: 0 }}>
            {endIcon}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hideInitialOverlay();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate("/");
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes("403") || msg.includes("422")) {
        setError("Sai email hoặc mật khẩu. Vui lòng thử lại.");
      } else {
        setError("Không thể kết nối đến máy chủ. Kiểm tra kết nối mạng.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        bgcolor: BG,
        color: TEXT,
        userSelect: "none",
      }}
    >
      {/* Left panel */}
      <Box
        sx={{
          flex: 1,
          display: { xs: "none", sm: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          px: 5,
          background:
            "linear-gradient(150deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles */}
        <Box
          sx={{
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: `${ACCENT}0A`,
            top: -60,
            right: -60,
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `${ACCENT}08`,
            bottom: 40,
            left: -40,
            pointerEvents: "none",
          }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              bgcolor: `${ACCENT}22`,
              border: `1px solid ${ACCENT}44`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldIcon sx={{ fontSize: 26, color: ACCENT }} />
          </Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: 800, color: TEXT, letterSpacing: 0.5 }}
          >
            SENNET VPN
          </Typography>
        </Box>

        <Typography
          variant="h5"
          sx={{ color: TEXT, fontWeight: 700, mb: 1.5, lineHeight: 1.4 }}
        >
          Bảo vệ sự riêng tư
          <br />
          và tự do trực tuyến
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: MUTED, mb: 4, lineHeight: 1.7 }}
        >
          Kết nối bảo mật tốc độ cao, không giới hạn
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {features.map((f) => (
            <Box
              key={f}
              sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
            >
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  bgcolor: `${ACCENT}22`,
                  border: `1px solid ${ACCENT}55`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: ACCENT,
                  }}
                />
              </Box>
              <Typography
                variant="body2"
                sx={{ color: "#a0aec0", lineHeight: 1.4 }}
              >
                {f}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Right panel — form */}
      <Box
        component="form"
        onSubmit={handleLogin}
        sx={{
          width: { xs: "100%", sm: 400 },
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          px: 4,
          bgcolor: CARD,
          borderLeft: `1px solid ${BORDER}`,
        }}
      >
        {/* Mobile logo */}
        <Box
          sx={{
            display: { xs: "flex", sm: "none" },
            alignItems: "center",
            gap: 1,
            mb: 4,
          }}
        >
          <ShieldIcon sx={{ fontSize: 28, color: ACCENT }} />
          <Typography sx={{ fontWeight: 700, color: TEXT, fontSize: "1.1rem" }}>
            SENNET VPN
          </Typography>
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, color: TEXT }}>
          Đăng nhập
        </Typography>
        <Typography variant="body2" sx={{ color: MUTED, mb: 4 }}>
          Nhập thông tin tài khoản SENNET VPN
        </Typography>

        {error && (
          <Box
            sx={{
              mb: 2.5,
              px: 2,
              py: 1.5,
              borderRadius: 2,
              bgcolor: "#2d0f0f",
              border: "1px solid #f8514966",
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            <Typography
              sx={{ color: "#f85149", fontSize: "0.85rem", lineHeight: 1.5 }}
            >
              {error}
            </Typography>
          </Box>
        )}

        <DarkInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          disabled={loading}
          startIcon={<EmailOutlinedIcon sx={{ fontSize: 18 }} />}
        />

        <DarkInput
          label="Mật khẩu"
          type={showPw ? "text" : "password"}
          value={password}
          onChange={setPassword}
          disabled={loading}
          startIcon={<LockOutlinedIcon sx={{ fontSize: 18 }} />}
          endIcon={
            <IconButton
              onClick={() => setShowPw((p) => !p)}
              size="small"
              sx={{ p: 0.5, color: MUTED, "&:hover": { color: TEXT } }}
            >
              {showPw ? (
                <VisibilityOffIcon sx={{ fontSize: 18 }} />
              ) : (
                <VisibilityIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          }
        />

        <Box sx={{ mb: 3 }} />

        <Button
          type="submit"
          variant="contained"
          disabled={loading || !email || !password}
          fullWidth
          sx={{
            py: 1.5,
            bgcolor: ACCENT,
            fontWeight: 700,
            fontSize: "0.95rem",
            textTransform: "none",
            borderRadius: 2,
            boxShadow: `0 4px 14px ${ACCENT}44`,
            "&:hover": {
              bgcolor: "#1d4ed8",
              boxShadow: `0 4px 20px ${ACCENT}66`,
            },
            "&:disabled": { bgcolor: "#1e3058", color: "#4a6fa5" },
          }}
        >
          {loading ? (
            <CircularProgress size={22} color="inherit" />
          ) : (
            "Đăng nhập"
          )}
        </Button>
      </Box>
    </Box>
  );
}
