# 公司服务器知识库挂载部署指南

让 dashboard 的「交互抽屉 → Read 类 wiki 标签 → 查看知识库文档内容」在公司服务器生效。

## 它怎么工作（一句话）

dashboard 存的是**采集机的绝对路径**（如同事的 `/Users/zhangsan/.../bk-fe-knowledge-trade/...`），服务器用不了。后端只取「**仓库名 + 仓库内相对路径**」，重新拼到服务器自己的 `KNOWLEDGE_BASE_ROOT` 再只读读取。所以服务器只需把三个知识库 clone 到一个固定目录、挂进 server 容器即可。

**弱依赖**：没配 / 没 clone / 文件缺失都只是降级提示，不影响 dashboard 其它功能。

## 目录结构

知识库放在**部署目录下、与 `deploy-docker.sh` 同级**的 `knowledge/`：

```
~/project/sdd-telemetry-deploy/        # 部署目录（运行 deploy-docker.sh 处）
  ├── deploy-docker.sh
  ├── compose.prod.yml
  ├── .env                             # 部署脚本自动维护
  ├── releases/                        # 镜像包
  └── knowledge/                       # ← 知识库放这（脚本自动创建）
      ├── bk-fe-knowledge-trade/       # 交易
      ├── bk-fe-knowledge-wealth/      # 理财
      └── bk-fe-knowledge-loan/        # 贷款
```

容器内：`server` 以**只读**方式把 `knowledge/` 挂为 `/knowledge`，`KNOWLEDGE_BASE_ROOT=/knowledge`。

> ⚠️ **文件夹名必须与采集端一致**——即默认 `git clone <仓库地址>` 生成的仓库名 `bk-fe-knowledge-trade` / `bk-fe-knowledge-wealth` / `bk-fe-knowledge-loan`。后端按采集到的仓库名去 `/knowledge/<仓库名>/...` 找；名字对不上 → `repo_missing`。

## 步骤 1：部署（会自动建好空的 `knowledge/`）

按 `README.md` 的离线部署流程跑一次。`deploy-docker.sh` 会自动 `mkdir -p ./knowledge` 并把路径写进 `.env`，无需手动建：

```bash
cd ~/project/sdd-telemetry-deploy
# 包已在部署目录时，零摩擦冷启动（不用传 VERSION / secret）
./deploy-docker.sh
```

部署完，`knowledge/` 是空目录 → 此时点 wiki 标签会显示 `repo_missing`（正常，还没 clone）。

## 步骤 2：clone 三个知识库

进入 `knowledge/`，用**和同事本机一致的仓库地址**克隆，保持默认文件夹名：

```bash
cd ~/project/sdd-telemetry-deploy/knowledge
git clone <交易知识库地址>   # → bk-fe-knowledge-trade
git clone <理财知识库地址>   # → bk-fe-knowledge-wealth
git clone <贷款知识库地址>   # → bk-fe-knowledge-loan
ls    # 应看到三个 bk-fe-knowledge-* 目录
```

**不用重启容器**：`server` 是按请求实时 `fs` 读文件，只读卷是宿主目录的实时视图，clone 完即时生效。（仅当改 `KNOWLEDGE_BASE_ROOT` 或挂载本身才需重启。）

## 步骤 3：验证

登录 dashboard → 任一需求/交互抽屉 → 工具调用时间线里点 **Read** 类 `wiki` 标签：

- 命中 → 渲染出 markdown 文档内容。
- 仍 `repo_missing` → 检查文件夹名是否为 `bk-fe-knowledge-*`（与采集端一致）。
- `file_missing` → 该文档在服务器这份 clone 里不存在（可能版本落后，见下）。

## 更新知识库（免重启）

知识库有更新时，在服务器 `git pull` 即可，dashboard 立即读到新内容：

```bash
cd ~/project/sdd-telemetry-deploy/knowledge
for d in bk-fe-knowledge-*; do (cd "$d" && git pull); done
```

可挂个 cron 定时 pull（可选）：

```bash
# crontab -e —— 每天 03:00 更新
0 3 * * * cd ~/project/sdd-telemetry-deploy/knowledge && for d in bk-fe-knowledge-*; do (cd "$d" && git pull -q); done
```

## 配置项参考

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `KNOWLEDGE_BASE_ROOT` | `/knowledge` | 容器内知识库根（一般不用改） |
| `KNOWLEDGE_BASE_HOST_DIR` | `./knowledge` | 宿主机知识库目录（相对部署目录）；放别处时改它 |
| `WIKI_CONTENT_MAX_BYTES` | `524288`（512KB） | 单文档读取上限，超出按 `truncated` 截断 |

放到别的宿主路径示例（compose 用相对路径相对部署目录解析，绝对路径也支持）：

```bash
# .env 里（或部署时传入）
KNOWLEDGE_BASE_HOST_DIR=/data/knowledge
```

## 故障排查（按 Modal 里的提示）

| Modal 提示 | reason | 排查 |
| --- | --- | --- |
| 服务器未配置知识库目录 | `not_configured` | `server` 容器没拿到 `KNOWLEDGE_BASE_ROOT`；确认用的是带本功能的镜像版本、compose 含该 env |
| 未找到知识库 `<repoName>` | `repo_missing` | `/knowledge/<repoName>` 不存在；多半是文件夹名和采集端不一致，或还没 clone |
| 文档不在服务器 | `file_missing` | 该相对路径文件不存在；多半是服务器 clone 版本落后，`git pull` |
| 目录/检索，无单文件内容 | `not_readable_action` | 该次是 glob/grep，本就没有单一文件可看（Read 才可点，正常不可达） |

容器内自查路径是否真的挂上了：

```bash
docker compose --env-file .env -f compose.prod.yml exec server ls /knowledge
# 应列出三个 bk-fe-knowledge-* 目录
```

## 重要约束

- **知识库不入仓、不入镜像**：在仓库目录与构建上下文之外，且 `.dockerignore` 排除 `.env`；Mac 打的镜像只有应用代码，知识库内容运行时由服务器挂卷提供。
- **只读挂载（`:ro`）**：容器不会改你的知识库。
- **生产由 compose 注入 env**，与本机 dev 的 `server/.env` 互不干扰（`dotenv` 在 `NODE_ENV=production` 下跳过）。

## 本机 dev 对照（非 docker）

dev 模式直接读 `process.env`，把变量写进 gitignored 的 `server/.env`，改完重启 server：

```bash
# server/.env
KNOWLEDGE_BASE_ROOT=/Users/<你>/Desktop/lm/bk-fe-sdd
```

```bash
pnpm restart:server
```
