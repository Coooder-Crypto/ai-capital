# AI Capital Map

一个免费公开数据优先的 AI 全产业链图谱 MVP。当前版本已经从 P1 静态数据增强推进到 P2 Next.js / TypeScript 应用和 P3 研究候选平台；静态站仍保留为可直接打开的 fallback。

## 本地查看

### 静态站

直接打开：

```text
/Users/coooder/Code/AI/capital/index.html
```

或启动任意静态文件服务器：

```bash
python3 -m http.server 4173
```

然后访问：

```text
http://localhost:4173
```

### Next.js 预览

P2 预览页复用当前 P1 数据，通过导出脚本把 `data/seed.js`、`data/p1-extension.js` 和 `data/metrics.js` 转成 `src/generated/*.json`：

```bash
npm install
npm run export:data
npm run dev
```

然后访问：

```text
http://localhost:3000
```

当前 Next.js 版本已经迁移搜索、实体列表、图谱深度、关系类型过滤、置信度过滤、实体详情、公开指标和来源弹窗，并支持 URL 状态。P2.2 已具备 PostgreSQL schema、seed import dry-run、SQL/apply 入口、DB verify、只读 API、首页数据源切换、客户端异步 API adapter、Docker Compose 长期库路径和 native 本机长期 PostgreSQL bootstrap；P2.3 已具备候选关系/实体/指标审核后台、候选实体合并、候选实体手动目标合并、全量主图谱合并目标搜索、合并指标影响预览、字段冲突策略审计、候选指标口径编辑、轻量账号会话和公开 redirect 解析；P2 前端已拆出控制栏、图谱面板、层级网格、详情面板、来源弹窗和 UI formatter，并增加组件边界回归校验、React render smoke test 和交互回调契约测试。

## 当前能力

