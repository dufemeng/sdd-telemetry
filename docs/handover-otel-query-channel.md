# OTel 双通道身份注入 · init / upgrade 改造交接文档

更新时间：2026-05-26  
背景：server 侧已上线「URL query 主通道 + HTTP header 备用通道」，公司电脑的 `init` 和 `upgrade` 命令需同步支持。

---

## 1. 为什么要改

### 原有方案的问题

原方案把用户身份（install_id、user_name、requirements_root_path 等）写进 `OTEL_EXPORTER_OTLP_HEADERS`，让 Claude Code 的 OTel exporter 以 HTTP header 形式上报。

这条路有一个隐患：Claude Code 进程内有两个 LoggerProvider，各自在不同时刻冻结自己的配置。`settings.json` 的 `env` 字段是 Claude Code **启动中途**注入到 `process.env` 的——如果 exporter 恰好在注入之前已经初始化，`OTEL_EXPORTER_OTLP_HEADERS` 对那个 exporter 就是空字符串，header 不带任何 sdd-* 字段，`sdd_users` 表里的 install_id、requirements_root_path 就会长期是 NULL，导致 work item / artifact 识别失效。

实测：部分用户 settings.json 配置完全正确、Claude Code 也重启了，但 server 日志里仍看不到 sdd-* header——说明问题是概率性的，取决于进程内两个 LoggerProvider 的启动时序。

### 新方案：把身份编码进 endpoint URL query string

`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` 是 OTel logs exporter 必须读取的变量——没有它 exporter 根本不知道往哪发数据，所以它一定比其他任何 env 都早被解析。把 install_id 等字段编码进这个 URL 的 query string，就彻底跳出时序问题。

```
# 旧：身份在 header
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://sdd.example.com/api/ingest/otlp-logs
OTEL_EXPORTER_OTLP_HEADERS=sdd-install-id=zhangsan-Mac,...

# 新：身份主通道在 URL query，header 保留为兜底
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://sdd.example.com/api/ingest/otlp-logs?install_id=zhangsan-Mac&user_name=zhangsan&...
OTEL_EXPORTER_OTLP_HEADERS=sdd-install-id=zhangsan-Mac,...  ← 保留，向后兼容
```

### Server 端的变化（已上线，commit b8dc48c）

Server 对每条进来的 OTLP 请求做三层合并：

```
资源属性（resource attributes）
  ↓ mergeUserHints（header 覆盖 resource）
HTTP header（sdd-* headers）
  ↓ mergeUserHints（query 覆盖 header）
URL query string（install_id, user_name 等 query params）
  ↓
mergedHints → createUserKey → upsertUser
```

优先级：**query > header > resource attribute**。每个字段独立判断，「新值非空才覆盖」，所以各通道互补不冲突。

---

## 2. settings.json 最终格式

`init` / `upgrade` 命令写入 `~/.claude/settings.json` 的 `env` 字段应包含以下内容：

```jsonc
{
  "env": {
    // ─── OTel 基础开关 ────────────────────────────────────────
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_LOG_USER_PROMPTS": "1",
    "OTEL_LOG_TOOL_DETAILS": "1",
    "OTEL_LOG_RAW_API_BODIES": "1",
    "OTEL_LOGS_EXPORT_INTERVAL": "5000",

    // ─── 主通道：身份编码进 endpoint URL query ─────────────────
    // 字段名用下划线（snake_case），值做 percent-encode（同 encodeURIComponent）
    // 必须剔除的字符：& = ? # + 空格（用 %20 或 + 均可，推荐 %20）
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "https://sdd.example.com/api/ingest/otlp-logs?install_id=<INSTALL_ID>&user_name=<USER_NAME>&machine_name=<MACHINE_NAME>&requirements_root_path=<REQUIREMENTS_ROOT_PATH_ENCODED>",

    // ─── 备用通道：header（向后兼容，保留不删）────────────────
    // 字段名用连字符（kebab-case），前缀 sdd-，值做 percent-encode
    // 注意：不要设 OTEL_EXPORTER_OTLP_LOGS_HEADERS，只设通用的 OTEL_EXPORTER_OTLP_HEADERS
    "OTEL_EXPORTER_OTLP_HEADERS": "sdd-install-id=<INSTALL_ID>&sdd-user-name=<USER_NAME>&sdd-machine-name=<MACHINE_NAME>&sdd-requirements-root-path=<REQUIREMENTS_ROOT_PATH_ENCODED>"
  }
}
```

### 字段对照表

