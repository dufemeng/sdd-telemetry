#!/usr/bin/env bash
# 评测集 import 冒烟脚本 —— 部署后在目标机运行,一键验证 eval 链路通 + cleaned>0。
#
# 验证项:
#   1. serving config manifest.evaluation 已激活(migration 生效)
#   2. import 能跑通(不 409 / 500)
#   3. cleaned 样本数 > 0(真实日志有可判分 prompt)
#
# 用法:
#   SUPERADMIN_USERNAME=admin SUPERADMIN_PASSWORD='xxx' \
#   API_BASE=http://127.0.0.1:4318 PROFILE_ID=sdd-default \
#   bash scripts/eval-import-smoke.sh
#
# 可选环境变量:
#   CAPABILITY_CODE  默认 design(sdd-default 演示默认值)
#   CLEAN_FROM       导入前是否清空(1=先 DELETE FROM eval_items WHERE profile_id=?)。默认 0(不清空,验证幂等)。
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:4318}"
PROFILE_ID="${PROFILE_ID:-sdd-default}"
CAPABILITY_CODE="${CAPABILITY_CODE:-design}"
USERNAME="${SUPERADMIN_USERNAME:?SUPERADMIN_USERNAME 未设置}"
PASSWORD="${SUPERADMIN_PASSWORD:?SUPERADMIN_PASSWORD 未设置}"

echo "==> 目标: $API_BASE  profile: $PROFILE_ID  capability: $CAPABILITY_CODE"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# 1. 登录
echo "==> 登录..."
LOGIN_HTTP=$(curl -sS -o /dev/null -c "$COOKIE_JAR" -X POST "$API_BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(printf '{"username":"%s","password":"%s"}' "$USERNAME" "$PASSWORD")" \
  -w '%{http_code}')
if [[ "$LOGIN_HTTP" != "200" ]]; then
  echo "❌ 登录失败 (HTTP $LOGIN_HTTP)。检查 SUPERADMIN_USERNAME/PASSWORD。"
  exit 1
fi

ROLE=$(curl -sS -b "$COOKIE_JAR" "$API_BASE/api/auth/me" | sed -n 's/.*"role":"\([^"]*\)".*/\1/p')
if [[ "$ROLE" != "super_admin" ]]; then
  echo "❌ 账号不是 super_admin (role=$ROLE),eval 端点会被 403。"
  exit 1
fi
echo "   已登录 (super_admin)"

# 2. 导入
echo "==> 导入 $PROFILE_ID / $CAPABILITY_CODE ..."
IMPORT_BODY=$(printf '{"profileId":"%s","capabilityCode":"%s"}' "$PROFILE_ID" "$CAPABILITY_CODE")
IMPORT_HTTP=$(curl -sS -b "$COOKIE_JAR" -o /tmp/eval-import-out.json -w '%{http_code}' \
  -X POST "$API_BASE/api/eval/items/import-from-logs" \
  -H 'Content-Type: application/json' -d "$IMPORT_BODY")

if [[ "$IMPORT_HTTP" == "409" ]]; then
  CODE=$(sed -n 's/.*"code":"\([^"]*\)".*/\1/p' /tmp/eval-import-out.json)
  echo "❌ 导入 409 ($CODE)。若 EVAL_PROFILE_NOT_ENABLED → migration 未生效或 profile 未发布;"
  echo "   若 EVAL_NO_PROJECTION_RUN → 该 profile 无当前投影,需先有真实遥测。"
  cat /tmp/eval-import-out.json; echo
  exit 1
fi
if [[ "$IMPORT_HTTP" != "200" ]]; then
  echo "❌ 导入失败 (HTTP $IMPORT_HTTP):"
  cat /tmp/eval-import-out.json; echo
  exit 1
fi

# 3. 解析统计(纯 sed,无 jq 依赖)
extract() { sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p" /tmp/eval-import-out.json | head -1; }
SCANNED=$(extract scannedCount)
CANDIDATE=$(extract candidateCount)
INSERTED=$(extract insertedCount)
REFRESHED=$(extract refreshedCount)
UPGRADED=$(extract upgradedCount)
SK_NO_PROMPT=$(extract skippedNoPromptCount)
SK_OVERSIZE=$(extract skippedOversizeCount)
SK_NO_ARTIFACT=$(extract skippedNoArtifactTypeCount)
SK_DELETED=$(extract skippedDeletedCount)

echo "   scanned=$SCANNED candidate=$CANDIDATE inserted=$INSERTED refreshed=$REFRESHED upgraded=$UPGRADED"
echo "   skipped: noPrompt=$SK_NO_PROMPT oversize=$SK_OVERSIZE noArtifactType=$SK_NO_ARTIFACT deleted=$SK_DELETED"

# 4. 决断: cleaned>0
ACCEPTED=$((INSERTED + REFRESHED + UPGRADED))
if [[ "$ACCEPTED" -eq 0 && "$SK_DELETED" -gt 0 ]]; then
  echo "⚠️  本次 0 新增/刷新,但 skippedDeleted=$SK_DELETED —— 这些样本之前已删除(tombstone)。"
  echo "   若需验证全新导入,先在 DB 清理: DELETE FROM eval_items WHERE profile_id='$PROFILE_ID';"
  echo "   (演示数据本身可复现,这不是错误)"
fi

if [[ "$INSERTED" -gt 0 ]]; then
  echo "✅ 导入成功: $INSERTED 条新 cleaned 样本。演示链路通。"
  exit 0
fi
if [[ "$REFRESHED" -gt 0 || "$UPGRADED" -gt 0 ]]; then
  echo "✅ 导入幂等: $REFRESHED 刷新 + $UPGRADED 升级(之前已导入)。演示链路通。"
  exit 0
fi

echo "❌ cleaned=0: scanned=$SCANNED 但无候选进评测集。"
if [[ "$SCANNED" -eq 0 ]]; then
  echo "   scanned=0 说明该 profile 当前投影无 capability usage,或正文已被保留策略清理。"
  echo "   用真实 Claude Code 完成一次 $CAPABILITY_CODE 调用,等 ingest/worker/projection 更新后重试。"
fi
exit 1
