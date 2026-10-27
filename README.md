# 家教题库系统

## 方法推荐条件核验与独立评测

方法库的策略建议和一题多解比较新增标准式条件核验：支持有限区间内二次／一次／常函数的参数约束，以及正区间内 `p*x+q/x` 的等号可达性与受限最值。分别处理全称／存在、严格不等式、开闭端点及次数退化；输入冲突保留待核验，不自动审核方法或题目关系。

`npm run evaluate:methods` 导出冻结题包、三组离线预测、盲评题目和教师标注模板；导入外部标签后分开发／测试集评分。默认研发样例无独立标签，不生成准确率。使用范围和盲评流程见 [方法推荐条件核验与独立评测](docs/方法推荐条件核验与独立评测.md)。

## 数学方法库 2.0 与知识图谱

`/math-methods` 支持公共方法参考、教师私有方法卡、AI 补全识别信号与思考过程，以及参数讨论和基本不等式的23张核心策略草案。新增方法网络的搜索、专题筛选、邻居展开与双方法比较；规则决策器依据教师确认的条件解释推荐和边界，不自动生成已验证的题目关系。AI 建议与填入后的方法正文均支持数学公式排版，正文使用通栏和分项列表阅读。

`/knowledge-graph/star-map` 提供知识星图；`/gaokao` 提供高考数学资料浏览和题目工作台。公共资料的固定版本、来源与许可保留在 `data/open-math/`、`data/gaokao/sources/`，私有题库仍沿用原有 canonical 身份及人工审核流程。

方法库说明见 [阶段6交付记录](docs/method-strategies-phase-6.md)。其他环境升级前先备份，再核对并应用尚未执行的迁移（当前源码包含至 `0025_method_strategy_identity.sql`）；新策略及推断关系均保留候选状态。GitHub 仅保存项目源码和公共资料，本机数据库、密钥、上传对象及备份应单独保管。

## 题目详情与统一题库解析

统一题库详情先显示可放大的原题，随后是解析编辑区；知识点、方法提示及方法卡/图谱入口集中在侧栏，原有解析与来源默认折叠。解析可主动生成、重新生成、修改、核对和自动保存，沿用模型配置、取消与冲突草稿保护。

新增 `canonical_question_explanations` 按题目内容版本保存统一题库独立解析，不覆盖原试卷或学生归档解析。接口为 `/api/math-library/[id]/explanation`，要求登录、可访问的题库范围及当前题目内容；写入检查来源与解析修订冲突。迁移 `0022_neat_omega_flight.sql` 本机已在停服备份后应用，其他环境需核对尚未执行的迁移。离线应用脚本 `scripts/apply-canonical-explanations-local.mjs`；定向测试 `tests/canonical-explanation.test.ts`。

## 统一数学题库回收站

`/math-library` 每张图片卡片提供“移入回收站”，确认后从题库检索、数量统计及新选题列表移除。页面右上方“回收站”可查看原题图并恢复。该操作保留题目身份、原始来源、图片、学生记录及已有教案固定版本引用，不提供永久删除。

新增迁移 `drizzle/0021_lively_pride.sql` 仅增加 `math_library_trash` 记录表。本机已在停止项目服务并备份后应用；其他环境先检查实际迁移状态，再应用未执行的迁移。离线本地应用脚本为 `scripts/apply-library-trash-local.mjs`，要求明确传入本项目 D1 SQLite 路径，检查旧表哈希、外键和完整性。定向测试为 `tests/math-library-trash.test.ts`。

## 智能备课质量检查（5B-1）

原智能备课编辑器新增快速规则检查、教师主动触发的 AI 深度分析、问题定位及局部修改建议。接受前显示原文对比，修改后报告失效，保存沿用版本保护；未完成结构化草稿可保存，确认及导出保持严格校验。无新增数据库迁移。功能和验证边界见 [5B-1 文档](docs/智能备课-阶段5B-1.md)。

“AI 智能备课”入口为 `/lesson-plans`：5A-1～5A-4 已实现手动任务、固定 Canonical 题目版本、可解释选题、结构化 AI 教案及单环节编辑、历史保存和教师/学生版 Word 导出。失败草稿可下载/导入 JSON 恢复文件，冲突草稿可另存为副本。本机此前已在完整备份后应用 `0017_lesson_plans.sql`；其他环境须先核验已有迁移和身份入口。5A-5 已完成无学生数据的独立服务流程与两次真实模型调用、异常检查及浏览器下载；完整界面流程、Microsoft Word 及本轮学生版全页视觉检查仍待验。详见 [5A-1 操作与设计](docs/智能备课-阶段5A-1.md)及 [5A-5 验收记录](docs/智能备课-阶段5A-5.md)。

套卷现在默认先“快速分类”，只保存题干识别与章节、知识点、题型、难度建议；需要讲解时再选择“生成此题完整解析”或“生成所选题目的完整解析”。分类和解析均可独立保存，后续详解复用已有分类，分类完成不要求同时生成详解。

阶段 3A“批量导入试卷”已集成到 `/papers` 顶部：一次选择多个数学 PDF，以本地文本层切题，保存逐文件/逐题统计、文字重复提示和待审核候选；人工核对后安全关联私有 Canonical。双击根目录 `Start-Tutor.cmd` 启动，访问 `http://localhost:5173/papers`。操作与限制见 [批量 PDF 导入](docs/批量PDF导入-阶段3A.md)。本机已在备份后执行迁移 `0016_paper_import_batches.sql`。

新增“套卷复习”入口 `/papers`：独立保存整卷 PDF 或整页图片，按题号选择全卷或指定题目（如 `1,3,7-10`），预览、调整裁切和跨页拼接后批量生成分类建议与解析。每完成一题即保存，单题失败可重试；无需绑定学生。使用与数据说明见 [套卷复习与解析持久化](docs/套卷复习与解析持久化-2026-10-04.md)。本地数据库先备份，再应用新增的 `drizzle/0013_clumsy_cammi.sql`；本机已执行。