| query param 名（新主通道） | header 名（备用通道） | OtlpUserHints 字段 | 必需 | 说明 |
|---|---|---|---|---|
| `install_id` | `sdd-install-id` | `installId` | 推荐 | 人类可读的安装标签，格式建议 `<name>-<hostname>` |
| `user_name` | `sdd-user-name` | `userName` | 推荐 | dashboard 显示名 |
| `machine_name` | `sdd-machine-name` | `machineName` | 可选 | 机器名（hostname） |
| `machine_id` | `sdd-machine-id` | `machineId` | 可选 | 机器唯一 ID |
| `requirements_root_path` | `sdd-requirements-root-path` | `requirementsRootPath` | **必需** | @requirements 仓库绝对路径；不设此项 work item 识别不工作 |
| `wiki_root_path` | `sdd-wiki-root-path` | `wikiRootPath` | 可选 | @wiki 仓库绝对路径 |

---

## 3. init 命令改造

### 3.1 需要收集的信息

`init` 命令在询问用户 @requirements / @wiki 路径时，顺带收集：

| 变量 | 来源 | 示例 |
|---|---|---|
| `USER_NAME` | 询问用户输入（或从 git config 读） | `zhangsan` |
| `INSTALL_ID` | 自动生成：`<user_name>-<hostname_short>` | `zhangsan-MacBookPro` |
| `MACHINE_NAME` | `hostname` 命令 | `zhangsan-MacBook-Pro.local` |
| `REQUIREMENTS_ROOT_PATH` | 用户刚刚 clone 的 @requirements 路径（已知） | `/Users/zhangsan/repos/bk-fe-requirements-trade` |
| `WIKI_ROOT_PATH` | 用户刚刚 clone 的 @wiki 路径（已知，可选） | `/Users/zhangsan/repos/bk-fe-knowledge-trade` |
| `OTEL_SERVER_URL` | init 脚本硬编码（部署方提供） | `https://sdd.example.com` |

### 3.2 写入 settings.json 的 Python 片段

在 init 脚本的 settings.json 写入阶段，替换或新增 OTel 相关 env 字段。可直接内嵌以下 Python 逻辑：

```python
import json, os
from urllib.parse import quote

# ── 以下变量由 init 脚本的上下文提供 ──────────────────────────
OTEL_SERVER_URL = "https://sdd.example.com"           # 部署地址，硬编码
OTEL_ENDPOINT   = f"{OTEL_SERVER_URL}/api/ingest/otlp-logs"

USER_NAME             = "<从用户输入或 git config 读>"
INSTALL_ID            = f"{USER_NAME}-{hostname_short}"  # hostname_short = hostname -s | tr -cd 'a-zA-Z0-9._-'
MACHINE_NAME          = "<hostname>"
REQUIREMENTS_ROOT_PATH = "<@requirements 克隆路径>"
WIKI_ROOT_PATH        = "<@wiki 克隆路径，可为空字符串>"
# ─────────────────────────────────────────────────────────────

def pct(value: str) -> str:
    """URL-encode a query/header value (same as JS encodeURIComponent)."""
    return quote(value, safe="-_.!~*'()")

# ── 构建主通道 endpoint URL ───────────────────────────────────
query_params = [
    ("install_id",            INSTALL_ID),
    ("user_name",             USER_NAME),
    ("machine_name",          MACHINE_NAME),
    ("requirements_root_path", REQUIREMENTS_ROOT_PATH),
]
if WIKI_ROOT_PATH:
    query_params.append(("wiki_root_path", WIKI_ROOT_PATH))

# query value 用更严格的 safe='' 防止 & = 等字符污染 query string
query_string = "&".join(
    f"{k}={quote(v, safe='')}" for k, v in query_params
)
endpoint_with_query = f"{OTEL_ENDPOINT}?{query_string}"

# ── 构建备用通道 headers ──────────────────────────────────────
sdd_headers = [
    ("sdd-install-id",              INSTALL_ID),
    ("sdd-user-name",               USER_NAME),
    ("sdd-machine-name",            MACHINE_NAME),
    ("sdd-requirements-root-path",  REQUIREMENTS_ROOT_PATH),
    ("sdd-wiki-root-path",          WIKI_ROOT_PATH),
]
otlp_headers = ",".join(
    f"{name}={pct(value)}" for name, value in sdd_headers if value
)

# ── 读取 / 创建 settings.json ─────────────────────────────────
settings_file = os.path.expanduser("~/.claude/settings.json")
if os.path.exists(settings_file):
    with open(settings_file) as f:
        settings = json.load(f)
else:
    settings = {}

env = settings.setdefault("env", {})

# ── 写入 OTel env ─────────────────────────────────────────────
env["CLAUDE_CODE_ENABLE_TELEMETRY"]          = "1"
env["OTEL_LOGS_EXPORTER"]                    = "otlp"
env["OTEL_EXPORTER_OTLP_PROTOCOL"]           = "http/json"
env["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"]      = endpoint_with_query  # ← 主通道（含 query）
env["OTEL_EXPORTER_OTLP_HEADERS"]            = otlp_headers          # ← 备用通道（header）
env["OTEL_LOG_USER_PROMPTS"]                 = "1"
env["OTEL_LOG_TOOL_DETAILS"]                 = "1"
env["OTEL_LOG_RAW_API_BODIES"]               = "1"
env["OTEL_LOGS_EXPORT_INTERVAL"]             = "5000"

# 清理已过时的字段（避免残留干扰）
env.pop("OTEL_LOG_TOOL_CONTENT", None)
env.pop("OTEL_RESOURCE_ATTRIBUTES", None)
env.pop("OTEL_EXPORTER_OTLP_LOGS_HEADERS", None)  # 不设信号特定版，只保留通用版

with open(settings_file, "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\n")
```

