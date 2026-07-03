# SENNET VPN

Ứng dụng VPN desktop đa nền tảng dành cho hệ thống **V2Board**, hỗ trợ Windows, macOS và Linux.

## Tính năng chính

- **Đăng nhập V2Board** — Tự động tải và kích hoạt cấu hình VPN từ panel V2Board
- **Tự động chọn máy chủ tốt nhất** — Ping test tất cả máy chủ, chọn máy có độ trễ thấp nhất
- **Hỗ trợ Trung Quốc** — Hệ thống domain mirror dự phòng, tự động fallback khi bị chặn
- **Offline Mode** — Dùng token và cấu hình đã cache khi không kết nối được panel
- **Bảo mật** — Token JWT được mã hóa AES-256-GCM lưu trữ cục bộ
- **Giao diện tiếng Việt** — Menu và điều hướng bằng tiếng Việt

## Cài đặt cho nhà phát triển

### Yêu cầu

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/) 1.80+
- [pnpm](https://pnpm.io/) 9+
- Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)

### Cài đặt và chạy

```bash
# Cài dependencies
pnpm install

# Tải mihomo core (bắt buộc trước khi build/dev)
pnpm prebuild

# Chạy development
pnpm dev

# Build nhanh (để test)
pnpm build:fast

# Build production
pnpm build
```

## Cấu hình V2Board

### 1. Cấu hình domain panel

Sửa file `src-tauri/src/feat/v2board.rs`:

```rust
const BASE_URL: &str = "https://panel-cua-ban.com";
const DEFAULT_SUBSCRIBE_DOMAIN: &str = "sub-cua-ban.com";
```

### 2. Cấu hình domain dự phòng (Mirror)

Upload file `domain-backup-config.json` lên thư mục `public/` của panel V2Board:

```json
{
  "panel_domains": [
    "https://panel-cua-ban.com",
    "https://panel-mirror-1.com",
    "https://panel-mirror-2.com"
  ],
  "subscribe_domains": [
    "sub-cua-ban.com",
    "sub-mirror-1.com",
    "sub-mirror-2.com"
  ],
  "oss_domains": []
}
```

App sẽ tự động tải file này mỗi lần khởi động để cập nhật danh sách domain — **không cần build lại app**.

### 3. Thiết lập Reverse Proxy Mirror (cho người dùng Trung Quốc)

Trên VPS Hong Kong, cấu hình nginx reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name panel-mirror-1.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass https://panel-cua-ban.com;
        proxy_ssl_server_name on;
        proxy_set_header Host panel-cua-ban.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
    }
}
```

### 4. Cấu hình tự động chọn máy chủ

File `src-tauri/src/cmd/auth.rs` chứa hàm `auto_select_best_node()` — tự động ping test và chọn máy chủ có latency thấp nhất khi đăng nhập.

Delay test URLs có thể cấu hình tại constant `DELAY_TEST_URLS` — hỗ trợ tự động fallback cho mạng Trung Quốc.

## Build

```bash
# Windows portable
pnpm build:fast
# Output: target/fast-release/sennet-vpn.exe

# Windows installer (NSIS)
pnpm build
# Output: target/release/bundle/nsis/SENNET VPN_x.x.x_x64-setup.exe
```

## Công nghệ sử dụng

- [Tauri 2](https://v2.tauri.app/) — Framework desktop Rust + WebView
- [React 19](https://react.dev/) — Giao diện người dùng
- [Mihomo](https://github.com/MetaCubeX/mihomo) — Kernel proxy
- [V2Board](https://github.com/v2board/v2board) — Hệ thống quản lý VPN

## License

GPL-3.0-only