题目详解现在生成成功即写入数据库，不再要求另点保存；有效的手工修改自动保存，未完成编辑保留在本机草稿。版本冲突会阻止覆盖其他页面的更新。

题目详情页的原图下方提供“题目详解”：使用当前模型根据原图和题干生成答案、解题思路、分步解析、讲解提示及易错点，支持教师修改、核对和独立保存。操作与验收说明见 [题目详解与教师备课](docs/题目详解-2026-10-04.md)。已有本地数据库先备份，再应用尚未执行的 `drizzle/0012_past_northstar.sql`。

面向中学数学家教场景的个性化题库与教学记录系统。教师可维护学生档案、上传题目并确认 AI 分类，记录讲解与复习过程，回看学习时间线并导出单个学生的数据。

系统以教师确认的分类作为题库和统计依据。AI 服务不可用时仍可人工录题；题目记录会保留分类来源。学习统计描述已记录的题目和教学活动，不直接推断学生掌握程度。

主要技术组成：React/Vinext 页面与 API、Drizzle ORM、Cloudflare D1 结构化数据、R2 题目图片存储，以及可配置的 OpenAI 兼容视觉模型服务。

毕业设计材料：

- [系统设计说明](docs/系统设计说明.md)
- [需求与验收追踪](docs/毕业设计需求与验收追踪.md)
- [阶段验收记录](docs/验收记录-2026-09-27.md)
- [AI 识别性能与合成样本基准](docs/performance-2026-09-27.md)
- [诊断闭环深化与验收](docs/深化验收-2026-09-30.md)
- [教学策略回放评测](docs/教学回放评测-2026-09-30.md)

“教学评测”页面可逐时间点比较证据驱动策略与简化直接讲解基线，并下载结构化报告。`npm run evaluate:teaching` 在本机运行同一套固定合成场景，生成 `outputs/teaching-evaluation.json` 与 Markdown 报告，不访问学生数据库或调用模型。预期由研发者编写，结果用于功能回归和后续实验准备，不作为教学收益证明。

本轮深化支持诊断题逐题记录、原始错题与检查作答的显式关联，以及画像和智能体建议的原始证据追溯。教师采用诊断方案后进入题目页，在“本次诊断题”中选择题目并保存学生真实作答；干预后检测和间隔复查也可指定要验证的原始作答。系统只依据明确关联的记录更新错因状态，不把同知识点的其他正确作答自动视为改善。

数据库迁移新增至 `drizzle/0010_slippery_ultragirl.sql`。已有数据库先备份，再只应用尚未执行的迁移；旧作答保留，关联字段为空，避免虚构历史联系。隔离接口验收使用 `.test-runtime/evidence-fixture`，运行方式见上述验收文档。

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. `.sites-runtime/` and `.wrangler/` are ignored by Git, but `.wrangler/state` contains important local business data: D1 databases and R2 uploaded images/files with their object mappings. **Do not delete `.wrangler/state` before creating and validating a complete backup.** Other Wrangler logs and tool caches need not all be retained permanently. See [本地数据备份与恢复](docs/本地数据备份与恢复.md); run `node scripts/backup-project-data.mjs` for a complete backup, rather than relying on the D1-only helper.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## 学习记录升级（迁移 0002–0004）

学习历史保存在 `inquiries`、`teaching_records`、`reviews`、`review_results` 和 `question_relations`，通过学生已有题目关联。提问、讲解和复查结果采用追加记录；教师修订讲解时，新记录指向原记录。历史题目的上传时间不会被回填为提问事件。`questions.image_hash` 与 `submission_id` 支持 SHA-256 同图候选和归档重试去重；首次再次上传时，系统会按需为旧题原图计算哈希。

将更改部署到已有 D1 数据库前，先备份数据库，并只按顺序应用尚未执行的迁移：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0002_lying_steve_rogers.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0003_short_the_santerians.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0004_worried_madrox.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0005_classification_source.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0006_freezing_iron_lad.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0007_closed_tag.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0008_majestic_nextwave.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0009_chief_krista_starr.sql
```

本地开发库也需要应用相同的待执行迁移，参数使用 `--local --persist-to .wrangler/state`。不要重放已经执行的 SQL。当前本机 D1 已完成 0002–0009；0009 应用前的快照保存在 `.wrangler/backups/before-diagnostic-plans-20260928.sqlite`。迁移 0006–0008 只新增和扩展作答证据结构；0009 新增独立的诊断方案草案，不改写既有学习记录。如在其他本地环境补迁移，应按缺失编号依次执行，例如：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_classification_source.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_freezing_iron_lad.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0007_closed_tag.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0008_majestic_nextwave.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0009_chief_krista_starr.sql
```

学生详情页提供活动时间线、章节/知识点与日期筛选、基于教师记录的错误原因和复查分析，以及仅限当前学生的多工作表 `.xlsx` 导出。所有导出内容以文字单元格写入，不执行用户输入的公式。

## AI 失败时人工归档（迁移 0005）

AI 识别服务不可用时，教师仍可手工填写题干和分类并完成归档。`questions.classification_source` 记录 `live_ai`、`demo`、`manual` 或 `legacy` 来源；人工归档的 `ai_classification` 保存 JSON `null`，不会把教师输入伪装成模型输出。部署前先备份数据库，再按顺序应用尚未执行的迁移；本地和远程示例命令见上面的迁移说明。

毕业设计需求与验收追踪表见 [`docs/毕业设计需求与验收追踪.md`](docs/毕业设计需求与验收追踪.md)。