### 3.3 写入后告知用户

```
✓ OTel 配置已写入 ~/.claude/settings.json
  身份标签：<INSTALL_ID>
  需求路径：<REQUIREMENTS_ROOT_PATH>
  上报地址：<OTEL_SERVER_URL>

请完全退出 Claude Code 后重新打开，配置才能生效。
```

---

## 4. upgrade 命令改造

`upgrade` 面向已经跑过 `init` 的用户，只做增量更新。

### 4.1 什么情况需要 upgrade

- 用户是旧版 init 配置的（只有 `OTEL_EXPORTER_OTLP_HEADERS`，没有 URL query）
- 用户修改了 @requirements / @wiki 的磁盘路径
- 需要切换 OTel server URL（如测试环境 → 生产）

### 4.2 upgrade 策略

1. **读取现有 settings.json**，提取已有的 `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`（拿域名部分）或 `OTEL_EXPORTER_OTLP_HEADERS`（拿 install_id 等字段）
2. **提取已有身份信息**（避免要求用户重新输入不变的字段）：

```python
import re
from urllib.parse import urlparse, parse_qs, unquote

def extract_existing_identity(env: dict) -> dict:
    """从现有 settings.json env 里反解出已配置的身份字段。"""
    identity = {
        "install_id": "",
        "user_name": "",
        "machine_name": "",
        "requirements_root_path": "",
        "wiki_root_path": "",
    }

    # 优先从 endpoint URL query 读（新格式）
    endpoint = env.get("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "")
    if "?" in endpoint:
        qs = parse_qs(urlparse(endpoint).query)
        for field in identity:
            if field in qs:
                identity[field] = unquote(qs[field][0])
        return identity

    # 降级：从 header 字符串读（旧格式）
    headers_str = env.get("OTEL_EXPORTER_OTLP_HEADERS", "")
    header_map = {
        "sdd-install-id":             "install_id",
        "sdd-user-name":              "user_name",
        "sdd-machine-name":           "machine_name",
        "sdd-requirements-root-path": "requirements_root_path",
        "sdd-wiki-root-path":         "wiki_root_path",
    }
    for pair in headers_str.split(","):
        if "=" not in pair:
            continue
        name, _, value = pair.partition("=")
        name = name.strip().lower()
        if name in header_map:
            identity[header_map[name]] = unquote(value.strip())

    return identity
```

3. **只更新 OTel 相关字段**，其余 settings.json 内容（pathAliases、hooks 等）原样保留
4. 如果 requirements_root_path 已变（用户迁移了仓库路径），提示用户确认新路径

### 4.3 upgrade 写入逻辑

与 init 完全相同（复用 3.2 的 Python 片段），差别仅在于：
- 身份字段来源是「从现有配置反解 + 用户确认」，而不是全新输入
- 可以跳过已确认不变的字段，只重新 URL-encode 后写回

---

## 5. 验证方法

### 5.1 用户侧验证（配置后）

```bash
# 检查 endpoint 是否带 query string
cat ~/.claude/settings.json | python3 -c "
import json, sys
env = json.load(sys.stdin).get('env', {})
ep = env.get('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT', '')
print('endpoint:', ep)
print('has query:', '?' in ep and 'install_id=' in ep)
print('headers:', env.get('OTEL_EXPORTER_OTLP_HEADERS', ''))
"
```

