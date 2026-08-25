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
    let primary = primary_outbound_ip();
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
    addresses.sort_by_key(|entry| {
        (
            u8::from(is_virtual_adapter(&entry.name)),
            u8::from(primary.as_deref() != Some(entry.address.as_str())),
            lan_rank(&entry.address),
        )
    });
    addresses.dedup_by(|a, b| a.address == b.address);
    addresses
}

/// The IPv4 address of the interface used for the default outbound route,
/// found by connecting a UDP socket to a public address (no traffic is sent).
fn primary_outbound_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let std::net::IpAddr::V4(ip) = socket.local_addr().ok()?.ip() else {
        return None;
    };
    (!ip.is_loopback() && !ip.is_unspecified()).then(|| ip.to_string())
}

/// Virtual adapters (Hyper-V, WSL, Docker, VMware, VirtualBox, …) are never
/// the right pick for phone/OBS URLs, so they sort after physical ones.
fn is_virtual_adapter(name: &str) -> bool {
    let lower = name.to_lowercase();
    [
        "vethernet",
        "hyper-v",
        "wsl",
        "docker",
        "vmware",
        "vmnet",
        "virtualbox",
        "vbox",
        "loopback pseudo",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
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
    fn virtual_adapters_are_detected_by_name() {
        assert!(is_virtual_adapter("vEthernet (Gretel commuter)"));
        assert!(is_virtual_adapter("vEthernet (WSL)"));
        assert!(is_virtual_adapter("VMware Network Adapter VMnet8"));
        assert!(is_virtual_adapter("VirtualBox Host-Only Network"));
        assert!(is_virtual_adapter("Ethernet adapter DockerNAT"));
        assert!(!is_virtual_adapter("Wi-Fi"));
        assert!(!is_virtual_adapter("Ethernet"));
        assert!(!is_virtual_adapter("eth0"));
    }

    #[test]
    fn lan_addresses_excludes_loopback_and_link_local() {
        for entry in lan_addresses() {
            assert!(!entry.address.starts_with("127."));
            assert!(!entry.address.starts_with("169.254."));
        }
    }
}
