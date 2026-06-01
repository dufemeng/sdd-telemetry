import * as dotenv from 'dotenv';

// 仅本地开发：从 server/.env 读环境变量（如 KNOWLEDGE_BASE_ROOT）。
// 生产由 docker compose 注入 env，且镜像内无 .env 文件（.dockerignore 排除 .env），故跳过。
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}
