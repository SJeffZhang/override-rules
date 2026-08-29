import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("convert.min.js", "utf8");

const YTOO_SERVER_ALIASES = {
    "6047f413-ad53.163cdn-ai.net": "9f6072cc-59fb-11f.163cdn-ai.net",
    "bc2f95b2-590c-11f1.163cdn-ai.net": "34526e4c-693f-11f11.163cdn-ai.net",
    "bc2f95b2-590c-11f2.163cdn-ai.net": "34526e4c-693f-11f12.163cdn-ai.net",
    "bc2f95b2-590c-11f3.163cdn-ai.net": "34526e4c-693f-11f13.163cdn-ai.net",
};

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
        "6047f413-ad53.163cdn-ai.net": "old-alias.example",
        "bc2f95b2-590c-11f1.163cdn-ai.net": "old-alias.example",
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
        proxy("YToo 香港 高级 01", "6047f413-ad53.163cdn-ai.net"),
        proxy("YToo 新加坡 高级 01", "bc2f95b2-590c-11f1.163cdn-ai.net"),
        proxy("YToo 日本 高级 01", "bc2f95b2-590c-11f2.163cdn-ai.net"),
        proxy("YToo 美国 高级 01", "bc2f95b2-590c-11f3.163cdn-ai.net"),
        proxy("花云 美国 高级 01", "flower-us.example", { type: "ss" }),
        proxy("滕王阁 美国 01", "twg-us.example", { type: "ss" }),
        proxy("良心云 美国 01", "liangxinyun-us.example", { type: "ss" }),
        proxy("花云 台湾 高级 01", "flower-tw.example", { type: "ss" }),
        proxy("花云 新加坡 高级 01", "flower-sg.example", { type: "ss" }),
        proxy("花云 日本 高级 01", "flower-jp.example", { type: "ss" }),
        proxy("滕王阁 香港 01", "twg-hk.example", { type: "ss" }),
    ],
};

const before = clone(input.proxies);
const output = clone(runConvert(input, {}));

assert.equal(output["interface-name"], "en0");
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
assert.equal("fallback" in output.dns, false);
assert.equal("fallback-filter" in output.dns, false);
assert.deepEqual(output.dns["fake-ip-filter"], ["example.internal"]);
assert.equal(output.dns["fake-ip-range"], "198.18.0.1/16");
assertNoForbiddenDns(output);

let replacements = 0;
for (const node of output.proxies) {
    assert.equal(Object.hasOwn(YTOO_SERVER_ALIASES, node.server), false);
    if (Object.values(YTOO_SERVER_ALIASES).includes(node.server)) {
        replacements += 1;
    }
}
assert.equal(replacements, 4);

for (const original of before) {
    const transformed = output.proxies.find((node) => node.name === original.name);
    assert.ok(transformed, `missing proxy ${original.name}`);
    assert.deepEqual(withoutServer(transformed), withoutServer(original));
    if (Object.hasOwn(YTOO_SERVER_ALIASES, original.server)) {
        assert.equal(transformed.server, YTOO_SERVER_ALIASES[original.server]);
    } else {
        assert.equal(transformed.server, original.server);
    }
}

const usGroup = output["proxy-groups"].find((group) => group.name === "美国-花云+滕王阁+YToo");
assert.ok(usGroup);
assert.equal(usGroup.proxies.includes("良心云 美国 01"), false);
assert.equal(usGroup.proxies.includes("花云 美国 高级 01"), true);
assert.equal(usGroup.proxies.includes("滕王阁 美国 01"), true);
assert.equal(usGroup.proxies.includes("YToo 美国 高级 01"), true);

assertPolicyReferences(output);

const outputWithoutInterface = clone(runConvert(input, { network_interface: "" }));
assert.equal(Object.hasOwn(outputWithoutInterface, "interface-name"), false);

console.log(
    JSON.stringify(
        {
            status: "ok",
            ytooServerReplacements: replacements,
            dnsNameserver: output.dns.nameserver,
            proxyServerNameserver: output.dns["proxy-server-nameserver"],
            interfaceName: output["interface-name"],
        },
        null,
        2
    )
);
