use clash_verge_logging::{Type, logging};
use crate::utils::dirs;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const BASE_URL: &str = "https://kio.senviet.us";
const DEFAULT_SUBSCRIBE_DOMAIN: &str = "venom.cdy.892.htd892.com";
const DOMAIN_CONFIG_PATH: &str = "/domain-backup-config.json";
const USER_AGENT: &str = "SENNET-VPN/1.0 clash-compatible";
const TIMEOUT_SECS: u64 = 10;

#[derive(Debug)]
pub enum V2BoardError {
    Unauthorized,
    NetworkError(String),
    ParseError(String),
}

impl std::fmt::Display for V2BoardError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized => write!(f, "Token expired or invalid (HTTP 403)"),
            Self::NetworkError(s) => write!(f, "Network error: {s}"),
            Self::ParseError(s) => write!(f, "Parse error: {s}"),
        }
    }
}

impl std::error::Error for V2BoardError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResult {
    pub auth_data: std::string::String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub email: std::string::String,
    pub expired_at: Option<i64>,
    pub upload: i64,
    pub download: i64,
    pub total: i64,
    pub plan_name: std::string::String,
    pub reset_day: Option<i32>,
}

#[derive(Deserialize)]
struct LoginResponseData {
    auth_data: std::string::String,
}

#[derive(Deserialize)]
struct LoginResponse {
    data: LoginResponseData,
}

#[derive(Deserialize)]
struct SubscribePlan {
    name: Option<std::string::String>,
}

#[derive(Deserialize)]
struct SubscribeData {
    email: std::string::String,
    expired_at: Option<i64>,
    u: Option<i64>,
    d: Option<i64>,
    transfer_enable: Option<i64>,
    subscribe_url: std::string::String,
    plan: Option<SubscribePlan>,
    reset_day: Option<i32>,
}

#[derive(Deserialize)]
struct SubscribeResponse {
    data: SubscribeData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemoteDomainConfig {
    panel_domains: Option<Vec<std::string::String>>,
    subscribe_domains: Option<Vec<std::string::String>>,
    oss_domains: Option<Vec<std::string::String>>,
}

#[derive(Debug, Clone)]
struct DomainConfig {
    panel_domains: Vec<std::string::String>,
    subscribe_domains: Vec<std::string::String>,
    oss_domains: Vec<std::string::String>,
}

impl Default for DomainConfig {
    fn default() -> Self {
        Self {
            panel_domains: vec![
                BASE_URL.to_string(),
                "https://mirrorhk1.scdh2268.com".to_string(),
                "https://mirrorhk2.scdh2268.com".to_string(),
                "https://mirrorhk3.scdh2268.com".to_string(),
                "https://mirrorhk4.scdh2268.com".to_string(),
                "https://mirrorhk5.scdh2268.com".to_string(),
                "https://mirrorhk6.scdh2268.com".to_string(),
            ],
            subscribe_domains: vec![
                DEFAULT_SUBSCRIBE_DOMAIN.to_string(),
                "submirror1.scdh2268.com".to_string(),
                "submirror2.scdh2268.com".to_string(),
                "submirror3.scdh2268.com".to_string(),
                "submirror4.scdh2268.com".to_string(),
                "submirror5.scdh2268.com".to_string(),
                "submirror6.scdh2268.com".to_string(),
            ],
            oss_domains: vec![],
        }
    }
}

impl DomainConfig {
    fn from_remote(remote: RemoteDomainConfig) -> Self {
        let mut config = Self::default();

        config.panel_domains = normalize_domains(remote.panel_domains, true)
            .unwrap_or(config.panel_domains);
        config.subscribe_domains = normalize_domains(remote.subscribe_domains, false)
            .unwrap_or(config.subscribe_domains);
        config.oss_domains = normalize_domains(remote.oss_domains, true).unwrap_or_default();

        config
    }
}

fn build_client() -> Result<Client, V2BoardError> {
    Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| V2BoardError::NetworkError(e.to_string()))
}

