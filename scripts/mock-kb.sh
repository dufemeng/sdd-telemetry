#!/usr/bin/env bash
set -euo pipefail
KB="${1:-/tmp/mock-kb}"
echo "🗑  清理旧 mock KB: $KB"
rm -rf "$KB"

DEAD=$(date -v-45d +%Y%m%d%H%M.%S)
NEW=$(date -v-5d +%Y%m%d%H%M.%S)
RECENT=$(date -v-2d +%Y%m%d%H%M.%S)

md() {
  local repo=$1 domain=$2 subpath=$3 cat=${4:-recent}
  local dir="$KB/bk-fe-knowledge-$repo/domain-$domain"
  local fname
  fname=$(basename "$subpath")
  dir="$dir/$(dirname "$subpath")"
  mkdir -p "$dir"
  local f="$dir/$fname"
  local name="${fname%.md}"
  cat >"$f" <<EOF
# ${name}

> 所属领域：${domain} · 所属仓库：${repo}

## 概述

${domain} 领域下 ${name} 的业务规则与实现细节。
本文为 mock 数据，用于本地开发验证知识库分析功能。

## 核心规则

- 规则一：mock 数据，仅供验证
- 规则二：覆盖热门/冷门/死知识/新增未读场景
- 规则三：实际内容请参考线上知识库

## 注意事项

> 本文件可能包含过期内容，请以线上版本为准。
EOF
  case "$cat" in
    dead)  touch -t "$DEAD" "$f" ;;
    new)   touch -t "$NEW"  "$f" ;;
    *)     ;; # keep current mtime (nowish, not new/dead)
  esac
}

echo "📦 生成 mock 知识库文件…"

# ── trade (186 files) ──────────────────────────────────────
# cashier - 标杆领域，hot
md trade cashier business/INDEX.md          hot
md trade cashier business/unfreeze.md       hot
md trade cashier business/refund-flow.md    hot
md trade cashier business/batch-pay.md
md trade cashier business/freeze-rules.md
md trade cashier business/daily-recon.md
md trade cashier business/error-codes.md
md trade cashier business/channel-routing.md
md trade cashier business/timeout-handling.md
md trade cashier business/fee-split.md
md trade cashier business/compliance-check.md
md trade cashier business/legacy-refund.md      dead
md trade cashier business/old-batch-v1.md        dead
md trade cashier business/new-batch-v2.md        new
md trade cashier business/new-qr-pay.md          new
md trade cashier system/apps/cashier-web/README.md
md trade cashier system/apps/cashier-web/CONFIG.md
md trade cashier system/apps/cashier-web/DEPLOY.md   dead
md trade cashier system/apps/cashier-web/MOCK.md
md trade cashier system/apps/cashier-svc/README.md
md trade cashier system/apps/cashier-svc/API.md
md trade cashier system/apps/cashier-svc/GRPC.md
md trade cashier system/apps/cashier-admin/README.md
md trade cashier system/INFRASTRUCTURE.md

# settlement
md trade settlement business/INDEX.md        hot
md trade settlement business/settlement-flow.md hot
md trade settlement business/t1-reconciliation.md
md trade settlement business/cross-border.md
md trade settlement business/auto-settle.md
md trade settlement business/manual-intervention.md
md trade settlement business/netting-rules.md
md trade settlement business/failover.md
md trade settlement business/clearing-window.md
md trade settlement business/legacy-settlement.md dead
md trade settlement business/new-realtime.md       new
md trade settlement system/apps/settlement-engine/README.md
md trade settlement system/apps/settlement-engine/CONFIG.md
md trade settlement system/apps/settlement-engine/MONITOR.md
md trade settlement system/apps/settlement-batch/README.md
md trade settlement system/apps/settlement-batch/SCHEDULER.md
md trade settlement system/INFRASTRUCTURE.md

