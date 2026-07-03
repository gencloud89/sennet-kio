use super::CmdResult;
use crate::{
    config::{Config, IVerge, PrfItem, PrfOption, profiles::profiles_delete_item_safe},
    config::profiles::profiles_append_item_safe,
    core::handle,
    feat,
    feat::v2board::{UserInfo, V2BoardClient, V2BoardError},
};
use clash_verge_logging::{Type, logging};
use serde::Serialize;
use smartstring::alias::String;
use std::collections::HashMap;
use tauri::Emitter as _;

#[derive(Debug, Clone, Serialize)]
pub struct UserInfoDto {
    pub email: std::string::String,
    pub expired_at: Option<i64>,
    pub upload: i64,
    pub download: i64,
    pub total: i64,
    pub plan_name: std::string::String,
    pub reset_day: Option<i32>,
}

impl From<UserInfo> for UserInfoDto {
    fn from(u: UserInfo) -> Self {
        Self {
            email: u.email,
            expired_at: u.expired_at,
            upload: u.upload,
            download: u.download,
            total: u.total,
            plan_name: u.plan_name,
            reset_day: u.reset_day,
        }
    }
}

const SENNET_PROFILE_DESC: &str = "sennet_managed";

async fn get_saved_token() -> Option<std::string::String> {
    let verge = Config::verge().await;
    let data = verge.data_arc();
    data.auth_token
        .as_ref()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

async fn clear_saved_token() {
    Config::verge().await.edit_draft(|d| {
        d.auth_token = None;
    });
    Config::verge().await.apply();
    let data = Config::verge().await.data_arc();
    let _ = data.save_file().await;
}

#[tauri::command]
pub async fn login_v2board(
    email: std::string::String,
    password: std::string::String,
) -> CmdResult {
    logging!(info, Type::Config, "SENNET: login attempt for {}", email);

    let result = V2BoardClient::login(&email, &password)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("Network") || msg.contains("timeout") || msg.contains("connect") {
                format!("Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng hoặc thử lại sau. ({msg})")
            } else {
                msg
            }
        })?;

    let patch = IVerge {
        auth_token: Some(String::from(result.auth_data.as_str())),
        auth_email: Some(String::from(email.as_str())),
        ..Default::default()
    };
    feat::patch_verge(&patch, false)
        .await
        .map_err(|e| e.to_string())?;

    logging!(info, Type::Config, "SENNET: token saved, syncing subscription");

    if let Err(e) = sync_subscription(&result.auth_data).await {
        logging!(error, Type::Config, "SENNET: subscription sync FAILED: {}", e);
        return Err(format!("Login OK but failed to load servers: {e}").into());
    }

    // Activate the newly synced profile SYNCHRONOUSLY.
    // Previously this was spawned with an 800ms delay, which caused:
    // 1. Race with ensure_subscription on startup (CURRENT_SWITCHING_PROFILE guard)
    // 2. Frontend navigating to proxies page before profile was activated
    // 3. Silent failures when activation returned Busy/Skipped
    if let Some(uid) = find_managed_profile_uid().await {
        logging!(info, Type::Config, "SENNET: activating profile {} synchronously", uid);
        let outcome = feat::toggle_proxy_profile(&uid).await;
        logging!(info, Type::Config, "SENNET: profile activation outcome: {:?}", outcome);
        // Wait for kernel to reload config
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
        logging!(info, Type::Config, "SENNET: running auto_select_best_node");
        auto_select_best_node().await;
    }

    Ok(())
}

#[tauri::command]
pub async fn logout() -> CmdResult {
    logging!(info, Type::Config, "SENNET: logout");

    let managed_uid = find_managed_profile_uid().await;
    if let Some(uid) = managed_uid {
        let _ = profiles_delete_item_safe(&uid).await;
    }

    Config::verge().await.edit_draft(|d| {
        d.auth_token = None;
        d.auth_email = None;
    });
    Config::verge().await.apply();
    let data = Config::verge().await.data_arc();
    let _ = data.save_file().await;

    Ok(())
}

#[tauri::command]
pub async fn get_user_info() -> CmdResult<UserInfoDto> {
    let token = get_saved_token()
        .await
        .ok_or_else(|| String::from("Not logged in"))?;

    match V2BoardClient::get_user_info(&token).await {
        Ok(info) => Ok(UserInfoDto::from(info)),
        Err(V2BoardError::NetworkError(e)) => {
            logging!(info, Type::Config, "SENNET: cannot fetch user info ({}), panel unreachable", e);
            Err(format!("Không thể kết nối máy chủ. Dữ liệu hiển thị có thể không mới nhất. ({e})").into())
        }
        Err(e) => Err(e.to_string().into()),
    }
}

