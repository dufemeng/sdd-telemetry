#!/usr/bin/env python3
"""
endpoint-baseline.json 生成器

用法：
    python3 generate-endpoint-baseline.py [--api-base http://127.0.0.1:4318] [--output endpoint-baseline.json]

设计说明（详见 review.md）：
- 28 个查询端点 × 多 scenarios，覆盖空集 / 单用户 / 全量
- 时效字段（timestamps、ids 等）通过 mask 处理避免迁移前后必然 diff
- 写入端点（POST/PUT）只记录请求 schema 不实际执行，避免污染数据
- baseline 用作 bkfesddcore 迁移前后回归对比的"金答案"

迁移流程：
    1. 在当前电脑 (sdd-telemetry) 上跑此脚本生成 endpoint-baseline.json
    2. 迁移到 bkfesddcore 后，再跑一次，对比两份 baseline 的 diff
    3. 所有非时效字段都应一致；不一致 = 迁移回归
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse
import urllib.request
from typing import Any

# ---- 时效字段 mask（迁移前后必然变化，不参与对比） ----

TOLERANT_FIELD_PATTERNS = [
    # 响应包装
    r"^timestamp$",
    r"^requestId$",
    # 通用时间戳
    r"^gmt_create$",
    r"^gmt_modified$",
    r"^createdAt$",
    r"^updatedAt$",
    # ingest / batch 时效
    r"^received_at$",
    r"^receivedAt$",
    r"^parse_started_at$",
    r"^parseStartedAt$",
    r"^parse_completed_at$",
    r"^parseCompletedAt$",
    r"^parse_duration_ms$",
    r"^parseDurationMs$",
    r"^latestReceivedAt$",
    r"^latestParsedAt$",
    r"^dispatched_at$",
    r"^dispatchedAt$",
    r"^next_retry_at$",
    r"^nextRetryAt$",
    r"^locked_until$",
    r"^lockedUntil$",
    # interaction 时效
    r"^started_at$",
    r"^startedAt$",
    r"^completed_at$",
    r"^completedAt$",
    r"^event_time$",
    r"^eventTime$",
    r"^observed_at$",
    r"^observedAt$",
    # work item / artifact 时效
    r"^first_seen_at$",
    r"^firstSeenAt$",
    r"^last_seen_at$",
    r"^lastSeenAt$",
    r"^firstSeenAt$",
    # retention 时效
    r"^expires_at$",
    r"^expiresAt$",
]

TOLERANT_REGEX = re.compile("|".join(TOLERANT_FIELD_PATTERNS))


def mask_tolerant(node: Any) -> Any:
    """递归把时效字段替换为 '<MASKED>'。"""
    if isinstance(node, dict):
        return {
            k: ("<MASKED>" if TOLERANT_REGEX.match(k) and v is not None else mask_tolerant(v))
            for k, v in node.items()
        }
    if isinstance(node, list):
        return [mask_tolerant(item) for item in node]
    return node


def http_get(url: str, timeout: float = 10.0) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {
                "status": resp.status,
                "body": json.loads(resp.read().decode("utf-8")),
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            body = json.loads(body)
        except Exception:
            pass
        return {"status": e.code, "body": body}
    except Exception as e:
        return {"status": 0, "body": {"error": str(e)}}


def first_id(get_url: str, key_path: list[str]) -> str | None:
    """跟随 key path 从 GET 响应里取第一个 id。"""
    r = http_get(get_url)
    if r["status"] != 200:
        return None
    node = r["body"]
    for key in key_path:
        if isinstance(node, dict):
            node = node.get(key)
        elif isinstance(node, list) and node:
            node = node[0]
        else:
            return None
    if isinstance(node, list) and node:
        node = node[0]
    if isinstance(node, dict):
        return str(node.get("id") or "")
    return None


def discover_ids(api_base: str) -> dict[str, str]:
    """从已有数据中发现真实的 path 参数 ID，便于端点 path 拼接。"""
    return {
        "batchId": first_id(f"{api_base}/api/ingest/batches?limit=1", ["data", "items", "id"]) or "1",
        "interactionId": first_id(
            f"{api_base}/api/sdd/interactions?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z&limit=1",
            ["data", "id"],
        )
        or "1",
        "workItemId": first_id(f"{api_base}/api/sdd/work-items?limit=1", ["data", "id"]) or "1",
        "semanticId": first_id(f"{api_base}/api/sdd/semantics", ["data", "id"]) or "1",
        "tableRowId": first_id(
            f"{api_base}/api/ops/tables/sdd_users/rows?limit=1", ["data", "rows", "id"]
        )
        or "1",
    }


def make_scenarios(ids: dict[str, str]) -> list[dict[str, Any]]:
    """所有 endpoint scenarios 的定义。"""
    # 时间范围窗口
    full_range = {"from": "2020-01-01T00:00:00Z", "to": "2030-01-01T00:00:00Z"}
    empty_range = {"from": "1990-01-01T00:00:00Z", "to": "1990-01-02T00:00:00Z"}
    last_24h = {"timeRange": "24h"}

    s: list[dict[str, Any]] = [
        # ---- ingest 模块 (4 端点) ----
        {
            "id": "ingest.getHealth",
            "method": "GET",
            "path": "/api/ingest/health",
            "scenarios": [
                {"name": "default", "query": {"windowHours": 24}},
                {"name": "wide", "query": {"windowHours": 168}},
            ],
        },
        {
            "id": "ingest.listBatches",
            "method": "GET",
            "path": "/api/ingest/batches",
            "scenarios": [
                {"name": "default", "query": {"limit": 3}},
                {"name": "filterParsed", "query": {"status": "parsed", "limit": 3}},
                {"name": "empty", "query": {"status": "failed_terminal", "limit": 3}},
            ],
        },
        {
            "id": "ingest.getBatchDetail",
            "method": "GET",
            "path": f"/api/ingest/batches/{ids['batchId']}",
            "scenarios": [{"name": "default", "query": {}}],
        },
        # POST /api/ingest/otlp-logs 写入端点，不实际调用
        # ---- events 模块 (4 端点) ----
        {
            "id": "events.getDistribution",
            "method": "GET",
            "path": "/api/events/distribution",
            "scenarios": [
                {"name": "full", "query": {**full_range, "limit": 10}},
                {"name": "last24h", "query": {**last_24h, "limit": 5}},
                {"name": "empty", "query": {**empty_range, "limit": 10}},
            ],
        },
        {
            "id": "events.getFieldCoverage",
            "method": "GET",
            "path": "/api/events/field-coverage",
            "scenarios": [
                {"name": "full", "query": full_range},
                {"name": "empty", "query": empty_range},
            ],
        },
        {
            "id": "events.getFieldValues",
            "method": "GET",
            "path": "/api/events/field-values",
            "scenarios": [
                {"name": "serviceName", "query": {**full_range, "fieldPath": "service_name"}},
            ],
        },
        {
            "id": "events.getTimeline",
            "method": "GET",
            "path": "/api/events/timeline",
            "scenarios": [
                {"name": "hourly", "query": {**full_range, "bucket": "hour"}},
                {"name": "daily", "query": {**full_range, "bucket": "day"}},
                {"name": "empty", "query": {**empty_range, "bucket": "day"}},
            ],
        },
        # ---- sdd 模块 (13 GET + 3 写入) ----
        {
            "id": "sdd.listSemantics",
            "method": "GET",
            "path": "/api/sdd/semantics",
            "scenarios": [{"name": "default", "query": {}}],
        },
        {
            "id": "sdd.getOverview",
            "method": "GET",
            "path": "/api/sdd/overview",
            "scenarios": [
                {"name": "full", "query": full_range},
                {"name": "last24h", "query": last_24h},
                {"name": "empty", "query": empty_range},
            ],
        },
        {
            "id": "sdd.getFunnel",
            "method": "GET",
            "path": "/api/sdd/funnel",
            "scenarios": [
                {"name": "full", "query": full_range},
                {"name": "empty", "query": empty_range},
            ],
        },
        {
            "id": "sdd.getSkillAnalytics",
            "method": "GET",
            "path": "/api/sdd/skill-analytics",
            "scenarios": [
                {"name": "full", "query": full_range},
                {"name": "empty", "query": empty_range},
            ],
        },
        {
            "id": "sdd.getSkillTimeseries",
            "method": "GET",
            "path": "/api/sdd/skill-timeseries",
            "scenarios": [
                {"name": "hourly", "query": {**full_range, "bucketSeconds": 3600}},
                {"name": "daily", "query": {**full_range, "bucketSeconds": 86400}},
            ],
        },
        {
            "id": "sdd.getUsageSummary",
            "method": "GET",
            "path": "/api/sdd/usage-summary",
            "scenarios": [
                {"name": "full", "query": {**full_range, "limit": 5}},
                {"name": "matched", "query": {**full_range, "matched": "matched", "limit": 5}},
                {"name": "unmatched", "query": {**full_range, "matched": "unmatched", "limit": 5}},
            ],
        },
        {
            "id": "sdd.listUsages",
            "method": "GET",
            "path": "/api/sdd/usages",
            "scenarios": [
                {"name": "default", "query": {**full_range, "limit": 3}},
                {"name": "empty", "query": {**empty_range, "limit": 3}},
            ],
        },
        {
            "id": "sdd.listInteractions",
            "method": "GET",
            "path": "/api/sdd/interactions",
            "scenarios": [
                {"name": "default", "query": {**full_range, "limit": 3}},
                {"name": "empty", "query": {**empty_range, "limit": 3}},
            ],
        },
        {
            "id": "sdd.getInteractionDetail",
            "method": "GET",
            "path": f"/api/sdd/interactions/{ids['interactionId']}",
            "scenarios": [{"name": "default", "query": {}}],
        },
        {
            "id": "sdd.listInteractionToolCalls",
            "method": "GET",
            "path": f"/api/sdd/interactions/{ids['interactionId']}/tool-calls",
            "scenarios": [{"name": "default", "query": {}}],
        },
        {
            "id": "sdd.listErrors",
            "method": "GET",
            "path": "/api/sdd/errors",
            "scenarios": [
                {"name": "default", "query": {**full_range, "limit": 3}},
                {"name": "empty", "query": {**empty_range, "limit": 3}},
            ],
        },
        {
            "id": "sdd.listUsers",
            "method": "GET",
            "path": "/api/sdd/users",
            "scenarios": [{"name": "default", "query": {}}],
        },
        {
            "id": "sdd.listVersions",
            "method": "GET",
            "path": "/api/sdd/versions",
            "scenarios": [{"name": "default", "query": {}}],
        },
        {
            "id": "sdd.listWorkItems",
            "method": "GET",
            "path": "/api/sdd/work-items",
            "scenarios": [{"name": "default", "query": {"limit": 5}}],
        },
        {
            "id": "sdd.getWorkItemDetail",
            "method": "GET",
            "path": f"/api/sdd/work-items/{ids['workItemId']}",
            "scenarios": [{"name": "default", "query": {}}],
        },
        # ---- ops 模块 (5 端点) ----
        {
            "id": "ops.listTables",
            "method": "GET",
            "path": "/api/ops/tables",
            "scenarios": [{"name": "default", "query": {}}],
        },
        {
            "id": "ops.listTableRows",
            "method": "GET",
            "path": "/api/ops/tables/sdd_users/rows",
            "scenarios": [
                {"name": "default", "query": {"limit": 3}},
                {"name": "orderById", "query": {"limit": 3, "orderBy": "id", "order": "desc"}},
            ],
        },
        {
            "id": "ops.getTableRow",
            "method": "GET",
            "path": f"/api/ops/tables/sdd_users/rows/{ids['tableRowId']}",
            "scenarios": [{"name": "default", "query": {}}],
        },
        {
            "id": "ops.listJobs",
            "method": "GET",
            "path": "/api/ops/jobs",
            "scenarios": [
                {"name": "default", "query": {"limit": 5}},
            ],
        },
        {
            "id": "ops.getQueue",
            "method": "GET",
            "path": "/api/ops/queue",
            "scenarios": [{"name": "default", "query": {}}],
        },
    ]
    return s


# ---- 写入端点（不实际执行，仅记录 schema） ----
WRITE_ENDPOINTS = [
    {
        "id": "ingest.postOtlpLogs",
        "method": "POST",
        "path": "/api/ingest/otlp-logs",
        "requestSchema": "OtlpLogsPayloadSchema",
        "responseSchema": "IngestLogsResponseSchema",
        "executed": False,
        "reason": "写入端点；baseline 不执行避免污染数据。迁移后用专门的 ingest 冒烟测试验证（如 docs/acceptance-plan.md 所述）",
    },
    {
        "id": "sdd.createSemantic",
        "method": "POST",
        "path": "/api/sdd/semantics",
        "requestSchema": "CreateSddSemanticRequestSchema",
        "responseSchema": "SddSemanticSchema",
        "executed": False,
        "reason": "写入端点；baseline 不执行避免污染语义配置",
    },
    {
        "id": "sdd.updateSemantic",
        "method": "PUT",
        "path": "/api/sdd/semantics/:id",
        "requestSchema": "UpdateSddSemanticRequestSchema",
        "responseSchema": "SddSemanticSchema",
        "executed": False,
        "reason": "写入端点；baseline 不执行避免污染语义配置",
    },
    {
        "id": "sdd.reportUserSettings",
        "method": "POST",
        "path": "/api/sdd/user-settings",
        "requestSchema": "ReportUserSettingsRequestSchema",
        "responseSchema": "ApiResponseSchema(z.object({}))",
        "executed": False,
        "reason": "写入端点；baseline 不执行避免污染用户记录",
    },
]


def build_url(api_base: str, path: str, query: dict[str, Any]) -> str:
    base = api_base.rstrip("/") + path
    if not query:
        return base
    return f"{base}?{urllib.parse.urlencode(query, doseq=True)}"


def main() -> int:
    parser = argparse.ArgumentParser(description="生成 endpoint-baseline.json")
    parser.add_argument("--api-base", default="http://127.0.0.1:4318")
    parser.add_argument(
        "--output", default="endpoint-baseline.json", help="输出文件路径（默认当前目录）"
    )
    args = parser.parse_args()

    print(f"[1/3] 从 {args.api_base} 发现 path 参数 ID …", file=sys.stderr)
    ids = discover_ids(args.api_base)
    for k, v in ids.items():
        print(f"  {k} = {v}", file=sys.stderr)

    print(f"[2/3] 构造 endpoint scenarios …", file=sys.stderr)
    endpoints = make_scenarios(ids)
    total_calls = sum(len(e["scenarios"]) for e in endpoints)
    print(f"  GET 端点 {len(endpoints)} 个，scenarios 合计 {total_calls} 次调用", file=sys.stderr)

    print(f"[3/3] 顺序调用并收集响应（mask 时效字段）…", file=sys.stderr)
    for endpoint in endpoints:
        for scenario in endpoint["scenarios"]:
            url = build_url(args.api_base, endpoint["path"], scenario["query"])
            r = http_get(url)
            scenario["url"] = url
            scenario["status"] = r["status"]
            scenario["response"] = mask_tolerant(r["body"])
            print(f"  {endpoint['method']} {endpoint['path']} [{scenario['name']}] -> {r['status']}", file=sys.stderr)

    baseline = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "apiBase": args.api_base,
        "discoveredIds": ids,
        "tolerantFieldPatterns": TOLERANT_FIELD_PATTERNS,
        "endpoints": endpoints,
        "writeEndpoints": WRITE_ENDPOINTS,
        "summary": {
            "totalGetEndpoints": len(endpoints),
            "totalGetScenarios": total_calls,
            "totalWriteEndpoints": len(WRITE_ENDPOINTS),
        },
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=2, ensure_ascii=False)

    print(f"\n生成完成：{args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
