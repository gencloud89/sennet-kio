import getSystem from "@/utils/get-system";
const OS = getSystem();

// SENNET VPN dark navy theme
export const defaultTheme = {
  primary_color: "#2563EB",
  secondary_color: "#3B82F6",
  primary_text: "#F0F6FC",
  secondary_text: "#8B949E",
  info_color: "#2563EB",
  error_color: "#F85149",
  warning_color: "#E3B341",
  success_color: "#3FB950",
  background_color: "#0D1117",
  font_family: `-apple-system, BlinkMacSystemFont,"Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
    OS === "windows" ? ", twemoji mozilla" : ""
  }`,
};

// dark mode (same palette — app is always dark)
export const defaultDarkTheme = {
  ...defaultTheme,
  primary_color: "#2563EB",
  secondary_color: "#3B82F6",
  primary_text: "#F0F6FC",
  background_color: "#0D1117",
  secondary_text: "#8B949E",
  info_color: "#2563EB",
  error_color: "#F85149",
  warning_color: "#E3B341",
  success_color: "#3FB950",
};
