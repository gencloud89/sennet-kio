# CLAUDE.md — SENNET VPN

Project: Ứng dụng VPN desktop Tauri 2 dành cho V2Board panel.
Target: Windows x64, macOS ARM64 (M1-M4), macOS Intel.

## ⚠️ CRITICAL — ĐỌC TRƯỚC KHI LÀM GÌ

1. **KHÔNG XÓA FILE** khi chưa được phép.
2. **Code production-ready** — không stub, không half-done.
3. **Verify sau mỗi thay đổi** — build + test.
4. **Không đụng vào server V2Board** — chỉ tham khảo.

## Repo GitHub

| Repo | Mục đích | Visibility |
|------|----------|:---:|
| `gencloud89/sennet-new2026` | Bản generic cho mọi V2Board panel | Private |
| `gencloud89/sennet-kio` | Bản thương mại cho kio.senviet.us | Public |

### CI/CD

- Workflow: `.github/workflows/build-all-platforms.yml`
- Trigger: push lên `main`
- Secret cần: `RELEASE_TOKEN` (PAT với scope `repo`, `workflow`)
- PassRule patch: CI tự động patch `tauri-plugin-mihomo` models.rs trước build
- macOS ad-hoc sign: `codesign --force --deep --sign -` sau build

## Build commands

```bash
pnpm install
pnpm prebuild              # Tải mihomo core
pnpm build:fast            # Build nhanh (debug, target/fast-release/)
pnpm build                 # Build production (target/release/)

# Cần NASM cho Windows x86:
# Cài từ https://www.nasm.us/

# PassRule fix: TRƯỚC khi build, patch file:
# ~/.cargo/git/checkouts/tauri-plugin-mihomo-*/<hash>/src/models.rs
# Thêm `PassRule,` vào cuối enum ProxyType (trước dấu `}`)
```

## Cấu trúc project (Sennet-specific)

### File quan trọng đã sửa:

| File | Chức năng |
|------|-----------|
| `src-tauri/src/feat/v2board.rs` | V2Board API client, domain config, proxy fallback |
| `src-tauri/src/cmd/auth.rs` | Login, sync subscription, auto_select_best_node, check_auth |
| `src-tauri/src/cmd/profile.rs` | Profile activation, handle_success events |
| `src-tauri/src/feat/profile.rs` | toggle_proxy_profile, switch_proxy_node |
| `src-tauri/src/utils/init.rs` | DNS config (China-friendly), domain-backup-config init |
| `src-tauri/src/utils/resolve/mod.rs` | Startup flow, remove debug auto-login |
| `src-tauri/resources/domain-backup-config.json` | Domain mirror list (bundled) |
| `src-tauri/entitlements.plist` | macOS entitlements |
| `src/providers/app-data-provider.tsx` | staleTime=0, separated throttle |
| `src/providers/auth-provider.tsx` | queryClient.invalidateQueries after login |
| `src/pages/proxies.tsx` | China-friendly delay URLs, useEffect refreshProxy |
| `.github/workflows/build-all-platforms.yml` | CI/CD build tất cả platform |

### Kiến trúc auth flow:

```
Login → V2BoardClient::login() → lấy JWT → lưu AES-256-GCM vào verge.yaml
     → get_subscribe_url() → tải clash config YAML
     → PrfItem::from_url() → validate YAML (cần proxies hoặc proxy-providers)
     → profiles_append_item_safe() → lưu vào profiles.yaml
     → toggle_proxy_profile() → Config::generate() → enhance pipeline
     → apply_config() → mihomo kernel reload
     → auto_select_best_node() → delay test → chọn server nhanh nhất
```

### Domain mirror system:

```
resolve_domain_config():
  1. Fetch domain-backup-config.json từ server (qua panel domains)
  2. Nếu fail → dùng cached version từ ổ đĩa
  3. Nếu không có cache → dùng bundled version trong app
  4. Nếu không có bundled → dùng hardcoded defaults
```

### PassRule fix:

Mihomo kernel có proxy type `PassRule` không có trong enum `ProxyType` của `tauri-plugin-mihomo`.
→ `get_proxies()` fail → frontend không thấy servers.
→ Fix: thêm `PassRule` vào enum trong `models.rs` của plugin.

### Domain list (kio.senviet.us):

Panel: `kio.senviet.us`, `mirrorhk1-6.scdh2268.com`
Subscribe: `venom.cdy.892.htd892.com`, `submirror1-6.scdh2268.com`
Mirror server: 47.239.195.222 (Alibaba Cloud HK)
Nginx configs: `/www/server/panel/vhost/nginx/mirrorhk-panel.conf`, `mirrorhk-sub.conf`

### Offline mode:

- check_auth(): NetworkError → trust cached token
- ensure_subscription(): Không sync được → dùng profile đã cache
- Token JWT hạn 30 ngày → user chỉ cần login 1 lần/tháng

### China-compatible:

- Delay test URLs: gstatic.com → 360.cn → miui.com → baidu.com
- DNS: 223.5.5.5, 119.29.29.29 (không dùng 8.8.8.8)
- Browser blocking trên mirror: check `$http_user_agent`, `$http_sec_fetch_mode`