- AI 产业链层级浏览
- 112 个实体、777 条关系、11 个来源
- 公司、模型、云和基础设施节点搜索
- 上下游依赖图谱
- 置信度和关系类型过滤
- 公司详情、官网、国家/地区、交易所、别名、估值口径、核心指标
- 已审核公开指标展示：GitHub repo 指标、Hugging Face model 指标、SEC company facts 指标、OpenAlex works 指标
- 每条关系关联证据来源
- 来源详情弹窗：publisher、日期、证据强度、来源类型、授权口径、关联关系数、来源 ID、外部链接
- Direct evidence override：当前 20 条关系已绑定具体 evidence URL，其中 8 条关系使用 `official_docs` 标记官方文档证据，6 条竞争关系使用 `official_product_overlap` 标记产品能力重叠证据，4 条关系使用 `credible_report` 标记可信报道证据，2 条关系使用 `third_party_index` 标记第三方索引证据
- Relationship review override：当前 top 75 证据补强 backlog 已全部审查，75 条均标记为 `inferred_ecosystem_mapping` 并降 confidence；这些标记会进入 generated JSON、CSV export 和 PostgreSQL `is_inferred`
- 自动采集失败状态展示：connector 失败会在相关实体详情中显示并保留 code/url/attempts 诊断字段；当前 Hugging Face 指标已通过官方模型页人工审核覆盖进入公开指标
- P2 Next.js 交互预览：通过统一仓储读取 seed/metrics，浏览器端用 `/api/entities`、`/api/entities/:id`、`/api/graph` 更新搜索、详情和图谱，支持 URL 直达状态
- P2 前端拆分：`CapitalMapClient` 保留 URL/API 状态编排，`StatsGrid`、`ControlPanel`、`GraphPanel`、`LayerGrid` 位于 `src/app/components/CapitalMapPanels.tsx`，`MetricPanel`、`SourceList`、`CorrectionForm`、`RelationSection`、`ResearchSection` 位于 `src/app/components/EntityDetailSections.tsx`，详情容器/来源弹窗位于 `src/app/components/EntityDetailPanel.tsx`，展示 formatter 位于 `src/lib/ui-formatters.ts` 并由 `npm run validate:ui` 覆盖；`npm run validate:render` 会对主要 React 面板做服务端渲染 smoke test，`npm run validate:interactions` 会覆盖 ControlPanel 和 GraphPanel 的搜索/过滤/选择/边点击回调契约
- P2 只读 API 起点：`/api/entities`、`/api/entities/:id`、`/api/graph`
- P2.3 审核后台：`/admin`，支持候选关系、候选实体、候选指标三类队列；关系候选支持 confidence/note/source/evidence 编辑，指标候选支持 metric type/value/as-of/source/source ref/confidence/evidence/note 口径编辑；三类候选都支持 approve/reject 和 audit log；设置 `ADMIN_REVIEW_TOKEN` 后，审核写操作必须带 Bearer token 或 `x-admin-token`；也可设置 `ADMIN_REVIEW_ADMIN_TOKEN` 和 `ADMIN_REVIEW_REVIEWER_TOKEN` 启用轻量角色权限，admin 可 edit/merge/approve/reject，reviewer 只能 approve/reject，actor 会写入 audit log；也可配置 `ADMIN_REVIEW_ADMIN_USERNAME`/`ADMIN_REVIEW_ADMIN_PASSWORD`、`ADMIN_REVIEW_REVIEWER_USERNAME`/`ADMIN_REVIEW_REVIEWER_PASSWORD` 和 `ADMIN_REVIEW_SESSION_SECRET`，通过 `/api/admin/session` 换取 HttpOnly 签名 session cookie，前端保留 token fallback
- P2.3 候选实体合并：`/admin` 实体队列会显示同 entityId、同名称/别名、同官网域名、同 DOI/OpenAlex/arXiv/ROR/作者 ID 的可能重复或可合并对象；支持从 duplicate hints 一键 merge，也支持搜索全量主图谱实体、duplicate hints 和当前候选实体队列后选择目标，或审核员输入主图谱实体 ID/候选实体 ID 后确认手动 merge；合并表单会预览旧 ID、目标 ID、redirect/audit log、当前候选关系端点引用数、目标实体指标字段和字段差异摘要；冲突字段可选择保留目标值、使用候选值或记录手动值，支持 name/type/layer/description/websiteUrl/country/status/valuation/aliases 字段策略，策略会写入 merge payload/audit log，并在 PostgreSQL merge 中更新目标主实体或目标候选字段；合并会记录 audit log、写入 `entity_redirect`，并批量重挂候选关系端点；公开实体详情和图谱 API 已能解析 redirect，详情面板会提示旧实体 ID 已合并
- P2.3 审核 API：`/api/admin/candidates`、`PATCH /api/admin/candidates/:id`、`/api/admin/candidates/:id/approve`、`/api/admin/candidates/:id/reject`、`/api/admin/candidate-entities`、`/api/admin/candidate-metrics`、`PATCH /api/admin/candidate-metrics/:id`、`/api/admin/session`
- P3 自动候选起点：`npm run candidates:generate` 会把免费指标 snapshot 转成待审核候选，并生成失败重试和证据补强 backlog；`npm run candidates:sync` 可把候选 snapshot 合并进 Next generated fallback 审核队列
- P3 Wikidata 起点：`npm run fetch:wikidata -- --fetch` 会从 Wikidata API 生成实体基础资料 snapshot；当前 5 个 profile 已转成 candidate entity，进入 `/admin` 审核和 PostgreSQL candidate 表，不直接覆盖主图谱
- P3 OpenAlex 起点：`npm run fetch:openalex -- --fetch --per-page=5` 会从 OpenAlex works API 拉取高引用论文 snapshot；当前 3 组查询产出 15 条 work，并转成 paper、research_org、research_author、referenced work 候选实体，以及 `related_to`、`published_by`、`authored_by`、`cites` 候选关系；paper/author payload 会写入 DOI、OpenAlex、arXiv、title、author name 等 `dedupKeys`，引用候选会保留 source paper、target OpenAlex URL、引用方向和 referenced-by 明细
- P3 arXiv 起点：`npm run fetch:arxiv -- --fetch --max-results=5` 会从 arXiv API 拉取预印本 snapshot；当前 3 组查询产出 15 篇 paper，并转成 arXiv paper、research_author 候选实体，以及 `related_to`、`authored_by` 候选关系；作者生成会过滤标点/空值类无效名称，并写入 normalized author name 与 dedup keys
- P3 学术候选规模：当前 candidate snapshot 有 398 个候选实体、401 条候选关系，其中 30 条 company/model-paper `related_to`、47 条 paper-institution `published_by`、191 条 paper-author `authored_by`、132 条 paper-paper `cites`；候选审批后才进入公开图谱，实体详情页会把已入图的论文、研究机构、作者和引用关系按“研究关联”分组展示
- P3 worker 起点：`npm run worker:run -- --offline` 会按 research watchlist 生成 connector run 和 raw document；`--fetch` 模式已支持真实 HTTP 抓取和失败落库，网络失败时不会生成无证据候选；当前真实 fetch 样本包含 OpenAI 官方 RSS、NVIDIA 官方博客 RSS、AWS Machine Learning Blog RSS 和 Meta Engineering RSS，parser 已从 4 个 RSS document 解析 54 个 RSS item，并生成 5 条 worker 候选指标
- P3 解析层起点：`npm run worker:parse` 会从 raw document 生成结构化 parsed document、正文、格式、章节、链接、facts、RSS item/table row、财报字段 facts、PDF quality gate 和 extraction hints；`npm run validate:parser` 覆盖 HTML/RSS/PDF fixture
- P3 抽取层起点：`npm run worker:extract` 会从 parsed document 生成 extraction records、带结构化章节/链接/facts 上下文的 LLM-ready prompt、候选关系/指标，并把财务 facts 转成待审核 candidate metric；同一候选 ID 会更新而不是重复插入；`npm run validate:rss-worker` 覆盖本地 RSS raw document -> parsed RSS item/facts -> extraction record -> candidate relationship/metric 链路
- P3 LLM 适配层起点：`npm run worker:llm -- --provider=fixture` 会执行 LLM 输出 schema 校验和候选合并；设置 `LLM_EXTRACT_COMMAND` 后可通过 `--provider=command` 调外部模型命令，设置 `LLM_EXTRACT_URL` 后可通过 `--provider=http` 接生产 LLM 网关
- P3 研究页面：`/research` 会读取 graph snapshot、timeline、candidate snapshot archive 和 export API，展示候选队列规模、层级/关系分布、高连接实体、最新研究事件、候选快照历史和 CSV/JSON 下载入口；timeline 支持“本周新增、候选、证据待补、采集链路、已入图/指标、全部”筛选、审批状态筛选和关键词搜索，并把 `view`/`q`/`entity`/`status` 同步到 URL；`/api/research/timeline` 支持 `entity` 精确过滤和 `status` 过滤；`npm run research:generate` 会生成底层 graph snapshot、timeline 和 CSV export，并通过 `/api/research/snapshot`、`/api/research/timeline`、`/api/research/export` 读取
- P3 实体研究动态：实体详情 API 会返回该实体最近 8 条 research timeline event，详情页显示“最近研究动态”，并可跳转到 `/research?entity=...` 查看该实体完整 timeline
- P3 用户纠错入口：实体详情页可提交关系/指标/实体问题，`POST /api/corrections` 会写入候选关系队列和 audit log，继续走 `/admin` 审核
- P2 数据库起点：`db/schema.sql`、`npm run db:plan-import`、`npm run db:bootstrap:native` 和 `npm run db:status -- --require-ready`
- API/页面仓储层：设置 `DATABASE_URL` 时查询 PostgreSQL，未设置时走 `json-fallback`

## 数据文件

基础 seed 数据位于：

```text
data/seed.js
```

P1 扩展数据位于：

```text
data/p1-extension.js
```

已审核自动采集指标位于：

```text
data/metrics.js
```

自动候选和证据补强 backlog 位于：