/// Build a client that routes through the system proxy.
/// Used as fallback when direct connection fails (e.g. behind GFW).
fn build_proxied_client() -> Result<Client, V2BoardError> {
    use reqwest::Proxy;
    // Try to detect system proxy
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .danger_accept_invalid_certs(true);

    // Use system proxy if available
    if let Ok(sysproxy) = sysproxy::Sysproxy::get_system_proxy() {
        if sysproxy.enable {
            let proxy_url = format!("http://{}:{}", sysproxy.host, sysproxy.port);
            if let Ok(proxy) = Proxy::all(&proxy_url) {
                builder = builder.proxy(proxy);
                logging!(info, Type::Config, "V2Board: using system proxy {}", proxy_url);
            }
        }
    }

    builder.build().map_err(|e| V2BoardError::NetworkError(e.to_string()))
}

/// Try an API call with direct connection first, then with system proxy.
async fn try_with_proxy_fallback<T, F, Fut>(
    operation: &str,
    f: F,
) -> Result<T, V2BoardError>
where
    F: Fn(&Client) -> Fut,
    Fut: std::future::Future<Output = Result<T, V2BoardError>>,
{
    // Try direct connection
    match build_client() {
        Ok(client) => {
            match f(&client).await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    logging!(warn, Type::Config, "V2Board: {operation} direct connection failed: {e}, trying proxy...");
                }
            }
        }
        Err(e) => {
            logging!(warn, Type::Config, "V2Board: failed to build direct client: {e}");
        }
    }

    // Try system proxy
    match build_proxied_client() {
        Ok(client) => f(&client).await,
        Err(_) => {
            // Last attempt: try direct again (network might have recovered)
            let client = build_client()?;
            f(&client).await
        }
    }
}

fn normalize_domains(
    domains: Option<Vec<std::string::String>>,
    require_scheme: bool,
) -> Option<Vec<std::string::String>> {
    let normalized: Vec<std::string::String> = domains?
        .into_iter()
        .filter_map(|domain| {
            let trimmed = domain.trim().trim_end_matches('/').to_string();
            if trimmed.is_empty() {
                return None;
            }

            if require_scheme || trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                    Some(trimmed)
                } else {
                    Some(format!("https://{trimmed}"))
                }
            } else {
                Some(
                    trimmed
                        .trim_start_matches("https://")
                        .trim_start_matches("http://")
                        .to_string(),
                )
            }
        })
        .collect();

    (!normalized.is_empty()).then_some(normalized)
}

fn domain_config_path() -> Option<std::path::PathBuf> {
    dirs::app_home_dir().ok().map(|dir| dir.join("domain-backup-config.json"))
}

/// Load cached config from disk (updated by server fetch).
async fn load_cached_domain_config() -> Option<DomainConfig> {
    let path = domain_config_path()?;
    let text = tokio::fs::read_to_string(path).await.ok()?;
    let remote = serde_json::from_str::<RemoteDomainConfig>(&text).ok()?;
    Some(DomainConfig::from_remote(remote))
}

/// Load bundled config from app resources (shipped with the app).
async fn load_bundled_domain_config() -> Option<DomainConfig> {
    let res_dir = dirs::app_resources_dir().ok()?;
    let path = res_dir.join("domain-backup-config.json");
    let text = tokio::fs::read_to_string(path).await.ok()?;
    let remote = serde_json::from_str::<RemoteDomainConfig>(&text).ok()?;
    logging!(info, Type::Config, "V2Board: using bundled domain config");
    Some(DomainConfig::from_remote(remote))
}

async fn save_domain_config(remote: &RemoteDomainConfig) {
    let Some(path) = domain_config_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    if let Ok(text) = serde_json::to_string_pretty(remote) {
        let _ = tokio::fs::write(path, text).await;
        logging!(info, Type::Config, "V2Board: domain config saved to disk");
    }
}

