use super::CmdResult;
use crate::{
    config::{Config, IVerge, PrfItem, PrfOption, profiles::profiles_delete_item_safe},
    config::profiles::profiles_append_item_safe,
    feat,
    feat::v2board::{UserInfo, V2BoardClient, V2BoardError},
};
use clash_verge_logging::{Type, logging};
use serde::Serialize;
use smartstring::alias::String;

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
        .map_err(|e| e.to_string())?;

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
        logging!(warn, Type::Config, "SENNET: subscription sync error: {}", e);
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

    V2BoardClient::get_user_info(&token)
        .await
        .map(UserInfoDto::from)
        .map_err(|e| e.to_string().into())
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
                feat::switch_proxy_node("SENVIET", "自动选择").await;
            });
        } else {
            // Profile exists but not active — activate it
            logging!(info, Type::Config, "SENNET: activating existing profile on startup");
            tokio::spawn(async move {
                feat::toggle_proxy_profile(uid).await;
                tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
                feat::switch_proxy_node("SENVIET", "自动选择").await;
            });
        }
        return Ok(());
    }

    // No profile yet — sync subscription in background
    logging!(info, Type::Config, "SENNET: no profile found, syncing subscription on startup");
    tokio::spawn(async move {
        if let Err(e) = sync_subscription(&token).await {
            logging!(warn, Type::Config, "SENNET: startup sync error: {}", e);
        }
    });

    Ok(())
}

/// Returns true if a valid local token exists.
/// On network error (offline), trusts the local token.
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
            clear_saved_token().await;
            Ok(false)
        }
        Err(V2BoardError::NetworkError(_)) => Ok(true),
        Err(_) => Ok(true),
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

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
    let subscribe_url = V2BoardClient::get_subscribe_url(auth_data)
        .await
        .map_err(|e| e.to_string())?;
    let resolved_subscribe_url = V2BoardClient::resolve_subscribe_url(auth_data, &subscribe_url)
        .await
        .unwrap_or_else(|e| {
            logging!(
                warn,
                Type::Config,
                "SENNET: subscribe domain fallback failed, using original URL: {}",
                e
            );
            subscribe_url.clone()
        });

    let option = PrfOption {
        user_agent: Some(String::from("SENNET-VPN/1.0 clash-compatible")),
        update_interval: Some(360),
        allow_auto_update: Some(true), // required by timer gen_map()
        ..Default::default()
    };

    let mut item = PrfItem::from_url(&resolved_subscribe_url, None, None, Some(&option))
        .await
        .map_err(|e| e.to_string())?;

    item.name = Some(String::from("SENNET VPN"));
    item.desc = Some(String::from(SENNET_PROFILE_DESC));

    if let Some(uid) = find_managed_profile_uid().await {
        let _ = profiles_delete_item_safe(&uid).await;
    }

    profiles_append_item_safe(&mut item)
        .await
        .map_err(|e| e.to_string())?;

    // Activate the newly synced subscription profile and set auto-select as default
    if let Some(uid) = item.uid.as_ref() {
        let uid_clone = uid.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
            feat::toggle_proxy_profile(uid_clone).await;
            // Wait for Clash core to reload config then select auto node
            tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
            feat::switch_proxy_node("SENVIET", "自动选择").await;
            logging!(info, Type::Config, "SENNET: profile activated, auto-select set");
        });
    }

    logging!(info, Type::Config, "SENNET: subscription synced");
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