```text
data/research-watchlist.json
data/worker-run.json
data/raw-documents.json
data/parsed-documents.json
data/extraction-candidates.json
data/llm-extractions.json
data/candidate-snapshot.json
data/wikidata-profiles.snapshot.json
data/openalex-works.snapshot.json
data/arxiv-papers.snapshot.json
data/evidence-backlog.json
data/evidence-overrides.json
data/relationship-review-overrides.json
data/metric-overrides.json
data/research/graph-snapshot.json
data/research/timeline.json
data/research/candidate-snapshot-manifest.json
data/research/candidate-snapshots/*.json
data/exports/entities.csv
data/exports/relationships.csv
data/exports/metrics.csv
data/exports/raw-documents.csv
data/exports/parsed-documents.csv
data/exports/extraction-records.csv
data/exports/llm-extractions.csv
data/exports/candidate-relationships.csv
data/exports/candidate-entities.csv
data/exports/candidate-metrics.csv
data/exports/wikidata-profiles.csv
data/exports/openalex-works.csv
data/exports/arxiv-papers.csv
data/exports/candidate-snapshot-archives.csv
data/exports/snapshot-summary.csv
```

这些文件共同暴露 `window.AI_CAPITAL_SEED` 和 `window.AI_CAPITAL_METRICS`，所以网站可以直接用浏览器打开，不需要构建步骤。后续接入更多免费 API 时，可以继续写入独立 metrics 文件，或迁移到数据库。

Next.js 预览使用：

```text
scripts/export-next-data.mjs
src/generated/seed.json
src/generated/metrics.json
src/lib/types.ts
src/lib/data.ts
src/lib/ui-formatters.ts
src/app/components/CapitalMapPanels.tsx
src/app/components/EntityDetailSections.tsx
src/app/components/EntityDetailPanel.tsx
src/app/CapitalMapClient.tsx
src/app/page.tsx
src/app/research/page.tsx
src/app/api/entities/route.ts
src/app/api/entities/[id]/route.ts
src/app/api/graph/route.ts
src/app/api/corrections/route.ts
src/app/api/research/snapshot/route.ts
src/app/api/research/timeline/route.ts
src/app/api/research/export/route.ts
src/lib/graph.ts
src/lib/repository.ts
src/lib/research-artifacts.ts
db/schema.sql
```

## 校验数据

修改 seed 后运行：

```bash
node scripts/validate-data.mjs
node scripts/validate-metrics.mjs
npm run validate:env
```

P2 预览还应运行：

```bash
npm run validate:p0-p3:local

# 细分调试命令：
npm run export:data
npm run validate:next-data
npm run validate:ui
npm run validate:render
npm run validate:interactions
npm run validate:dedup
npm run fetch:wikidata -- --fetch --timeout-ms=15000
npm run fetch:openalex -- --fetch --per-page=5 --timeout-ms=15000
npm run fetch:arxiv -- --fetch --max-results=5 --timeout-ms=15000
npm run candidates:generate
npm run worker:run -- --dry-run
npm run worker:run -- --fetch --dry-run --timeout-ms=500
npm run worker:parse -- --dry-run
npm run worker:extract -- --dry-run
npm run validate:rss-worker
npm run validate:worker-cleanup
npm run llm:status
npm run worker:llm -- --provider=fixture --dry-run
LLM_EXTRACT_COMMAND='node scripts/llm-command-fixture.mjs' npm run worker:llm -- --provider=command --dry-run
# 另一个终端启动本地 HTTP fixture，验证后 Ctrl-C 停止
npm run llm:http-fixture -- --port=55991 --require-token=test-token
# 当前终端执行 HTTP provider dry-run
LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token npm run worker:llm -- --provider=http --dry-run --timeout-ms=5000
npm run candidates:sync -- --dry-run
npm run candidates:archive
npm run research:generate
npm run validate:research
npm run validate:evidence
npm run validate:admin-ux
npm run validate:admin-auth
npm run validate:graph
npm run db:plan-import
npm run db:e2e
npm run candidate:verify-merge
npm run candidate:verify-metric-edit
npm run candidate:verify-worker-metric
npm run worker:plan-import
npm run worker:verify-plan
npm run db:emit-sql
npm run db:verify
npm run build
```

`validate:p0-p3:local` 会串联 P0/P1 数据和指标校验、P1.3 证据审查、P2 Next/API/UI/图谱/交互/审核校验、P3 parser/RSS/research/worker/LLM fixture/weekly dry-run 门禁。默认还会运行临时 PostgreSQL E2E 和构建；快速本地检查可加：

```bash
npm run validate:p0-p3:local -- --skip-db-e2e --skip-build
```

需要连常驻 PostgreSQL 时加 `--with-persistent-db`；需要生产 LLM 网关真实验收时加 `--with-production-llm` 并先配置 `LLM_EXTRACT_URL` 和 `LLM_EXTRACT_API_KEY`。`LLM_EXTRACT_COMMAND` 保留给本地或自定义 CI 环境直接运行 LLM worker，不作为默认生产发布门禁。

环境配置校验可单独运行：

```bash
npm run deploy:setup-guide
npm run validate:env
npm run validate:deployment-secrets
npm run validate:env -- --require-production
```

默认校验 `.env.example` 是否覆盖当前脚本需要的数据库、审核、LLM、免费源和本机 PostgreSQL 配置，并检查整数、布尔值和 `DATABASE_URL` 格式。`deploy:setup-guide` 会从 `data/deployment-secrets.manifest.json` 生成 `data/research/production-setup-guide.md`，包含 `gh secret set`、`gh variable set` 和生产 workflow 触发命令。`validate:deployment-secrets` 会校验 manifest、生成的 setup guide、`.env.example` 和 GitHub Actions secrets/vars 引用一致。加 `--require-production` 后会要求真实 `DATABASE_URL`、`ADMIN_REVIEW_SESSION_SECRET`、`ADMIN_REVIEW_ADMIN_PASSWORD`、`ADMIN_REVIEW_REVIEWER_PASSWORD` 和生产 LLM provider，并拒绝 localhost/127.0.0.1/::1 服务，适合部署前门禁；legacy token 和角色 token 仍可用于本地/兼容场景，但不能单独通过生产发布门禁。只有 `validate:p0-p3:production-fixture` 会显式用 `--allow-local-services` 放行本地 fixture。