/// Resolve domain configuration with multiple fallback layers:
/// 1. Try to fetch latest from server (using cached/bundled domains)
/// 2. If server fetch succeeds → save & use it
/// 3. If server fetch fails → use cached version from disk
/// 4. If no cache → use bundled version from app resources
/// 5. If no bundled → use hardcoded defaults
async fn resolve_domain_config(client: &Client) -> DomainConfig {
    let cached = load_cached_domain_config().await;
    let bundled = load_bundled_domain_config().await;

    // Build the list of domains to try for fetching updated config.
    // Merge cached + bundled + hardcoded, preferring cached.
    let seed_config = cached.clone().unwrap_or_else(|| {
        bundled.clone().unwrap_or_default()
    });

    logging!(info, Type::Config, "V2Board: trying to fetch domain config from {} panel domains", seed_config.panel_domains.len());

    // Try to fetch updated config from each known panel domain
    for domain in seed_config
        .panel_domains
        .iter()
        .chain(seed_config.oss_domains.iter())
    {
        let url = format!("{domain}{DOMAIN_CONFIG_PATH}");
        logging!(debug, Type::Config, "V2Board: trying {}", url);
        let Ok(resp) = client.get(&url).send().await else {
            logging!(warn, Type::Config, "V2Board: failed to fetch domain config from {}", url);
            continue;
        };
        if !resp.status().is_success() {
            logging!(warn, Type::Config, "V2Board: domain config fetch HTTP {} from {}", resp.status(), url);
            continue;
        }
        let Ok(text) = resp.text().await else {
            continue;
        };
        let Ok(remote) = serde_json::from_str::<RemoteDomainConfig>(&text) else {
            continue;
        };
        // Success! Save to disk and use it.
        save_domain_config(&remote).await;
        logging!(info, Type::Config, "V2Board: domain config updated from {}", url);
        return DomainConfig::from_remote(remote);
    }

    // Server fetch failed — fall back to cached, then bundled, then defaults.
    if cached.is_some() {
        logging!(info, Type::Config, "V2Board: using cached domain config (server unreachable)");
        return cached.unwrap();
    }
    if bundled.is_some() {
        logging!(info, Type::Config, "V2Board: using bundled domain config (no cache, server unreachable)");
        return bundled.unwrap();
    }
    logging!(warn, Type::Config, "V2Board: falling back to hardcoded defaults");
    DomainConfig::default()
}

#[allow(dead_code)]
fn subscribe_url_candidates(
    subscribe_url: &str,
    config: &DomainConfig,
) -> Vec<std::string::String> {
    let mut urls = vec![subscribe_url.to_string()];
    let Ok(parsed) = Url::parse(subscribe_url) else {
        return urls;
    };

    for domain in &config.subscribe_domains {
        let mut candidate = parsed.clone();
        let host = domain
            .trim()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/');

        if candidate.set_host(Some(host)).is_ok() {
            let value = candidate.to_string();
            if !urls.contains(&value) {
                urls.push(value);
            }
        }
    }

    urls
}

pub struct V2BoardClient;

impl V2BoardClient {
    pub async fn login(email: &str, password: &str) -> Result<LoginResult, V2BoardError> {
        let client = build_client()?;
        let domain_config = resolve_domain_config(&client).await;

        let body = serde_json::json!({ "email": email, "password": password });

        logging!(info, Type::Config, "V2Board login attempt for: {}", email);

        let mut last_error = None;
        for panel_domain in domain_config.panel_domains {
            let url = format!("{panel_domain}/api/v1/passport/auth/login");
            let resp = match client.post(&url).json(&body).send().await {
                Ok(resp) => resp,
                Err(e) => {
                    last_error = Some(V2BoardError::NetworkError(e.to_string()));
                    continue;
                }
            };

            match resp.status() {
                StatusCode::OK => {
                    let text = resp
                        .text()
                        .await
                        .map_err(|e| V2BoardError::NetworkError(e.to_string()))?;

                    let parsed: LoginResponse = serde_json::from_str(&text)
                        .map_err(|e| V2BoardError::ParseError(format!("{e}: {text}")))?;

                    return Ok(LoginResult {
                        auth_data: parsed.data.auth_data,
                    });
                }
                StatusCode::FORBIDDEN => return Err(V2BoardError::Unauthorized),
                status => {
                    last_error = Some(V2BoardError::NetworkError(format!("HTTP {status}")));
                }
            }
        }

        Err(last_error.unwrap_or_else(|| V2BoardError::NetworkError("No panel domain available".into())))
    }

