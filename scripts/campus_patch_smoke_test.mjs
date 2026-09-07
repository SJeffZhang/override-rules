import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("convert.min.js", "utf8");

const DIRECT_POLICIES = new Set(["DIRECT", "REJECT", "REJECT-DROP"]);

function proxy(name, server, extra = {}) {
    return {
        name,
        type: "anytls",
        server,
        port: 443,
        password: "redacted-password",
        sni: "example.test",
        udp: true,
        ...extra,
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function withoutServer(node) {
    const copy = { ...node };
    delete copy.server;
    return copy;
}

function runConvert(config, args = {}) {
    const sandbox = {
        $arguments: args,
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: "convert.min.js" });
    assert.equal(typeof sandbox.main, "function");
    return sandbox.main(clone(config));
}

function assertNoForbiddenDns(value) {
    const serialized = JSON.stringify(value);
    assert.equal(serialized.includes("tls://dot.pub"), false);
    assert.equal(serialized.includes("quic://dns0.eu"), false);
    assert.equal(serialized.includes("udp://127.0.0.1:1053"), false);
}

function assertPolicyReferences(config) {
    const proxyNames = new Set(config.proxies.map((item) => item.name));
    const groupNames = new Set(config["proxy-groups"].map((item) => item.name));
    const validPolicies = new Set([...proxyNames, ...groupNames, ...DIRECT_POLICIES]);

    for (const group of config["proxy-groups"]) {
        for (const candidate of group.proxies ?? []) {
            assert.equal(
                validPolicies.has(candidate),
                true,
                `proxy-group ${group.name} references missing policy ${candidate}`
            );
        }
    }

    for (const rule of config.rules) {
        const match = rule.match(/,([^,]+)(?:,no-resolve)?$/);
        if (!match) continue;
        const policy = match[1];
        assert.equal(validPolicies.has(policy), true, `rule references missing policy ${policy}`);
    }
}

const input = {
    hosts: {
        "custom.local": "192.0.2.10",
    },
    dns: {
        enable: false,
        ipv6: true,
        "prefer-h3": true,
        "enhanced-mode": "redir-host",
        "default-nameserver": ["119.29.29.29", "223.5.5.5"],
        nameserver: ["system", "udp://127.0.0.1:1053", "223.5.5.5"],
        fallback: ["quic://dns0.eu", "https://dns.cloudflare.com/dns-query"],
        "fallback-filter": { geoip: true },
        "proxy-server-nameserver": ["https://dns.alidns.com/dns-query", "tls://dot.pub"],
        "fake-ip-filter": ["example.internal"],
        "fake-ip-range": "198.18.0.1/16",
    },
    proxies: [
        proxy("iNetS 美国 高级 01", "inets-us.example", { type: "ss" }),
        proxy("滕王阁 美国 01", "twg-us.example", { type: "ss" }),
        proxy("良心云 美国 01", "liangxinyun-us.example", { type: "ss" }),
        proxy("iNetS 台湾 高级 01", "inets-tw.example", { type: "ss" }),
        proxy("iNetS 新加坡 高级 01", "inets-sg.example", { type: "ss" }),
        proxy("iNetS 日本 高级 01", "inets-jp.example", { type: "ss" }),
        proxy("滕王阁 香港 01", "twg-hk.example", { type: "ss" }),
        proxy("滕王阁 新加坡 01", "twg-sg.example", { type: "ss" }),
        proxy("滕王阁 日本 01", "twg-jp.example", { type: "ss" }),
        proxy("iNetS 香港 实验性 01", "inets-hk-experimental.example", { type: "ss" }),
    ],
};

const before = clone(input.proxies);
const output = clone(runConvert(input, {}));

assert.equal(Object.hasOwn(output, "interface-name"), false);
assert.deepEqual(output.hosts, {
    "custom.local": "192.0.2.10",
    "dns.alidns.com": "223.5.5.5",
});

assert.equal(output.dns.enable, true);
assert.equal(output.dns.ipv6, false);
assert.equal(output.dns["prefer-h3"], false);
assert.equal(output.dns["enhanced-mode"], "fake-ip");
assert.equal(output.dns["use-hosts"], true);
assert.equal(output.dns["use-system-hosts"], false);
assert.deepEqual(output.dns["default-nameserver"], ["223.5.5.5"]);
assert.deepEqual(output.dns.nameserver, ["https://dns.alidns.com/dns-query"]);
assert.deepEqual(output.dns["proxy-server-nameserver"], ["https://dns.alidns.com/dns-query"]);
assert.equal("nameserver-policy" in output.dns, false);
assert.equal("fallback" in output.dns, false);
assert.equal("fallback-filter" in output.dns, false);
assert.deepEqual(output.dns["fake-ip-filter"], ["example.internal"]);
assert.equal(output.dns["fake-ip-range"], "198.18.0.1/16");
assertNoForbiddenDns(output);

for (const original of before) {
    const transformed = output.proxies.find((node) => node.name === original.name);
    assert.ok(transformed, `missing proxy ${original.name}`);
    assert.deepEqual(withoutServer(transformed), withoutServer(original));
    assert.equal(transformed.server, original.server);
}

const usGroup = output["proxy-groups"].find((group) => group.name === "美国-iNetS+滕王阁");
assert.ok(usGroup);
assert.equal(usGroup.proxies.includes("良心云 美国 01"), false);
assert.equal(usGroup.proxies.includes("iNetS 美国 高级 01"), true);
assert.equal(usGroup.proxies.includes("滕王阁 美国 01"), true);

const hkGroup = output["proxy-groups"].find((group) => group.name === "香港-iNetS+滕王阁");
assert.ok(hkGroup);
assert.equal(hkGroup.proxies.includes("滕王阁 香港 01"), true);
assert.equal(hkGroup.proxies.includes("iNetS 香港 实验性 01"), false);

assertPolicyReferences(output);

const outputWithoutInterface = clone(runConvert(input, { network_interface: "" }));
assert.equal(Object.hasOwn(outputWithoutInterface, "interface-name"), false);

const outputWithMacInterface = clone(runConvert(input, { network_interface: "en0" }));
assert.equal(outputWithMacInterface["interface-name"], "en0");

const outputWithCampusDns = clone(runConvert(input, { campus_dns: "10.10.10.10,10.10.10.11" }));
assert.equal(outputWithCampusDns.ipv6, false);
assert.deepEqual(outputWithCampusDns.dns["nameserver-policy"]["+.wechat.com"], [
    "10.10.10.10",
    "10.10.10.11",
]);
assert.deepEqual(outputWithCampusDns.dns["nameserver-policy"]["+.weixin.com"], [
    "10.10.10.10",
    "10.10.10.11",
]);
assert.deepEqual(outputWithCampusDns.dns["nameserver-policy"]["+.wximg.qq.com"], [
    "10.10.10.10",
    "10.10.10.11",
]);
assert.deepEqual(outputWithCampusDns.dns["nameserver-policy"]["+.qpic.cn"], [
    "10.10.10.10",
    "10.10.10.11",
]);
assert.deepEqual(outputWithCampusDns.dns["nameserver-policy"]["+.qlogo.cn"], [
    "10.10.10.10",
    "10.10.10.11",
]);
assert.equal(Object.hasOwn(outputWithCampusDns.dns["nameserver-policy"], "+.qq.com"), false);

console.log(
    JSON.stringify(
        {
            status: "ok",
            dnsNameserver: output.dns.nameserver,
            wechatDnsPolicy: outputWithCampusDns.dns["nameserver-policy"]["+.wechat.com"],
            proxyServerNameserver: output.dns["proxy-server-nameserver"],
            interfaceName: outputWithMacInterface["interface-name"],
        },
        null,
        2
    )
);