# market-data
md trade market-data business/INDEX.md          hot
md trade market-data business/price-feed.md
md trade market-data business/market-hours.md
md trade market-data business/instrument-mapping.md
md trade market-data business/data-vendor.md
md trade market-data business/realtime-vs-delayed.md
md trade market-data business/deprecated-feed.md dead
md trade market-data system/apps/market-gateway/README.md
md trade market-data system/apps/market-gateway/CONFIG.md
md trade market-data system/apps/market-cache/README.md
md trade market-data system/INFRASTRUCTURE.md

# reconciliation
md trade reconciliation business/INDEX.md
md trade reconciliation business/daily-flow.md
md trade reconciliation business/exception-handling.md
md trade reconciliation business/auto-recon-rules.md
md trade reconciliation business/channel-recon.md
md trade reconciliation business/multi-currency.md
md trade reconciliation business/legacy-recon.md   dead
md trade reconciliation system/apps/recon-svc/README.md
md trade reconciliation system/apps/recon-svc/RULES.md
md trade reconciliation system/apps/recon-worker/README.md dead
md trade reconciliation system/INFRASTRUCTURE.md     dead

# trade-core
md trade trade-core business/INDEX.md            hot
md trade trade-core business/order-lifecycle.md   hot
md trade trade-core business/matching-rules.md
md trade trade-core business/fee-calculation.md
md trade trade-core business/position-management.md
md trade trade-core business/risk-limits.md
md trade trade-core business/circuit-breaker.md
md trade trade-core business/margin-rules.md
md trade trade-core business/order-types.md
md trade trade-core business/new-algo-trading.md  new
md trade trade-core system/apps/order-manager/README.md
md trade trade-core system/apps/order-manager/API.md
md trade trade-core system/apps/matching-engine/README.md
md trade trade-core system/apps/matching-engine/PERF.md
md trade trade-core system/apps/trade-gateway/README.md
md trade trade-core system/INFRASTRUCTURE.md

# clearing
md trade clearing business/INDEX.md
md trade clearing business/clearing-flow.md
md trade clearing business/collateral.md
md trade clearing business/margin-call.md
md trade clearing business/mark-to-market.md
md trade clearing business/default-procedure.md
md trade clearing business/new-t1.md              new
md trade clearing system/apps/clearing-svc/README.md
md trade clearing system/apps/clearing-svc/CONFIG.md
md trade clearing system/apps/clearing-admin/README.md dead
md trade clearing system/INFRASTRUCTURE.md

# ── loan (88 files) ────────────────────────────────────────
# credit-review
md loan credit-review business/INDEX.md             hot
md loan credit-review business/scoring-model.md     hot
md loan credit-review business/risk-grading.md
md loan credit-review business/document-checklist.md
md loan credit-review business/auto-approval.md
md loan credit-review business/manual-review.md
md loan credit-review business/credit-limit.md
md loan credit-review business/blacklist.md
md loan credit-review business/deprecated-scoring.md  dead
md loan credit-review business/new-ai-scoring.md      new
md loan credit-review system/apps/credit-engine/README.md
md loan credit-review system/apps/credit-engine/MODEL.md
md loan credit-review system/apps/credit-api/README.md
md loan credit-review system/INFRASTRUCTURE.md

# risk-control
md loan risk-control business/INDEX.md
md loan risk-control business/risk-policy.md
md loan risk-control business/fraud-detection.md
md loan risk-control business/post-lending-monitor.md
md loan risk-control business/early-warning.md
md loan risk-control business/collection-trigger.md
md loan risk-control business/legacy-risk-rules.md dead
md loan risk-control system/apps/risk-engine/README.md
md loan risk-control system/apps/risk-engine/RULES.md
md loan risk-control system/apps/risk-admin/README.md dead
md loan risk-control system/INFRASTRUCTURE.md