/// Ensures the subscription profile is loaded. Called on startup.
/// Syncs subscription in background if the user is logged in.
#[tauri::command]
pub async fn ensure_subscription() -> CmdResult {
    let token = match get_saved_token().await {
        Some(t) => t,
        None => return Ok(()), // not logged in
    };

    let managed_uid = find_managed_profile_uid().await;

    if let Some(uid) = managed_uid {
        // Check if already the current active profile — avoid unnecessary Clash reload
        let is_current = {
            let profiles = Config::profiles().await;
            let data = profiles.data_arc();
            data.get_current()
                .map(|c| c.as_str() == uid.as_str())
                .unwrap_or(false)
        };

        if is_current {
            // Profile already active — just restore the auto-select node
            logging!(info, Type::Config, "SENNET: profile already active, restoring auto-select");
            tokio::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_millis(1200)).await;
                auto_select_best_node().await;
            });
        } else {
            // Profile exists but not active — activate it
            logging!(info, Type::Config, "SENNET: activating existing profile on startup");
            tokio::spawn(async move {
                let _ = feat::toggle_proxy_profile(&uid).await;
                tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
                auto_select_best_node().await;
            });
        }
        return Ok(());
    }

    // No profile yet — try to sync subscription in background.
    // If panel is unreachable and there's no cached profile, the user
    // will need to connect from a working network at least once.
    logging!(info, Type::Config, "SENNET: no profile found, attempting background sync");
    tokio::spawn(async move {
        match sync_subscription(&token).await {
            Ok(()) => {
                logging!(info, Type::Config, "SENNET: background sync succeeded");
            }
            Err(e) => {
                logging!(warn, Type::Config, "SENNET: background sync FAILED — {} (offline or panel unreachable)", e);
                let _ = handle::Handle::app_handle().emit("verge://notice-message", (
                    "sync_failed",
                    "Không thể tải cấu hình từ máy chủ. Đang dùng dữ liệu đã lưu (nếu có)."
                ));
            }
        }
    });

    Ok(())
}

