import type { ProxyNode } from "./types";

/**
 * YToo 的 AnyTLS 订阅依赖配置文件顶层的 hosts 映射。
 * Sub-Store 将多个订阅合并为节点列表时不会保留顶层 hosts，
 * 因此在生成完整配置前直接把入口别名改写为真实接入域名。
 */
const YTOO_SERVER_HOST_MAP: Readonly<Record<string, string>> = {
    "6047f413-ad53.66991163.xyz": "34526e4c-693f.66991163.xyz",
    "bc2f95b2-590c-11f1.66991163.xyz": "34526e4c-693f-11f11.66991163.xyz",
    "bc2f95b2-590c-11f2.66991163.xyz": "34526e4c-693f-11f12.66991163.xyz",
    "bc2f95b2-590c-11f3.66991163.xyz": "34526e4c-693f-11f13.66991163.xyz",
};

/**
 * 修复 Sub-Store 合并后丢失 YToo hosts 映射导致 AnyTLS 全部超时的问题。
 * 只处理映射表中已知的 AnyTLS 入口，不修改其他机场或未知节点。
 */
export function rewriteYTooAnyTLSServers(nodes: ProxyNode[]): ProxyNode[] {
    return nodes.map((node) => {
        if (node.type !== "anytls" || typeof node.server !== "string") {
            return node;
        }

        const mappedServer = YTOO_SERVER_HOST_MAP[node.server];
        if (!mappedServer) {
            return node;
        }

        return { ...node, server: mappedServer };
    });
}