期望输出：
```
endpoint: https://sdd.example.com/api/ingest/otlp-logs?install_id=zhangsan-Mac&user_name=zhangsan&...
has query: True
headers: sdd-install-id=zhangsan-Mac,sdd-user-name=zhangsan,...
```

### 5.2 Server 侧验证（上报生效后）

```sql
-- 确认用户的 install_id / requirements_root_path 已正确落库
SELECT id, install_id, user_name, requirements_root_path, last_seen_at
FROM sdd_users
WHERE last_seen_at >= NOW() - INTERVAL 10 MINUTE
ORDER BY last_seen_at DESC
LIMIT 10;
```

期望：install_id 和 requirements_root_path 均非 NULL，与配置一致。

### 5.3 快速手测（不依赖 Claude Code）

在用户机器上跑以下命令，直接模拟 OTel exporter 的真实发送方式（`http.request(new URL(endpoint))`）：

```bash
ENDPOINT=$(cat ~/.claude/settings.json | python3 -c "import json,sys; print(json.load(sys.stdin)['env']['OTEL_EXPORTER_OTLP_LOGS_ENDPOINT'])")

node -e "
const http = require('http'); const https = require('https');
const url = new URL('$ENDPOINT');
const body = JSON.stringify({resourceLogs:[{resource:{attributes:[]},scopeLogs:[{scope:{},logRecords:[{timeUnixNano:String(BigInt(Date.now())*1000000n),body:{stringValue:'upgrade-verify'},attributes:[]}]}]}]});
const lib = url.protocol === 'https:' ? https : http;
const req = lib.request(url, {method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}}, res => {
  let d=''; res.on('data',c=>d+=c); res.on('end',()=>console.log('status:',res.statusCode,'\\nbody:',d));
});
req.write(body); req.end();
"
```

server 返回 `status: 200` + `batchId` 即成功；之后跑验证 SQL 确认落库。

---

## 6. 边界 case 和注意事项

### 不要设 OTEL_EXPORTER_OTLP_LOGS_HEADERS

Claude Code 2.1.x 在 logs 信号上优先读 signal-specific 的 `OTEL_EXPORTER_OTLP_LOGS_HEADERS`，如果它存在且非空会**屏蔽**通用的 `OTEL_EXPORTER_OTLP_HEADERS`。所以：
- ✅ 只设 `OTEL_EXPORTER_OTLP_HEADERS`
- ❌ 不要设 `OTEL_EXPORTER_OTLP_LOGS_HEADERS`
- upgrade 时遇到旧配置里有 `OTEL_EXPORTER_OTLP_LOGS_HEADERS`，**必须删掉**（`env.pop("OTEL_EXPORTER_OTLP_LOGS_HEADERS", None)`）

### requirements_root_path 含中文或空格

`quote(path, safe='')` 会将所有非 ASCII 和特殊字符 percent-encode，server 端 Koa 自动 decode，无需额外处理。

### 用户迁移了 @requirements 路径

upgrade 命令反解出旧路径后，应与当前 pathAliases 里 `@requirements` 的值对比。如不一致，提示用户确认：

```
检测到 @requirements 路径已变更：
  旧：/Users/zhangsan/old-path/bk-fe-requirements-trade
  新：/Users/zhangsan/new-path/bk-fe-requirements-trade
是否用新路径更新 OTel 配置？(Y/n)
```

### 多台机器，同一 user_name

`install_id` 建议格式 `<user_name>-<hostname_short>`，天然区分不同机器。两台机器的 user_key 会不同（分两行），但 dashboard 的「用户视图」按 user_name 聚合展示时仍然是同一个人。

### 已有 unknown 孤儿行

用户之前因配置问题产生的 install_id=NULL 孤儿行（user_key 形如 `sha256("unknown:payloadHash")`）在 upgrade 后**不会自动消失**——新 payload 会走新 user_key，老行成为孤儿。数量少可忽略；如需清理，联系平台管理员手动 SQL 合并或等 raw_payload 过期自动清理。

---

## 7. 变更历史

| 时间 | commit | 内容 |
|---|---|---|
| 2026-05-25 | `2c1d5f2` | 引入 HTTP header 注入身份，绕开双 Provider 时序 |
| 2026-05-26 | `b8dc48c` | 新增 URL query 主通道，三层合并（resource→header→query） |