生产 P0-P3 统一验收入口：

```bash
npm run validate:p0-p3:production-fixture
npm run validate:p0-p3:production -- --timeout-ms=120000 --limit=1 --write-evidence
```

`validate:p0-p3:production-fixture` 会用临时 PostgreSQL、本地 HTTP LLM fixture 和审核密钥跑一遍统一生产门禁，用来证明生产门禁端到端可执行。真实生产环境使用 `validate:p0-p3:production`，它会串联 `validate:env -- --require-production`、`db:status -- --require-ready`、`db:verify`、`worker:verify`、`db:verify:p3-persistent`、`audit:p0-p3 -- --require-production-llm` 和 `llm:verify-production`，并要求 DB/LLM URL 指向非 localhost 服务。`db:status` 输出会脱敏 `DATABASE_URL` 密码，避免 CI 日志泄露生产连接串。

真实生产门禁通过后加 `--write-evidence` 会写入 `data/research/p0-p3-production-readiness-report.json`；GitHub 生产 workflow 在 `production` environment 中运行。生产仓库需要先创建名为 `production` 的 GitHub environment，并把真实 `DATABASE_URL`、审核 session secrets、`LLM_EXTRACT_URL` 和 `LLM_EXTRACT_API_KEY` 放到 environment-scoped secrets（如仓库策略允许），同时启用 required reviewers 或等价 environment protection rule，让生产 secrets 必须经过发布审核才释放。

最终推荐用 `npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main` 收口，它会预检 production environment、触发前解析远端 `main` 的 commit SHA、为本次触发生成唯一 dispatch UUID、触发 `Validate P0-P3`，并只接受 run title 带该 UUID、`headSha` 与远端提交完全一致且创建时间不早于本次 dispatch 的 run；随后等待成功、下载 artifact，并调用 `validate:production-completion`。workflow 会把 `P0_P3_EXPECTED_SOURCE_COMMIT` 设为当前 `${{ github.sha }}`，把 `P0_P3_EXPECTED_GITHUB_REPOSITORY` 设为当前 `${{ github.repository }}`，固定 `P0_P3_EXPECTED_GITHUB_REF=refs/heads/main`，所以证据里的 `sourceRevision.gitCommit`、`sourceRevision.githubRepository` 和 `sourceRevision.githubRef` 必须绑定产出 artifact 的代码版本、仓库和发布分支，同时会设置 `P0_P3_REQUIRE_GITHUB_EVIDENCE=true`，要求证据带 `sourceRevision.githubRunId`、`sourceRevision.githubRunAttempt`、`sourceRevision.githubEventName=workflow_dispatch`、`sourceRevision.productionLlmInput=true`、`sourceRevision.productionEnvironment=production` 和 `sourceRevision.githubWorkflow=Validate P0-P3`。

运行生产门禁前，必须把完整发布代码（包括 workflow 文件）提交并推送到生产仓库 `main`。orchestrator 只读取远端仓库，不会上传本地工作树；因此本地未提交或未推送的修改不会进入生产证据。

`validate:production-evidence` 会校验这份证据的 provider、`adminAuthMode=session`、`sourceRevision.gitCommit`、`generatedAt` 非未来且默认 14 天内、非 localhost URL、脱敏连接串和命令链；如发布策略需要不同新鲜度窗口，可设置 `P0_P3_PRODUCTION_EVIDENCE_MAX_AGE_DAYS`。生产证据文件和下载 artifact 目录都被 `.gitignore` 排除，GitHub 手动生产门禁会把 `p0-p3-production-readiness-report.json`、`p0-p3-completion-matrix.json` 和 `p0-p3-production-release-checklist.json` 一起上传为 `p0-p3-production-readiness-report` artifact；`validate:production-artifact` 会要求三份 JSON 都存在，只允许这三份 JSON 加可选 `run-metadata.json`，可选 metadata 也必须是有效 JSON，并校验 checklist 与 matrix 的 external pending 项一致。

`validate:production-completion` 会下载 artifact、复验证据、确认 `sourceRevision.githubRunId` 匹配 `--run-id`，确认 `sourceRevision.githubRunAttempt` 匹配 GitHub run metadata，并用 GitHub run metadata 校验 workflow/event/status/conclusion/head SHA/branch、`createdAt` 不早于 `--dispatch-started-at` 以及 run URL 是否绑定 expected repo/run id，再刷新 completion matrix 和 production release checklist；它只在矩阵达到 `complete` 时通过。`audit:p0-p3:matrix` 只有看到通过校验的非 localhost 生产证据或已下载 artifact，且 expected commit/repository/ref 与证据匹配，并确认 artifact 来自 GitHub `production` environment、`workflow_dispatch` 且 `production_llm=true`，同时由 `validate:production-completion` 注入已校验的 `P0_P3_VERIFIED_GITHUB_RUN_ID` 和 `P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT` 后，才会把发布验收层从 `verified_locally_external_pending` 提升为 `verified`，并在矩阵里记录 `productionSourceRevision.gitCommit` 和 `summary.productionGitCommit`。

真实生产库必须先导入 schema、seed 和 P3 worker artifacts：在指向生产 PostgreSQL 的 shell 里依次运行 `npm run db:import` 和 `npm run worker:import`。生产统一门禁会强制执行 `db:status -- --require-ready`、`db:verify`、`worker:verify` 和 `db:verify:p3-persistent`，证明导入行数、P3 worker artifacts 和用户纠错持久化路径都可用。`npm run deploy:setup-guide` 会把这组命令写入 `data/research/production-setup-guide.md`。