/// Returns true if a valid local token exists.
/// On network error (offline/GFW), trusts the local token.
/// On HTTP 403, clears token and returns false.
#[tauri::command]
pub async fn check_auth() -> CmdResult<bool> {
    let token = match get_saved_token().await {
        Some(t) => t,
        None => return Ok(false),
    };

    match V2BoardClient::get_user_info(&token).await {
        Ok(_) => Ok(true),
        Err(V2BoardError::Unauthorized) => {
            logging!(info, Type::Config, "SENNET: token expired (403), clearing");
            clear_saved_token().await;
            Ok(false)
        }
        Err(V2BoardError::NetworkError(e)) => {
            logging!(info, Type::Config, "SENNET: panel unreachable ({}), trusting cached token — offline mode", e);
            Ok(true)
        }
        Err(e) => {
            logging!(warn, Type::Config, "SENNET: check_auth error ({}), trusting cached token", e);
            Ok(true)
        }
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const DELAY_TEST_TIMEOUT: u32 = 5000;
const GROUP_NAMES: &[&str] = &["SENVIET", "Proxy", "节点选择", "代理选择"];
const SKIP_NODES: &[&str] = &["DIRECT", "REJECT", "REJECT-DROP", "PASS", "GLOBAL", "自动选择", "Auto", "故障转移"];

/// Delay test URLs in priority order.
/// Google gstatic.com is fast but blocked in China.
/// The China-friendly URLs work behind GFW.
const DELAY_TEST_URLS: &[&str] = &[
    "http://www.gstatic.com/generate_204",   // Google (fast, global)
    "http://cp.cloud.360.cn/generate_204",    // 360 (China CDN)
    "http://connect.rom.miui.com/generate_204", // Xiaomi (China)
    "http://www.baidu.com",                   // Baidu (always works in China)
];

fn is_info_node(name: &str) -> bool {
    if name.is_empty() { return true; }
    if name.starts_with("Reset") || name.starts_with("reset") { return true; }
    const INFO_PREFIXES: &[&str] = &["👤", "📝", "📨", "⏳"];
    INFO_PREFIXES.iter().any(|p| name.starts_with(p))
}

/// Run delay test with fallback URLs for China compatibility.
/// Tries each URL in order until one succeeds.
async fn run_delay_test(group_name: &str) -> Result<HashMap<std::string::String, u32>, std::string::String> {
    for (idx, url) in DELAY_TEST_URLS.iter().enumerate() {
        logging!(info, Type::Config, "SENNET: delay test attempt #{idx} url='{url}'");
        let mihomo = handle::Handle::mihomo().await;
        match mihomo.delay_group(group_name, url, DELAY_TEST_TIMEOUT).await {
            Ok(results) if !results.is_empty() => {
                logging!(info, Type::Config, "SENNET: delay test OK — url='{url}' nodes={}", results.len());
                return Ok(results);
            }
            Ok(_) => {
                logging!(warn, Type::Config, "SENNET: delay test returned empty — url='{url}' may be blocked");
            }
            Err(e) => {
                logging!(warn, Type::Config, "SENNET: delay test failed — url='{url}' error={:?}", e);
            }
        }
    }
    Err("All delay test URLs failed (network may be restricted)".to_string())
}

/// Auto-select the best proxy node based on actual latency.
/// Runs a delay test on all nodes in the main selector group,
/// then picks the one with the lowest ping.
/// Uses China-friendly fallback URLs if Google is blocked.
async fn auto_select_best_node() {
    logging!(info, Type::Config, "SENNET: auto_select_best_node — finding main group");

    // First find the main group name from the kernel's proxy data
    let mihomo = handle::Handle::mihomo().await;
    let proxies = match mihomo.get_proxies().await {
        Ok(p) => p,
        Err(e) => {
            logging!(error, Type::Config, "SENNET: auto_select — get_proxies failed: {:?}", e);
            let _ = handle::Handle::app_handle().emit("verge://refresh-proxy-config", ());
            return;
        }
    };
    drop(mihomo);

    // Find the first matching selector group
    let group_name = GROUP_NAMES.iter().find_map(|gn| {
        proxies.proxies.values().find(|p| {
            p.name == *gn && p.all.is_some()
        }).map(|_| *gn)
    });

    let group_name = match group_name {
        Some(name) => name.to_string(),
        None => {
            logging!(info, Type::Config, "SENNET: auto_select — no matching group found");
            let _ = handle::Handle::app_handle().emit("verge://refresh-proxy-config", ());
            return;
        }
    };

    logging!(info, Type::Config, "SENNET: auto_select — running delay test on group '{}'", group_name);

    // Run delay test with China-friendly fallback
    let results = match run_delay_test(&group_name).await {
        Ok(r) => r,
        Err(e) => {
            logging!(error, Type::Config, "SENNET: auto_select — {}", e);
            let _ = handle::Handle::app_handle().emit("verge://refresh-proxy-config", ());
            return;
        }
    };

    // Filter out info nodes and skip nodes, then find the fastest
    let best = results.iter()
        .filter(|(name, _)| !is_info_node(name) && !SKIP_NODES.contains(&name.as_ref()))
        .min_by_key(|(_, delay)| *delay);

    match best {
        Some((node_name, delay)) => {
            logging!(info, Type::Config, "SENNET: auto_select — best node '{}' with {}ms delay", node_name, delay);
            feat::switch_proxy_node(&group_name, node_name).await;
        }
        None => {
            logging!(warn, Type::Config, "SENNET: auto_select — no nodes passed delay test, falling back to auto group");
            let auto_names = ["自动选择", "Auto", "auto"];
            for auto_name in &auto_names {
                let mihomo = handle::Handle::mihomo().await;
                if mihomo.select_node_for_group(&group_name, auto_name).await.is_ok() {
                    logging!(info, Type::Config, "SENNET: auto_select — selected fallback '{}'", auto_name);
                    let _ = handle::Handle::app_handle().emit("verge://refresh-proxy-config", ());
                    return;
                }
            }
            let _ = handle::Handle::app_handle().emit("verge://refresh-proxy-config", ());
        }
    }
}

async fn find_managed_profile_uid() -> Option<String> {
    let profiles = Config::profiles().await;
    let data = profiles.data_arc();
    data.items.as_ref().and_then(|items| {
        items
            .iter()
            .find(|i| i.desc.as_deref() == Some(SENNET_PROFILE_DESC))
            .and_then(|i| i.uid.clone())
    })
}

/// Fetch subscription URL and upsert the managed profile.
/// Called after login and by the background refresh timer.
pub async fn sync_subscription(auth_data: &str) -> Result<(), std::string::String> {
    logging!(info, Type::Config, "SENNET: sync_subscription started");

    let subscribe_url = V2BoardClient::get_subscribe_url(auth_data)
        .await
        .map_err(|e| {
            logging!(error, Type::Config, "SENNET: get_subscribe_url failed: {}", e);
            e.to_string()
        })?;
    logging!(info, Type::Config, "SENNET: subscribe_url obtained");

    // Use the original subscribe URL directly — skip resolve_subscribe_url.
    // resolve_subscribe_url performs a redundant GET request that downloads
    // and discards the full clash config just to verify the URL. The V2Board
    // subscribe URL already embeds the auth token, so the extra request is
    // wasteful and can cause issues with rate-limited endpoints.
    let option = PrfOption {
        user_agent: Some(String::from("SENNET-VPN/1.0 clash-compatible")),
        update_interval: Some(360),
        allow_auto_update: Some(true), // required by timer gen_map()
        danger_accept_invalid_certs: Some(true), // many subscribe servers use non-standard TLS certs
        ..Default::default()
    };

    logging!(info, Type::Config, "SENNET: downloading subscription from {}", subscribe_url);
    let mut item = PrfItem::from_url(&subscribe_url, None, None, Some(&option))
        .await
        .map_err(|e| {
            logging!(error, Type::Config, "SENNET: PrfItem::from_url failed for {}: {}", subscribe_url, e);
            e.to_string()
        })?;
    logging!(info, Type::Config, "SENNET: subscription downloaded successfully");

    item.name = Some(String::from("SENNET VPN"));
    item.desc = Some(String::from(SENNET_PROFILE_DESC));

    if let Some(uid) = find_managed_profile_uid().await {
        let _ = profiles_delete_item_safe(&uid).await;
    }

    profiles_append_item_safe(&mut item)
        .await
        .map_err(|e| {
            logging!(error, Type::Config, "SENNET: profiles_append_item_safe failed: {}", e);
            e.to_string()
        })?;
    logging!(info, Type::Config, "SENNET: profile saved, uid={:?}", item.uid);
    logging!(info, Type::Config, "SENNET: subscription synced successfully (activation handled by caller)");
    Ok(())
}

/// TCP ping a proxy node by connecting directly to its server:port.
/// Returns latency in milliseconds.
#[tauri::command]
pub async fn tcp_ping_proxy(
    name: std::string::String,
    timeout_ms: u64,
) -> CmdResult<u64> {
    use std::time::Instant;
    use tokio::net::TcpStream;
    use tokio::time::{Duration, timeout};

    // Read server/port from runtime YAML config.
    // The Mihomo REST API /proxies/{name} does NOT expose server/port fields.
    let config = Config::runtime()
        .await
        .latest_arc()
        .config
        .clone()
        .ok_or_else(|| "runtime config not loaded".to_string())?;

    let proxies = config
        .get("proxies")
        .and_then(|v| v.as_sequence())
        .ok_or_else(|| "no proxies in runtime config".to_string())?
        .clone();

    let proxy = proxies
        .iter()
        .find(|p| p.get("name").and_then(|n| n.as_str()) == Some(name.as_str()))
        .ok_or_else(|| format!("proxy '{}' not found in runtime config", name))?
        .clone();

    let host = proxy
        .get("server")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "proxy has no server field".to_string())?
        .to_string();
    let port = proxy
        .get("port")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "proxy has no port field".to_string())? as u16;

    let addr = format!("{}:{}", host, port);
    let start = Instant::now();
    timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| "timeout".to_string())?
    .map_err(|e| format!("TCP error: {e}"))?;

    Ok(start.elapsed().as_millis() as u64)
}

