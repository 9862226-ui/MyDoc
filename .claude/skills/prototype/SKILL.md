---
name: prototype
description: MyDoc 的「出草稿」流程：实现功能 → 测试 → 启动开发服务器用演示数据截图 → 提交推到开发分支 → 用中文汇报并等确认合并。用户说「出草稿」「先做 X，出草稿吧」或要做新功能、改界面时使用。
---

# 出草稿

目标：让我只看截图和说明就能判断要不要合并。

## 1. 先弄清范围

- 我列了编号（「先做 1-5」）就只做这些，没点到的不顺手做。
- 改动大或有多种做法时，先用一两句话说打算怎么做；小改动直接做。

## 2. 实现

- 遵守 CLAUDE.md 的代码约定（迁移只追加、schemas 校验、复用 ui.tsx、语义颜色、中文文案）。
- 纯逻辑放 `src/lib`，同时补 vitest 测试；界面放 `src/components`。
- 只对改过的文件跑 prettier（参数见 CLAUDE.md）。

## 3. 验证

1. `npx tsc --noEmit -p .` 和 `npx vitest run` 全部通过。
2. 启动开发服务器（独立的数据目录，不碰真实数据）：
   ```sh
   APP_PASSWORD=test123 DATA_DIR=<临时目录>/data setsid npx next dev -p 3101 > <临时目录>/dev.log 2>&1 &
   ```
   等 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3101/login` 返回 200。停服务器时按 PID 杀，不要用会匹配到自己命令行的 `pkill -f`。
3. 用 Playwright 写脚本（放临时目录，不放仓库）：
   - 云端环境里用 `createRequire` 加载 `/opt/node22/lib/node_modules/playwright`，不要 `playwright install`。
   - 先登录：打开 `/login`，填密码，回车。
   - 演示数据用像样的中文业务内容（项目周会、接口文档、压测……），不要 test/foo，也不要真实个人信息。
   - 把新功能的主要路径都点一遍，记下 `pageerror` 和 console error；复制类功能用 `addInitScript` 拦截 `navigator.clipboard.writeText` 检查内容；断网用 `context.setOffline(true)`。
   - 桌面（1440×1000）和手机（390×844，isMobile）各截图，检查 `document.documentElement.scrollWidth > innerWidth`（不能横向滚动）。
   - 反复跑脚本前，先通过接口删掉上次留下的测试数据，避免重复数据干扰判断；跑完也清掉。
4. 自己看一遍截图：文字挤压、换行难看、措辞不通顺的当场改掉再截。

## 4. 提交推送

- `rm -f AGENTS.md`，`git add -A`，中文提交说明（第一行概括 + 分条）。
- `git push -u origin <开发分支>`。不开 PR，不推 main。

## 5. 汇报（中文）

- 用 SendUserFile 发截图（display: render），一句话说明每张是什么。
- 正文：按我给的编号逐条说做了什么、具体表现；再说验证情况（测试数、走过的流程）；最后列限制和没做的、可以接着做的。
- 结尾：「确认没问题就说"合并"」。

## 6. 我说「合并」

```sh
git fetch origin main && git merge-base --is-ancestor origin/main HEAD && git push origin <开发分支>:main
```

不是快进时先把 main 合进开发分支再推。合并后提醒部署命令：`sudo bash /opt/mydoc/deploy.sh`。