生产 workflow 会把 GitHub Actions run context 显式注入为 `P0_P3_GITHUB_RUN_ID` 和 `P0_P3_GITHUB_RUN_ATTEMPT`，并显式设置 `P0_P3_EXPECTED_SOURCE_COMMIT`、`P0_P3_EXPECTED_GITHUB_REPOSITORY` 和 `P0_P3_EXPECTED_GITHUB_REF`；`validate:p0-p3:production -- --write-evidence` 写证据时优先使用这些 P0-P3 字段，再回退到 GitHub 默认环境变量。
`production:p0-p3:run` 会把本次 dispatch 的 ISO 时间传给 `validate:production-completion`；completion validator 会要求 GitHub run metadata 的 `createdAt` 不早于该时间，防止旧的成功 run 或旧 artifact 被拿来完成 P0-P3。
生产完成链路固定使用 `refs/heads/main`；`production:p0-p3:run` 会拒绝其他 ref，因为 workflow evidence validator 固定 `P0_P3_EXPECTED_GITHUB_REF=refs/heads/main`。
手动调用 `validate:production-completion` 时，`--run-id` 也必须同时提供 `--dispatch-started-at`，否则不会接受该 run 作为完成证据。

完成度审计可运行：

```bash
npm run audit:p0-p3
npm run audit:p0-p3:write
npm run audit:p0-p3:matrix
npm run audit:p0-p3 -- --require-production-llm
```

默认审计会检查 P0-P3 关键脚本、环境配置校验入口、部署 secrets manifest、generated 数据、candidate snapshot、research graph/timeline、validation/weekly workflow 文件和关键命令片段、证据 backlog 审查状态和生产 LLM 配置状态；未配置真实 LLM 时只给 warning。`audit:p0-p3:write` 会把完整检查明细写入 `data/research/p0-p3-readiness-report.json`。`audit:p0-p3:matrix` 会刷新报告并生成 `data/research/p0-p3-completion-matrix.json`，按产品、数据、指标、API/DB、审核、采集、研究、LLM 和发布验收层标注 `verified`、`verified_locally_external_pending` 或 `missing_evidence`。`production:p0-p3:checklist` 会把矩阵里的 external pending 项转换为机器可读的 `data/research/p0-p3-production-release-checklist.json`；schema v2 中每项保留单行 `command`，并提供可逐步执行的 `commands[]`，覆盖 source revision exports、production environment secrets、DB 导入验证和 production completion 校验。`validate:production-release-checklist` 会校验 checklist 与当前矩阵同步；本地总验收已包含该校验。加 `--require-production-llm` 后，缺少 `LLM_EXTRACT_URL` 会失败，可作为发布门禁。

仓库包含 `.github/workflows/validate-p0-p3.yml`：PR 和 `main` push 会运行完整本地 P0-P3 验收、刷新 completion matrix、生成/校验 production release checklist，并运行 production fixture gate；生产发布使用 `npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main`，它会触发 `production_llm=true` 的手动 workflow，并读取 `DATABASE_URL`、审核鉴权、`LLM_EXTRACT_URL`/`LLM_EXTRACT_API_KEY` secrets 和相关 vars，执行 `validate:p0-p3:production` 统一生产门禁。

当前已通过完整本地验收 `npm run validate:p0-p3:local`，并通过常驻库分支：

```bash
DATABASE_URL=postgres://ai_capital:ai_capital@127.0.0.1:55432/ai_capital npm run validate:p0-p3:local -- --with-persistent-db --skip-db-e2e --skip-build
```

校验会检查：

- 实体、层级、来源和关系 ID 是否唯一
- 每个实体是否引用已存在的产业链层级
- 每条关系是否引用已存在的实体和证据来源
- 关系类型和置信度是否合法
- 免费数据 connector 是否引用已存在的实体
- 每个实体是否具备 `website_url`、`country` 和 aliases
- 指标是否引用已存在实体
- Next.js generated JSON 是否与当前 P1 数据源一致
- 每个来源是否具备 `sourceType`、`evidenceStrength`、`licenseNote`，并能在详情来源中展示
- `data/evidence-overrides.json` 中的 direct evidence URL、`official_product_overlap`、`credible_report` 和 `third_party_index` 证据强度是否进入关系详情、CSV export 和 PostgreSQL `relationship_evidence`
- `data/relationship-review-overrides.json` 中的弱证据关系审查状态是否进入 generated JSON、CSV export、evidence backlog 和 PostgreSQL `is_inferred`
- `npm run validate:evidence` 会校验 top 75 证据补强 backlog 不再包含未审查关系；无直接证据的关系必须明确标记为 `needs_direct_evidence` 或 `inferred_ecosystem_mapping`
- `npm run validate:admin-auth` 会校验 admin 审核写接口在配置 `ADMIN_REVIEW_TOKEN`、角色 token 或 session 登录后必须鉴权，并校验 reviewer 只能 approve/reject
- P2 图谱深度、关系类型、置信度、边数上限和详情数据契约是否稳定
- P2 UI formatter 是否稳定展示数据源、证据强度、指标 label、数字缩写和图谱节点短名
- 免费指标 snapshot 是否产生新的审核候选、失败重试 backlog 和证据补强 backlog
- Wikidata profile snapshot 是否能产生 candidate entity，并通过 `/admin`、research export 和 PostgreSQL candidate 表链路
- OpenAlex works snapshot 是否能产生 paper/research_org candidate entity、OpenAlex works export，并通过 `/admin`、research export 和 PostgreSQL candidate 表链路
- arXiv papers snapshot 是否能产生 paper candidate entity、arXiv papers export，并通过 `/admin`、research export 和 PostgreSQL candidate 表链路
- research watchlist 是否能在离线模式产生 connector run、raw document 和待审核候选，并在 fetch 模式下记录真实抓取失败
- raw document 解析层是否能生成 parsed documents、格式、正文、facts 和 quality gate
- parsed document 抽取层是否能生成 extraction records、LLM-ready prompt 和待审核候选，且不会重复插入同一候选
- RSS worker fixture 是否能把 RSS raw document 转成 RSS sections/facts，并复用抽取层生成候选关系和候选指标
- fetch 失败的 watchlist 是否不会在 candidate snapshot 或 generated fallback 中遗留旧 worker 候选；真实 RSS artifacts 是否至少包含 2 个可解析 RSS document
- LLM 适配层是否能校验模型/命令/HTTP 网关输出 schema、生成 LLM extraction records，并只更新同一批候选 ID
- 研究产物是否能生成 graph snapshot、timeline 和 CSV export
- research artifacts 的 raw document、parsed document、extraction record、candidate snapshot、candidate snapshot archive、graph snapshot 和 timeline 是否一致
- 当前 seed/metrics 映射到 PostgreSQL 表时的 dry-run 行数和重复 ID 风险
- worker artifact 映射到 PostgreSQL `connector_run`、`raw_document`、`parsed_document`、`extraction_record`、`llm_extraction` 和三类 candidate 表时的 dry-run 行数