/// Debug helper: auto-login from Rust startup.
/// Called from resolve_setup_async with a delay to ensure the kernel is ready.
/// Returns Ok(()) on success or an error string.
pub async fn debug_auto_login() -> Result<(), std::string::String> {
    let email = std::env::var("SENNET_DEBUG_EMAIL").unwrap_or_default();
    let password = std::env::var("SENNET_DEBUG_PASSWORD").unwrap_or_default();
    if email.is_empty() || password.is_empty() {
        return Err("SENNET_DEBUG_EMAIL and SENNET_DEBUG_PASSWORD env vars not set".into());
    }

    logging!(info, Type::Config, "SENNET-DEBUG: auto-login with {}", email);

    let result = V2BoardClient::login(&email, &password)
        .await
        .map_err(|e| format!("Login failed: {e}"))?;

    let patch = IVerge {
        auth_token: Some(String::from(result.auth_data.as_str())),
        auth_email: Some(String::from(email.as_str())),
        ..Default::default()
    };
    feat::patch_verge(&patch, false)
        .await
        .map_err(|e| format!("Save token failed: {e}"))?;

    sync_subscription(&result.auth_data).await?;

    // Activate the profile synchronously
    if let Some(uid) = find_managed_profile_uid().await {
        logging!(info, Type::Config, "SENNET-DEBUG: activating profile {}", uid);
        let outcome = feat::toggle_proxy_profile(&uid).await;
        logging!(info, Type::Config, "SENNET-DEBUG: activation outcome: {:?}", outcome);
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
        auto_select_best_node().await;
    }

    let _ = handle::Handle::app_handle().emit("verge://refresh-proxy-config", ());
    logging!(info, Type::Config, "SENNET: auto-login complete");

    Ok(())
}
