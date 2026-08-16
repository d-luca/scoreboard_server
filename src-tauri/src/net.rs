//! LAN address enumeration (tauri-rebuild doc 03 §7).
//!
//! The server binds `0.0.0.0`, so every non-loopback IPv4 interface is a
//! candidate URL for OBS / phones. Loopback and link-local (`169.254/16`)
//! addresses are dropped; typical home/LAN ranges sort first.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct LanAddress {
    /// Interface name, e.g. `eth0` / `Wi-Fi`.
    pub name: String,
    /// Dotted-quad IPv4 address.
    pub address: String,
}

/// Non-loopback, non-link-local IPv4 addresses, best (most LAN-like) first.
pub fn lan_addresses() -> Vec<LanAddress> {
    let mut addresses: Vec<LanAddress> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|interface| {
            let std::net::IpAddr::V4(ip) = interface.addr.ip() else {
                return None;
            };
            if ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() {
                return None;
            }
            Some(LanAddress {
                name: interface.name,
                address: ip.to_string(),
            })
        })
        .collect();
    addresses.sort_by_key(|entry| lan_rank(&entry.address));
    addresses.dedup_by(|a, b| a.address == b.address);
    addresses
}

/// Lower sorts first: private 192.168/10 ranges, then other private/CGNAT,
/// then everything else.
fn lan_rank(address: &str) -> u8 {
    if address.starts_with("192.168.") || address.starts_with("10.") {
        0
    } else if address.starts_with("172.") || address.starts_with("100.") {
        1
    } else {
        2
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lan_rank_orders_home_ranges_first() {
        assert!(lan_rank("192.168.1.20") < lan_rank("172.17.0.2"));
        assert!(lan_rank("10.0.0.5") < lan_rank("203.0.113.9"));
        assert!(lan_rank("172.17.0.2") < lan_rank("203.0.113.9"));
    }

    #[test]
    fn lan_addresses_excludes_loopback_and_link_local() {
        for entry in lan_addresses() {
            assert!(!entry.address.starts_with("127."));
            assert!(!entry.address.starts_with("169.254."));
        }
    }
}
