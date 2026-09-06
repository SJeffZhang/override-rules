import type { DnsConfig, SnifferConfig } from "./types";

/**
 * 默认的 fake-ip 过滤域名列表。
 * 这些域名不会被 fake-ip 机制代理。
 */
const FAKE_IP_FILTER = [
    "geosite:private",
    "geosite:connectivity-check",
    "Mijia Cloud",
    "dig.io.mi.com",
    "localhost.ptlogin2.qq.com",
    "*.icloud.com",
    "*.stun.*.*",
    "*.stun.*.*.*",
];

const WECHAT_DNS_POLICY_DOMAINS = [
    "+.wechat.com",
    "+.weixin.com",
    "+.weixin.qq.com",
    "+.wx.qq.com",
    "+.wximg.qq.com",
    "+.mmbiz.qpic.cn",
    "+.mmsns.qpic.cn",
];

/**
 * 嗅探器配置。
 */
export const snifferConfig: SnifferConfig = {
    sniff: {
        TLS: {
            ports: [443, 8443],
        },
        HTTP: {
            ports: [80, 8080, 8880],
        },
        QUIC: {
            ports: [443, 8443],
        },
    },
    "override-destination": false,
    enable: true,
    "force-dns-mapping": true,
    "skip-domain": ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"],
};

/**
 * 构建 DNS 配置的输入参数类型。
 */
interface BuildDnsConfigInput {
    existingDns?: DnsConfig;
    fakeIpFilter?: string[];
    campusDnsServers?: string[];
}

/**
 * 构建 Clash DNS 配置对象。
 * @param {BuildDnsConfigInput} params - 构建参数
 * @param {DnsConfig=} params.existingDns - 输入配置中已有的 DNS 配置，用于保留 fake-ip 相关业务设置
 * @param {string[]=} params.fakeIpFilter - fake-ip 过滤域名列表（可选）
 * @param {string[]=} params.campusDnsServers - 校园网 DHCP DNS，用于微信相关域名 nameserver-policy
 * @returns {DnsConfig} DNS 配置对象
 */
function buildDnsConfig({
    existingDns,
    fakeIpFilter,
    campusDnsServers = [],
}: BuildDnsConfigInput): DnsConfig {
    const config: DnsConfig = {
        enable: true,
        ipv6: false,
        "prefer-h3": false,
        "enhanced-mode": "fake-ip",
        "use-hosts": true,
        "use-system-hosts": false,
        "default-nameserver": ["223.5.5.5"],
        nameserver: ["https://dns.alidns.com/dns-query"],
        "proxy-server-nameserver": ["https://dns.alidns.com/dns-query"],
    };

    if (campusDnsServers.length > 0) {
        config["nameserver-policy"] = Object.fromEntries(
            WECHAT_DNS_POLICY_DOMAINS.map((domain) => [domain, campusDnsServers])
        );
    }

    if (existingDns?.["fake-ip-range"]) {
        config["fake-ip-range"] = existingDns["fake-ip-range"];
    }

    const preservedFakeIpFilter = existingDns?.["fake-ip-filter"] ?? fakeIpFilter;
    if (preservedFakeIpFilter) {
        config["fake-ip-filter"] = preservedFakeIpFilter;
    }

    return config;
}

/**
 * 构建 DNS 配置的输入参数类型（外部接口）。
 */
export interface BuildDnsInput {
    fakeIPEnabled: boolean;
    ipv6Enabled: boolean;
    existingDns?: DnsConfig;
    campusDnsServers?: string[];
}

/**
 * 根据 fakeIP 和 IPv6 开关生成最终 DNS 配置。
 * @param {BuildDnsInput} params - 构建参数
 * @param {boolean} params.fakeIPEnabled - 兼容旧参数；校园网 DNS 固化后始终输出 fake-ip
 * @param {boolean} params.ipv6Enabled - 兼容旧参数；校园网 DNS 固化后 DNS 层始终关闭 IPv6
 * @param {DnsConfig=} params.existingDns - 输入配置中已有 DNS 配置
 * @param {string[]=} params.campusDnsServers - 校园网 DHCP DNS，用于微信相关域名 nameserver-policy
 * @returns {DnsConfig} DNS 配置对象
 */
export function buildDns({
    fakeIPEnabled,
    ipv6Enabled,
    existingDns,
    campusDnsServers,
}: BuildDnsInput): DnsConfig {
    void fakeIPEnabled;
    void ipv6Enabled;
    return buildDnsConfig({ existingDns, fakeIpFilter: FAKE_IP_FILTER, campusDnsServers });
}