## 只读 API

当前 API 已有 PostgreSQL 查询路径。未设置 `DATABASE_URL` 时读取 generated JSON，响应 `meta.dataSource` 为 `json-fallback`；设置后会尝试查询数据库：

```text
GET /api/entities?query=nvidia&type=company&layer=chip_design
GET /api/entities/openai
GET /api/graph?entity=qdrant&depth=2&minConfidence=0.7&relationType=integrates_with
GET /api/research/snapshot
GET /api/research/timeline?type=metric&limit=20
GET /api/research/timeline?entity=openai&status=candidate&limit=100
GET /api/research/export?dataset=relationships&format=csv
GET /api/research/export?dataset=metrics&format=json
GET /api/research/export?dataset=parsed-documents&format=json
GET /api/research/export?dataset=extraction-records&format=csv
GET /api/research/export?dataset=llm-extractions&format=json
GET /api/research/export?dataset=candidate-snapshot-archives&format=csv
GET /api/research/export?dataset=candidate-snapshot-latest&format=json
POST /api/corrections
```

## PostgreSQL 导入

当前已经有 schema 和可执行导入 SQL 生成。没有数据库时先看 dry-run：

```bash
npm run db:plan-import
```

生成可审查 SQL：

```bash
npm run db:emit-sql
```

本地长期 PostgreSQL 有两条路径，默认端口都是 `55432`，避免占用系统 `5432`。优先用本机 PostgreSQL 工具链路径，不依赖 Docker daemon，数据目录在 `.local/postgres/data`：

```bash
npm run db:bootstrap:native
npm run db:status -- --require-ready
```

`db:bootstrap:native` 会初始化/复用本机 PostgreSQL cluster、创建 `ai_capital` 角色和数据库、导入 seed、导入 worker artifacts，并运行 `db:verify` 与 `worker:verify`。默认连接串与 `.env.example` 一致：

```bash
DATABASE_URL=postgres://ai_capital:ai_capital@127.0.0.1:55432/ai_capital
```

使用完可停止本机长期库：

```bash
npm run db:stop:native
```

也可以用 Docker Compose 启动长期库：

```bash
npm run db:status
npm run db:up
npm run db:bootstrap
```

`db:bootstrap` 会启动 compose 服务、导入 seed、导入 worker artifacts，并运行 `db:verify` 与 `worker:verify`。使用完可停止服务：

```bash
npm run db:down
```

`db:status` 是只读诊断：默认输出 compose 配置、Docker daemon、Docker PostgreSQL health、本机 PostgreSQL 工具链、native data dir、`DATABASE_URL` 连接和 schema 状态，不要求数据库必须在线；部署或本机验收时可使用强制模式：

```bash
npm run db:status -- --require-ready
```

当前本机已用 native bootstrap 验证长期库就绪：`ready=true`、`schemaReady=true`，并导入 112 个实体和 401 条候选关系。Docker daemon 未启动时仍会显示 `dockerDaemonReachable=false`，但只要 `DATABASE_URL` 指向的 native 数据库可连接且 schema 已导入，`db:status -- --require-ready` 会通过。

如果不用 Docker，也可以设置 `DATABASE_URL` 后执行导入：

```bash
DATABASE_URL=postgres://user:password@localhost:5432/ai_capital npm run db:import
DATABASE_URL=postgres://user:password@localhost:5432/ai_capital npm run db:verify
```

本地有 PostgreSQL 工具链时，可一键启动临时库、导入 seed、导入 worker artifacts、验证并自动停止：

```bash
npm run db:e2e
```

worker 产物导入 PostgreSQL 审核表：

```bash
npm run worker:plan-import
npm run worker:emit-sql
DATABASE_URL=postgres://user:password@localhost:5432/ai_capital npm run worker:import
DATABASE_URL=postgres://user:password@localhost:5432/ai_capital npm run worker:verify
DATABASE_URL=postgres://user:password@localhost:5432/ai_capital npm run db:verify:p3-persistent
```

`worker:import` 依赖基础 seed 已经导入，因为 `raw_document`、`parsed_document`、`extraction_record`、`llm_extraction`、`candidate_relationship` 和 `candidate_metric` 会引用已有 source/entity；`candidate_entity` 同步进入实体候选审核表。没有数据库时可用 `npm run worker:plan-import` 或 `npm run worker:emit-sql -- --output /tmp/ai-capital-worker-import.sql` 审查行数和 SQL。`npm run worker:verify-plan` 会自动生成临时候选实体 fixture，验证非零 `candidate_entity` 也进入导入计划。`db:verify:p3-persistent` 会在常驻数据库上验证 P3 raw/parsed/extraction/LLM/candidate snapshot 已导入，并提交、重读、清理一条用户纠错 candidate/audit 记录，证明纠错入口的长期持久化路径可用。

API 和首页使用同一个 `DATABASE_URL` 判断数据源；未设置时保持本地 fallback 可用。已用临时 PostgreSQL 和 native 长期 PostgreSQL 验证：设置 `DATABASE_URL` 启动服务后，API 的 `meta.dataSource` 为 `postgres`。首页会显示当前数据源标记：`PostgreSQL` 或 `JSON fallback`。`npm run db:e2e` 已验证 seed + worker artifacts 的完整数据库导入链路，并覆盖候选实体审批后将 paper-institution 候选关系写入正式 `relationship` 表、worker RSS 候选指标经人工口径编辑后写入正式 `metric` 表。

## 采集免费指标

公开 API watchlist 位于：

```text
data/connectors.json
```

先查看将要请求的免费 API：

```bash
node scripts/fetch-free-metrics.mjs --dry-run
```

有网络时执行采集：

