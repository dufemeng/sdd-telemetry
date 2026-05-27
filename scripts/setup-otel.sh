#!/usr/bin/env bash
set -euo pipefail

# ─── 分发前改这里 ──────────────────────────────────────────────
# 部署好 server 后，把下面的 URL 替换为实际地址，然后再分发给团队成员
OTEL_SERVER_URL="${OTEL_SERVER_URL:-__REPLACE_WITH_DEPLOYED_URL__}"
# 示例：OTEL_SERVER_URL="https://sdd-monitor.your-company.com"
# ──────────────────────────────────────────────────────────────

OTEL_ENDPOINT="${OTEL_SERVER_URL}/api/ingest/otlp-logs"
SETTINGS_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

# ── 依赖检查 ────────────────────────────────────────────────────

if ! command -v python3 &>/dev/null; then
  echo "错误：需要 python3，请先安装。" >&2
  exit 1
fi

if [[ "$OTEL_SERVER_URL" == "__REPLACE_WITH_DEPLOYED_URL__" ]]; then
  echo "错误：脚本尚未配置 server 地址，请联系仓库管理员获取最新版本。" >&2
  exit 1
fi

# ── 欢迎语 ──────────────────────────────────────────────────────

echo ""
echo "=== SDD Monitor OTEL 配置向导 ==="
echo ""
echo "此脚本将配置你的 Claude Code，使 bk-fe 系列 skill 的操作日志"
echo "自动上报到团队 SDD 监控服务器。"
echo ""
echo "注意：开启后将上报以下内容："
echo "  · 你输入的 prompt 内容"
echo "  · 工具调用参数（bash 命令、skill 名等）"
echo "  · 完整 API 请求和响应体（含完整对话历史）"
echo ""
read -rp "了解以上内容，继续配置？(y/N): " CONSENT
case "$CONSENT" in
  y | Y) ;;
  *)
    echo "已取消。"
    exit 0
    ;;
esac

echo ""

# ── 采集用户名 ──────────────────────────────────────────────────

while true; do
  read -rp "请输入你的姓名或工号（用于日志归因，例如 zhangsan）: " USER_NAME
  if [[ -n "${USER_NAME//[[:space:]]/}" ]]; then
    break
  fi
  echo "不能为空，请重新输入。"
done

# ── 自动采集机器信息 ────────────────────────────────────────────

HOSTNAME_SHORT=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo "unknown")
HOSTNAME_SHORT="${HOSTNAME_SHORT//[^a-zA-Z0-9._-]/}"   # 移除非法字符
INSTALL_ID="${USER_NAME// /_}-${HOSTNAME_SHORT}"

MACHINE_NAME=$(hostname 2>/dev/null || echo "unknown")

# ── 采集 SDD 路径 ────────────────────────────────────────────────

while true; do
  read -rp "请输入 @requirements 绝对路径（用于识别 work item，必填）: " REQUIREMENTS_ROOT_PATH
  if [[ "$REQUIREMENTS_ROOT_PATH" == /* ]]; then
    break
  fi
  echo "请输入以 / 开头的绝对路径。"
done

read -rp "请输入 @wiki 绝对路径（可选，直接回车跳过）: " WIKI_ROOT_PATH
if [[ -n "$WIKI_ROOT_PATH" && "$WIKI_ROOT_PATH" != /* ]]; then
  echo "错误：@wiki 路径必须是以 / 开头的绝对路径。" >&2
  exit 1
fi

# ── 预览 ────────────────────────────────────────────────────────

echo ""
echo "将写入以下配置："
echo "  server       = ${OTEL_SERVER_URL}"
echo "  user.name    = ${USER_NAME}"
echo "  install_id   = ${INSTALL_ID}  （自动生成，全局唯一）"
echo "  machine.name = ${MACHINE_NAME}"
echo "  requirements = ${REQUIREMENTS_ROOT_PATH}"
echo "  wiki         = ${WIKI_ROOT_PATH:-<未设置>}"
echo ""
read -rp "确认写入 ${SETTINGS_FILE}？(y/N): " CONFIRM
case "$CONFIRM" in
  y | Y) ;;
  *)
    echo "已取消。"
    exit 0
    ;;
esac

# ── 写入 settings.json（合并，不覆盖其他已有配置）──────────────

SETTINGS_FILE="$SETTINGS_FILE" \
OTEL_ENDPOINT="$OTEL_ENDPOINT" \
USER_NAME="$USER_NAME" \
INSTALL_ID="$INSTALL_ID" \
MACHINE_NAME="$MACHINE_NAME" \
REQUIREMENTS_ROOT_PATH="$REQUIREMENTS_ROOT_PATH" \
WIKI_ROOT_PATH="$WIKI_ROOT_PATH" \
python3 - <<'PYEOF'
import json
import os
import sys
from urllib.parse import quote

settings_file = os.path.expanduser(os.environ["SETTINGS_FILE"])
os.makedirs(os.path.dirname(settings_file), exist_ok=True)

if os.path.exists(settings_file):
    with open(settings_file, "r", encoding="utf-8") as f:
        try:
            settings = json.load(f)
        except json.JSONDecodeError as e:
            print(f"错误：{settings_file} 不是合法 JSON，请手动检查后重试。", file=sys.stderr)
            print(f"  原因：{e}", file=sys.stderr)
            sys.exit(1)
else:
    settings = {}

env = settings.setdefault("env", {})

env["CLAUDE_CODE_ENABLE_TELEMETRY"] = "1"
env["OTEL_LOGS_EXPORTER"] = "otlp"
env["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/json"
env["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"] = os.environ["OTEL_ENDPOINT"]
env["OTEL_LOG_USER_PROMPTS"] = "1"
env["OTEL_LOG_TOOL_DETAILS"] = "1"
env["OTEL_LOG_RAW_API_BODIES"] = "1"
env["OTEL_LOGS_EXPORT_INTERVAL"] = "5000"
env.pop("OTEL_LOG_TOOL_CONTENT", None)
env.pop("OTEL_RESOURCE_ATTRIBUTES", None)
env.pop("OTEL_EXPORTER_OTLP_LOGS_HEADERS", None)

def header_value(value):
    # Equivalent safe characters to JavaScript encodeURIComponent().
    return quote(value, safe="-_.!~*'()")

sdd_headers = [
    ("sdd-install-id", os.environ["INSTALL_ID"]),
    ("sdd-user-name", os.environ["USER_NAME"]),
    ("sdd-machine-name", os.environ["MACHINE_NAME"]),
    ("sdd-requirements-root-path", os.environ["REQUIREMENTS_ROOT_PATH"]),
    ("sdd-wiki-root-path", os.environ["WIKI_ROOT_PATH"]),
]
env["OTEL_EXPORTER_OTLP_HEADERS"] = ",".join(
    f"{name}={header_value(value)}" for name, value in sdd_headers if value
)

with open(settings_file, "w", encoding="utf-8") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"已写入 {settings_file}")
PYEOF

# ── 完成提示 ────────────────────────────────────────────────────

echo ""
echo "✓ 配置完成！"
echo ""
echo "请重启 Claude Code，之后使用 bk-fe 系列 skill 时，"
echo "操作日志将自动上报到："
echo "  ${OTEL_ENDPOINT}"
echo "SDD 身份配置已写入 OTEL_EXPORTER_OTLP_HEADERS。"
echo ""
echo "可在以下地址查看你的日志："
echo "  ${OTEL_SERVER_URL}"
echo ""
