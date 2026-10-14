# MyDoc 协作说明

自托管的个人工具：共享文档链接、摘录、工作记录（日报/周报/计划）、会议纪要。只有一个用户（就是我），部署在自己的服务器上。

## 沟通方式

- 用中文回复。界面文案、代码注释、提交说明都用中文，说人话，不用术语堆砌。
- 我说「出草稿」：做完 → 跑测试 → 用演示数据截图发给我 → 提交并推到开发分支，等我确认。详细步骤见 `.claude/skills/prototype/SKILL.md`。
- 我说「没问题，合并吧」：把开发分支快进合并到 main（`git push origin <开发分支>:main`），不开 PR。
- 我问「市面上有没有类似的」：先调研同类产品（Linear、flomo、飞书、通义听悟……），列出可借鉴的点并排好优先级，等我挑了再做。
- 汇报时先说结果，再分条说明改了什么、怎么验证的、有哪些限制或没做的；不确定的地方直接说。
- 不要主动开 PR；不要在对话里索要或写出服务器密码、密钥。

## 技术栈和命令

- Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + SQLite（better-sqlite3）+ SWR + zod
- `npm run typecheck`、`npm test`（vitest）、`npm run build`
- 部署：服务器上 `sudo bash /opt/mydoc/deploy.sh`，回退加 `--rollback`

## 代码约定

- 格式化只对改过的文件跑：`npx prettier --print-width 120 --object-wrap collapse --write <文件>`。不要对整个目录跑（会改动无关文件，比如 ui.tsx）。没有 eslint。
- 目录分工：
  - `src/lib/*.ts`：纯逻辑（可测，配 `*.test.ts`）
  - `src/lib/*-repo.ts`：数据库读写
  - `src/lib/schemas.ts`：所有接口的 zod 校验
  - `src/app/api/**/route.ts`：用 `route()` + `readJson(req, schema)`
  - `src/components/ui.tsx`：基础组件（Button、Dialog、Menu、Field……），新界面优先复用
- 数据库迁移在 `src/lib/db.ts` 的 `MIGRATIONS` 数组里，只能往后追加，不能改已有的。
- 小的配置放 `settings` 表（`getSetting(db, key, defaults)` / `setSetting`），不用为它建新表。
- 颜色只用 globals.css 里的语义变量（`bg-surface`、`text-muted`、`bg-warn-soft`、`text-danger-text`……），深色模式自动适配。
- 浏览器本地存储用 `readLocal` / `writeLocal`，键名以 `mydoc.` 开头；表单草稿用 `FormDraft.tsx` 里的 `useFormDraft`。
- 引用语法 `[[log|meeting|snippet|link:id|标题]]`，见 `lib/refs.ts`；新增可引用的内容时同步 backlinks、备份恢复的编号映射（`lib/ref-remap.ts`）。
- 新增数据要考虑进 JSON/ZIP 备份和恢复（`lib/full-backup.ts`）。
- 手机端要能用：16px 边距、不能横向滚动；改界面时同时看桌面和手机宽度。

## 提交

- 提交前 `rm -f AGENTS.md`（环境自动生成的，不提交）。
- 提交说明：第一行概括，下面分条写改了什么，用中文。