```bash
node scripts/fetch-free-metrics.mjs
```

输出文件：

```text
data/free-metrics.snapshot.json
```

当前脚本不会直接覆盖网站 seed。建议先审核快照，再把稳定指标合并进正式数据。

如果某个免费 API 在本机网络不可达，但已经从官方页面或官方 API 人工核验到稳定值，可以把审核覆盖写入：

```text
data/metric-overrides.json
```

覆盖项必须包含 `entityId`、`source`、`sourceRef`、`asOf`、`metrics`、`evidenceUrl`、`evidenceStrength` 和 `reviewNote`。`approve:metrics` 会优先保留实时采集结果；仅当同一 entity/source/sourceRef 没有成功结果时才合并覆盖，并移除同一 entity/source 的失败状态。

把 snapshot 转成已审核指标：

```bash
node scripts/approve-metrics.mjs
node scripts/validate-metrics.mjs
```

当前已审核指标：

- GitHub：LangChain、Hugging Face Transformers、Pinecone Python client
- SEC：NVIDIA、AMD、Broadcom、Supermicro、Arista
- OpenAlex：NVIDIA、OpenAI、Google DeepMind 相关 works 指标已采集、审核并展示
- Hugging Face：Meta AI 的 `facebook/bart-large-cnn` 和 Mistral 的 `mistralai/Mistral-7B-Instruct-v0.2` 已通过官方模型页人工审核覆盖进入公开指标；connector 仍保留，当前本机直连 Hugging Face API 会超时，可在网络可达环境继续实时采集

拉取 OpenAlex 高引用论文候选：

```bash
npm run fetch:openalex -- --fetch --per-page=5 --timeout-ms=15000
```

当前输出：

- `data/openalex-works.snapshot.json`：OpenAlex works 查询结果、work ID、DOI、引用数、来源期刊/会议、作者和机构摘要
- `npm run candidates:generate` 会把 OpenAlex works 转成 paper、research_org、research_author、referenced work 候选实体，以及 `related_to`、`published_by`、`authored_by`、`cites` 候选关系；当前有 15 个 OpenAlex work 候选、45 个 OpenAlex institution 候选、97 个 OpenAlex author 候选、130 个 referenced work 候选，并补充 paper/author dedup keys 与 citation details

拉取 arXiv 预印本候选：

```bash
npm run fetch:arxiv -- --fetch --max-results=5 --timeout-ms=15000
```

当前输出：

- `data/arxiv-papers.snapshot.json`：arXiv 查询结果、paper ID、abs/pdf URL、标题、摘要、作者和主题分类
- `npm run candidates:generate` 会把 arXiv papers 转成 paper、research_author 候选实体和 `related_to`、`authored_by` 候选关系；当前 candidate snapshot 共 398 个候选实体、401 条候选关系，其中 15 篇直接 paper 来自 arXiv，arXiv 作者候选会过滤无效名称并写入 normalized author name 与 dedup keys

把免费指标 snapshot 转成审核候选和研究 backlog：

```bash
npm run candidates:generate
```

运行 research worker 的离线采集骨架：

```bash
npm run worker:run -- --offline
```

有网络时可运行真实 HTTP 抓取模式：

```bash
npm run worker:run -- --fetch --timeout-ms=10000
```

建议先用 dry-run 检查，不改写本地 artifacts：

```bash
npm run worker:run -- --fetch --dry-run --timeout-ms=500
```

当前输出：

- `data/worker-run.json`：connector run 状态、计划项、候选数量
- `data/raw-documents.json`：raw document 元数据、content hash、parse status
- `data/candidate-snapshot.json`：合并 worker 产生的候选关系/指标
- 当前真实 fetch 样本：9 个 watchlist item 中 6 个成功抓取、3 个标记为 `fetch_failed`；成功项包含 OpenAI 官方 RSS、NVIDIA 官方博客 RSS、AWS Machine Learning Blog RSS、Meta Engineering RSS、Anthropic news HTML 和 OpenAlex API；其中 4 个 RSS document 已解析 54 个 RSS item，并生成 5 条 worker 候选指标。失败项不会生成新的 worker 候选，旧 worker 候选会按 watchlist 替换清理

fetch 模式会保存 HTTP 状态、content type、content hash 和正文预览。抓取失败的条目会标记为 `fetch_failed`，计入 `failedRawDocuments`，并跳过候选关系/指标生成，避免把没有有效证据的结果送入审核队列。

从 raw document 生成结构化 parsed document：

```bash
npm run worker:parse
```

当前输出：

- `data/parsed-documents.json`：每个 raw document 的格式识别、正文、章节、链接、facts、RSS item/table row、财报字段 facts、PDF 质量字段、hint、parser status 和 quality gate
- 当前真实 RSS 样本：4 个 RSS parsed document，54 个 RSS item，64 个 parsed facts

从 parsed document 生成抽取记录和待审核候选：

```bash
npm run worker:extract
```

当前输出：

- `data/extraction-candidates.json`：每个 parsed document 的 extraction record、quality gate、带结构化章节/链接/facts 上下文的 LLM-ready prompt、抽取出的候选关系/指标
- `data/candidate-snapshot.json`：按稳定候选 ID 合并抽取结果，重复运行会更新现有候选而不是重复插入

执行 LLM 适配层：

```bash
npm run llm:status
npm run worker:llm -- --provider=fixture
```

当前输出：

- `data/llm-extractions.json`：每个 extraction record 的 LLM 输出记录、provider/model、schema 校验后的候选关系/指标
- `data/candidate-snapshot.json`：按同一稳定候选 ID 合并 LLM 输出；默认 fixture 用于本地协议验证，`LLM_EXTRACT_COMMAND='your-command' npm run worker:llm -- --provider=command` 可接外部模型命令，`LLM_EXTRACT_URL=https://your-llm-gateway/extract LLM_EXTRACT_API_KEY=... npm run worker:llm -- --provider=http --timeout-ms=30000` 可接原生 HTTP 模型网关；以 `/chat/completions` 结尾的 OpenAI-compatible endpoint 会自动启用 JSON mode，并解析 `choices[0].message.content`

