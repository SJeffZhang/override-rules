import type { ProxyNode } from "./types";

/**
 * YToo 的 AnyTLS 订阅曾依赖配置文件顶层的 hosts 映射。
 * Sub-Store 将多个订阅合并为节点列表时不会可靠保留顶层 hosts，
 * 因此在生成完整配置前直接把旧入口域名改写为机场维护的动态别名。
 */
export const YTOO_SERVER_ALIASES: Readonly<Record<string, string>> = {
    "6047f413-ad53.163cdn-ai.net": "9f6072cc-59fb-11f.163cdn-ai.net",
    "bc2f95b2-590c-11f1.163cdn-ai.net": "34526e4c-693f-11f11.163cdn-ai.net",
    "bc2f95b2-590c-11f2.163cdn-ai.net": "34526e4c-693f-11f12.163cdn-ai.net",
    "bc2f95b2-590c-11f3.163cdn-ai.net": "34526e4c-693f-11f13.163cdn-ai.net",
};

export const LEGACY_YTOO_HOST_ALIAS_KEYS = Object.freeze(Object.keys(YTOO_SERVER_ALIASES));

/**
 * 修复 Sub-Store 合并后 YToo 旧入口域名在部分网络环境下不稳定的问题。
 * 只处理映射表中完全命中的 server 字段，不修改其他机场、未知节点或节点认证参数。
 */
export function rewriteYTooAnyTLSServers(nodes: ProxyNode[]): ProxyNode[] {
    return nodes.map((node) => {
        if (typeof node.server !== "string") {
            return node;
        }

        const mappedServer = YTOO_SERVER_ALIASES[node.server];
        if (!mappedServer) {
            return node;
        }

        return { ...node, server: mappedServer };
    });
}
