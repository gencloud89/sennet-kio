use clash_verge_logging::{Type, logging};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const BASE_URL: &str = "https://kio.senviet.us";
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

fn build_client() -> Result<Client, V2BoardError> {
    Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| V2BoardError::NetworkError(e.to_string()))
}

pub struct V2BoardClient;

impl V2BoardClient {
    pub async fn login(email: &str, password: &str) -> Result<LoginResult, V2BoardError> {
        let client = build_client()?;
        let url = format!("{BASE_URL}/api/v1/passport/auth/login");

        let body = serde_json::json!({ "email": email, "password": password });

        logging!(info, Type::Config, "V2Board login attempt for: {}", email);

        let resp = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| V2BoardError::NetworkError(e.to_string()))?;

        match resp.status() {
            StatusCode::OK => {
                let text = resp
                    .text()
                    .await
                    .map_err(|e| V2BoardError::NetworkError(e.to_string()))?;

                let parsed: LoginResponse = serde_json::from_str(&text)
                    .map_err(|e| V2BoardError::ParseError(format!("{e}: {text}")))?;

                Ok(LoginResult {
                    auth_data: parsed.data.auth_data,
                })
            }
            StatusCode::FORBIDDEN => Err(V2BoardError::Unauthorized),
            status => Err(V2BoardError::NetworkError(format!("HTTP {status}"))),
        }
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
        let url = format!("{BASE_URL}/api/v1/user/getSubscribe");

        let resp = client
            .get(&url)
            .header("Authorization", auth_data)
            .send()
            .await
            .map_err(|e| V2BoardError::NetworkError(e.to_string()))?;

        match resp.status() {
            StatusCode::OK => {
                let text = resp
                    .text()
                    .await
                    .map_err(|e| V2BoardError::NetworkError(e.to_string()))?;

                let parsed: SubscribeResponse = serde_json::from_str(&text)
                    .map_err(|e| V2BoardError::ParseError(format!("{e}: {text}")))?;

                Ok(parsed.data)
            }
            StatusCode::FORBIDDEN => {
                logging!(warn, Type::Config, "V2Board token expired (403)");
                Err(V2BoardError::Unauthorized)
            }
            status => Err(V2BoardError::NetworkError(format!("HTTP {status}"))),
        }
    }
}