    pub async fn get_subscribe_url(auth_data: &str) -> Result<std::string::String, V2BoardError> {
        let data = Self::fetch_subscribe_data(auth_data).await?;
        Ok(data.subscribe_url)
    }

    pub async fn get_user_info(auth_data: &str) -> Result<UserInfo, V2BoardError> {
        let data = Self::fetch_subscribe_data(auth_data).await?;
        Ok(UserInfo {
            email: data.email,
            expired_at: data.expired_at,
            upload: data.u.unwrap_or(0),
            download: data.d.unwrap_or(0),
            total: data.transfer_enable.unwrap_or(0),
            plan_name: data
                .plan
                .and_then(|p| p.name)
                .unwrap_or_else(|| "Unknown".to_string()),
            reset_day: data.reset_day,
        })
    }

    async fn fetch_subscribe_data(auth_data: &str) -> Result<SubscribeData, V2BoardError> {
        let client = build_client()?;
        let domain_config = resolve_domain_config(&client).await;

        let mut last_error = None;
        for panel_domain in domain_config.panel_domains {
            let url = format!("{panel_domain}/api/v1/user/getSubscribe");
            let resp = match client.get(&url).header("Authorization", auth_data).send().await {
                Ok(resp) => resp,
                Err(e) => {
                    last_error = Some(V2BoardError::NetworkError(e.to_string()));
                    continue;
                }
            };

            match resp.status() {
                StatusCode::OK => {
                    let text = resp
                        .text()
                        .await
                        .map_err(|e| V2BoardError::NetworkError(e.to_string()))?;

                    let parsed: SubscribeResponse = serde_json::from_str(&text)
                        .map_err(|e| V2BoardError::ParseError(format!("{e}: {text}")))?;

                    return Ok(parsed.data);
                }
                StatusCode::FORBIDDEN => {
                    logging!(warn, Type::Config, "V2Board token expired (403)");
                    return Err(V2BoardError::Unauthorized);
                }
                status => {
                    last_error = Some(V2BoardError::NetworkError(format!("HTTP {status}")));
                }
            }
        }

        Err(last_error.unwrap_or_else(|| V2BoardError::NetworkError("No panel domain available".into())))
    }

    #[allow(dead_code)]
    pub async fn resolve_subscribe_url(
        auth_data: &str,
        subscribe_url: &str,
    ) -> Result<std::string::String, V2BoardError> {
        let client = build_client()?;
        let domain_config = resolve_domain_config(&client).await;
        let mut last_error = None;

        for url in subscribe_url_candidates(subscribe_url, &domain_config) {
            let resp = match client
                .get(&url)
                .header("Authorization", auth_data)
                .header("User-Agent", USER_AGENT)
                .send()
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    last_error = Some(V2BoardError::NetworkError(e.to_string()));
                    continue;
                }
            };

            match resp.status() {
                StatusCode::OK => return Ok(url),
                StatusCode::FORBIDDEN => return Err(V2BoardError::Unauthorized),
                status => {
                    last_error = Some(V2BoardError::NetworkError(format!("HTTP {status}")));
                }
            }
        }

        Err(last_error.unwrap_or_else(|| V2BoardError::NetworkError("No subscribe domain available".into())))
    }
}