`llm:status` 是只读诊断：默认显示当前会使用的 provider，并用一个最小 extraction request 校验 provider 响应 schema。生产验收可强制要求 command 或 HTTP provider：

```bash
LLM_EXTRACT_COMMAND='your-command' npm run llm:status -- --provider=command --require-provider=command
LLM_EXTRACT_URL=https://your-llm-gateway/extract LLM_EXTRACT_API_KEY=... npm run llm:status -- --provider=http --require-provider=http --timeout-ms=30000
```

生产网关上线前使用更完整的门禁。它会拒绝 fixture provider，先跑 `llm:status -- --require-provider=...`，再对已成功解析的 extraction record 做一次 dry-run 抽样，不合并候选：

```bash
export DATABASE_URL=postgres://user:password@host:5432/ai_capital
export ADMIN_REVIEW_SESSION_SECRET=...
export ADMIN_REVIEW_ADMIN_PASSWORD=...
export ADMIN_REVIEW_REVIEWER_PASSWORD=...
export LLM_EXTRACT_URL=https://your-llm-gateway/extract
export LLM_EXTRACT_API_KEY=...
export LLM_EXTRACT_MODEL=your-model
export LLM_EXTRACT_RPM=30
export LLM_EXTRACT_MAX_RETRIES=2
npm run validate:p0-p3:production -- --provider=http --timeout-ms=120000 --limit=1
```

`LLM_EXTRACT_RPM` 会自动换算请求间隔；如果需要固定间隔，可设置 `LLM_EXTRACT_MIN_INTERVAL_MS` 覆盖。`LLM_EXTRACT_MAX_RETRIES` 和 `LLM_EXTRACT_RETRY_BASE_MS` 控制指数退避重试。`npm run worker:llm` 也支持 `--limit=N` 和 `--only-extracted`，便于低成本验证真实网关。

本地验证 HTTP provider：

```bash
npm run validate:llm-http

# 终端 1
npm run llm:http-fixture -- --port=55991 --require-token=test-token

# 终端 2
LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token npm run llm:status -- --provider=http --require-provider=http --timeout-ms=5000
LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token npm run worker:llm -- --provider=http --dry-run --timeout-ms=5000
LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token LLM_EXTRACT_RPM=600 LLM_EXTRACT_MAX_RETRIES=1 npm run llm:verify-production -- --provider=http --timeout-ms=5000 --limit=1
```

HTTP provider 会向 `LLM_EXTRACT_URL` POST 与 command provider 相同的 extraction request，并在设置 `LLM_EXTRACT_API_KEY` 时发送 `Authorization: Bearer ...`。响应可以直接返回 `{ relationships, metrics, entities }`，也可以包在 `{ data: ... }` 中；两种都会进入同一套 schema 校验、confidence 归一化和 candidate merge。真实云端模型调用仍需要在部署环境配置可用的网关 URL 与凭证。

每周研究刷新可以用同一条编排命令执行。默认是 dry-run，只验证 Wikidata/OpenAlex/arXiv/RSS 计划、worker parse/extract/LLM fixture、archive dry-run 和 research 校验：

```bash
npm run research:weekly -- --skip-db --skip-build
```

实际刷新免费源并写入 artifacts：

```bash
npm run research:weekly -- --fetch --skip-db
```

如果本机长期 PostgreSQL 已就绪，也可以把刷新后的 seed/worker artifacts 导入常驻库：

```bash
npm run research:weekly -- --fetch --import-db
```

`--import-db` 会在导入 seed 和 worker artifacts 后运行 `db:verify`、`worker:verify` 和 `db:verify:p3-persistent`，确认 P3 candidate snapshot 与用户纠错记录能在常驻 PostgreSQL 中持久化。

仓库还包含 `.github/workflows/research-weekly.yml`，可按周触发免费源刷新，检测到 artifacts 变化时推送 `automation/weekly-research-refresh` 分支并创建/更新 PR；刷新完成后会运行 `audit:p0-p3`，当手动选择 http LLM provider 时会要求生产 LLM 配置存在。`command` provider 保留给本地或自定义 CI 环境直接运行脚本时使用。

把候选 snapshot 合并进 Next.js fallback 审核队列：

```bash
npm run candidates:sync
```

当前输出：

- `data/candidate-snapshot.json`：候选关系、候选实体、候选指标，以及失败重试列表
- `data/evidence-backlog.json`：按优先级排序的 50 条待补证据关系

归档当前候选 snapshot，供长期增量追踪和回溯：

```bash
npm run candidates:archive
```

当前输出：

- `data/research/candidate-snapshot-manifest.json`：归档 manifest、latest archive、content hash 和队列计数
- `data/research/candidate-snapshots/*.json`：按内容 hash 去重后的候选 snapshot 历史。重复归档相同候选内容不会写入重复文件。

生成研究快照、timeline 和导出文件：

```bash
npm run research:generate
```

当前输出：

- `data/research/graph-snapshot.json`：层级、关系类型、置信度分布、中心实体等图谱摘要
- `data/research/timeline.json`：来源、指标、失败重试、证据补强事件时间线
- `data/exports/*.csv`：实体、关系、指标、raw documents、parsed documents、extraction records、LLM extractions、候选关系、候选实体、候选指标、Wikidata profiles、OpenAlex works、arXiv papers、candidate snapshot archives、快照摘要 CSV

`/api/research/export` 同步支持这些导出数据集。`candidate-snapshot-archives` 可用 CSV/JSON 读取归档 manifest；`candidate-snapshot-latest` 只支持 JSON，返回当前 latest archive 的完整 bundle，便于回溯候选队列状态。当前研究导出共有 15 组 CSV。

## 数据说明

当前数据是 MVP seed，用于验证产品结构。正式化后建议接入：

- SEC EDGAR：上市公司 filings 和财务指标
- GitHub REST API：开源项目热度和依赖
- Hugging Face Hub API：模型和数据集指标
- OpenAlex / arXiv：论文和机构关系
- 公司公告、财报、新闻稿：供应链、合作、客户和融资证据