# loan-mgmt
md loan loan-mgmt business/INDEX.md
md loan loan-mgmt business/loan-lifecycle.md
md loan loan-mgmt business/repayment-schedule.md
md loan loan-mgmt business/prepayment.md
md loan loan-mgmt business/extension-renewal.md
md loan loan-mgmt business/interest-calc.md
md loan loan-mgmt business/new-flexible-repay.md new
md loan loan-mgmt system/apps/loan-svc/README.md
md loan loan-mgmt system/apps/loan-svc/STATE-MACHINE.md
md loan loan-mgmt system/apps/loan-admin/README.md
md loan loan-mgmt system/INFRASTRUCTURE.md

# collection
md loan collection business/INDEX.md
md loan collection business/collection-flow.md
md loan collection business/overdue-grading.md
md loan collection business/auto-reminder.md
md loan collection business/legal-action.md
md loan collection system/apps/collection-svc/README.md
md loan collection system/apps/collection-worker/README.md dead
md loan collection system/INFRASTRUCTURE.md

# ── wealth (68 files) ──────────────────────────────────────
# portfolio
md wealth portfolio business/INDEX.md
md wealth portfolio business/portfolio-construction.md
md wealth portfolio business/rebalance-strategy.md
md wealth portfolio business/risk-budgeting.md
md wealth portfolio business/asset-allocation.md
md wealth portfolio business/tax-optimization.md
md wealth portfolio business/new-esg.md             new
md wealth portfolio system/apps/portfolio-engine/README.md
md wealth portfolio system/apps/portfolio-engine/ALGO.md
md wealth portfolio system/apps/portfolio-api/README.md
md wealth portfolio system/INFRASTRUCTURE.md

# advisor
md wealth advisor business/INDEX.md
md wealth advisor business/suitability.md
md wealth advisor business/recommendation-engine.md
md wealth advisor business/client-profiling.md
md wealth advisor business/compliance-rule.md
md wealth advisor business/product-mapping.md
md wealth advisor business/new-robo-advisor.md new
md wealth advisor system/apps/advisor-svc/README.md
md wealth advisor system/apps/advisor-svc/MODEL.md
md wealth advisor system/apps/advisor-admin/README.md dead
md wealth advisor system/INFRASTRUCTURE.md

# fund-ops
md wealth fund-ops business/INDEX.md
md wealth fund-ops business/fund-lifecycle.md
md wealth fund-ops business/nav-calculation.md
md wealth fund-ops business/subscription-redemption.md
md wealth fund-ops business/fee-structure.md
md wealth fund-ops business/new-index-fund.md new
md wealth fund-ops system/apps/fund-svc/README.md
md wealth fund-ops system/apps/fund-svc/SETTLEMENT.md
md wealth fund-ops system/INFRASTRUCTURE.md

# ── .git HEAD for snapshot ref ──
for repo in trade loan wealth; do
  mkdir -p "$KB/bk-fe-knowledge-$repo/.git/refs/heads"
  echo "abc1234$(echo $repo | cksum | cut -c1-4)" > "$KB/bk-fe-knowledge-$repo/.git/refs/heads/main"
  echo "ref: refs/heads/main" > "$KB/bk-fe-knowledge-$repo/.git/HEAD"
done

TRADE=$(find "$KB/bk-fe-knowledge-trade" -name '*.md' | wc -l | tr -d ' ')
LOAN=$(find  "$KB/bk-fe-knowledge-loan"  -name '*.md' | wc -l | tr -d ' ')
WEALTH=$(find "$KB/bk-fe-knowledge-wealth" -name '*.md' | wc -l | tr -d ' ')
TOTAL=$((TRADE + LOAN + WEALTH))
echo ""
echo "✅ Mock KB 创建完成: $TOTAL 篇 (交易 $TRADE / 融资 $LOAN / 理财 $WEALTH)"
echo "   位置: $KB"
echo ""
echo "启动命令："
echo "  KNOWLEDGE_BASE_ROOT=$KB pnpm dev:server"
