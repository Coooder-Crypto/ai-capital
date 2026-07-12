# AI 全产业链图谱网站技术方案

## 1. 项目定位

本项目要做一个面向 AI 产业研究的图谱网站，用免费公开数据源优先构建 AI 全产业链的公司、模型、芯片、云、开源项目、论文、投资人和上下游依赖关系。

核心原则：

- 数据可追溯：每个指标、估值、关系都必须能指向来源。
- 口径明确：上市公司市值、私营公司披露估值、估算值、未知值必须分开展示。
- 先图谱后自动化：先用人工审核 seed 建立可用图谱，再逐步接入免费 API。
- LLM 只做候选抽取：没有来源和审核的 LLM 结果不能进入正式图谱。

## 2. 当前版本基线

当前已经完成 P1 静态数据增强和 P2 Next.js / TypeScript 工程化迁移，并推进到 P3 研究候选平台。静态站仍保留为可直接打开的 fallback；Next.js 版本已经迁移核心浏览交互、URL 状态、只读 API、审核后台和组件化前端，并有 `validate:p0-p3:local` 本地总验收入口；当前完整本地总验收和常驻 PostgreSQL 分支均已通过。`audit:p0-p3:matrix` 当前状态应保持为 `local_ready_production_pending`：本地产品、数据、采集、审核和验证链路已经闭环，但还没有真实 GitHub `production` environment、真实生产 PostgreSQL、真实 HTTP LLM gateway 和生产 workflow artifact/run metadata 证据，因此不能标记为 `complete`。P2.2 已基本完成，具备 PostgreSQL schema、seed import dry-run、可执行导入 SQL、导入验证脚本、API 仓储层、只读 API、首页数据源切换、客户端异步 API adapter、Docker Compose 长期库路径和 native 本机长期 PostgreSQL bootstrap。API 已支持 `DATABASE_URL` 数据库查询路径，并已用临时 PostgreSQL 和 native 长期 PostgreSQL 验证导入、表计数和 `meta.dataSource=postgres`；首页无数据库时显示 JSON fallback，有数据库时可切到 PostgreSQL；P2.3 已完成候选关系、候选实体、候选指标三类基础审核流，候选通过后可进入公开读取路径，候选实体合并会写入 `entity_redirect`，候选实体支持 duplicate hints 一键合并、手动目标 ID 合并、全量主图谱合并目标搜索、候选关系端点影响预览、目标指标字段预览、字段差异摘要和冲突字段策略，字段策略可更新目标主实体或目标候选字段并写入审计，候选指标支持口径编辑，支持 legacy/role token 和 HttpOnly session cookie 轻量账号会话，公开实体详情和图谱 API 已能解析 redirect；P2 前端已拆出控制栏、图谱面板、层级网格、详情面板、来源弹窗和 UI formatter，并增加组件边界回归校验、React render smoke test 和交互回调契约测试；P3 已启动自动候选、raw document、parsed document、抽取记录、RSS worker fixture、真实 OpenAI/NVIDIA/AWS/Meta RSS 入库、LLM extraction records、Wikidata profile、OpenAlex works、arXiv papers、论文作者/引用候选、论文/作者去重键、arXiv 作者过滤、引用详情 payload、研究快照、timeline、导出和 worker DB import/verify 第一版。

```text
index.html
styles.css
app.js
data/seed.js
data/p1-extension.js
data/connectors.json
data/research-watchlist.json
data/metrics.js
data/metric-overrides.json
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
scripts/validate-data.mjs
scripts/validate-metrics.mjs
scripts/fetch-free-metrics.mjs
scripts/approve-metrics.mjs
scripts/metric-overrides.mjs
scripts/generate-review-candidates.mjs
scripts/fetch-wikidata-profiles.mjs
scripts/fetch-openalex-works.mjs
scripts/fetch-arxiv-papers.mjs
scripts/sync-review-candidates.mjs
scripts/run-research-worker.mjs
scripts/parse-raw-documents.mjs
scripts/extract-candidates-from-raw-documents.mjs
scripts/lib/extraction-artifacts.mjs
scripts/run-llm-extraction.mjs
scripts/check-llm-status.mjs
scripts/llm-command-fixture.mjs
scripts/llm-http-fixture-server.mjs
scripts/generate-research-artifacts.mjs
scripts/validate-research-artifacts.mjs
scripts/validate-graph-detail.mjs
scripts/validate-ui-formatters.mjs
scripts/validate-structured-parser.mjs
scripts/validate-rss-worker-fixture.mjs
scripts/validate-worker-candidate-cleanup.mjs
scripts/validate-admin-ux.mjs
scripts/export-next-data.mjs
scripts/validate-next-data.mjs
scripts/plan-seed-import.mjs
scripts/plan-worker-import.mjs
scripts/verify-worker-import-plan.mjs
scripts/check-db-status.mjs
db/schema.sql
package.json
next.config.mjs
tsconfig.json
src/lib/types.ts
src/lib/data.ts
src/lib/ui-formatters.ts
src/app/layout.tsx
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
src/app/styles.css
src/generated/seed.json
src/generated/metrics.json
README.md
```

当前能力：

- 静态网站，可直接打开 `index.html`。
- 8 个 AI 产业链层级。
- 112 个实体。
- 777 条关系。
- 11 个来源。
- 公司/模型/项目搜索。
- 交互式图谱。
- 图谱深度切换：1 层、2 层、全部。
- 关系类型过滤。
- 最低置信度过滤。
- 公司详情侧栏。
- 官网、国家/地区、交易所、别名展示。
- 上游/下游关系展示。
- 数据来源与估值口径说明。
- seed 数据校验脚本。
- GitHub、Hugging Face、SEC、OpenAlex、arXiv 的免费数据 connector 和 dry-run 采集脚本。
- 已审核指标文件 `data/metrics.js`。
- 详情页展示 GitHub repo 指标、Hugging Face model 指标、SEC company facts 指标和 OpenAlex works 指标。
- 来源详情弹窗已经实现。
- 采集失败状态已经进入详情页公开指标模块；当前 Hugging Face 两个模型指标已通过官方模型页人工审核覆盖进入公开指标，本机直连 Hugging Face API 仍会超时，connector 保留用于网络可达环境实时采集。
- P2 Next.js 交互预览页已经读取同一份 P1 数据，并迁移搜索、实体列表、图谱深度、置信度过滤、关系类型过滤、SVG 图谱、详情侧栏、公开指标、来源弹窗和 URL query 状态。
- P2.2 已新增 PostgreSQL schema、seed import dry-run、`db:emit-sql`/`db:import` 导入入口、`db:verify` 验证脚本、API repository fallback、`/api/entities`、`/api/entities/:id`、`/api/graph` 只读 API，以及客户端异步 API adapter。
- P2.3 已新增候选关系、候选实体、候选指标审核后台，三类候选 approve 后进入公开读取路径；候选实体支持 duplicate hints 一键合并、全量主图谱/候选队列搜索选择和审核员输入目标 ID 后确认合并；审核权限支持 legacy token、role token 和 HttpOnly 签名 session cookie。
- P2 前端已将统计条、控制栏、图谱面板、层级网格、详情容器、指标面板、证据来源、纠错表单、关系列表、来源弹窗和 UI formatter 从 `CapitalMapClient` 拆出；`CapitalMapClient` 现在保留查询状态、API adapter 和数据组合逻辑，formatter 输出与组件边界由 `npm run validate:ui` 回归校验，主要面板渲染由 `npm run validate:render` 覆盖，ControlPanel/GraphPanel 的搜索、过滤、选择和边点击回调由 `npm run validate:interactions` 覆盖。
- P3 已新增 `scripts/generate-review-candidates.mjs`、`scripts/fetch-wikidata-profiles.mjs`、`scripts/fetch-openalex-works.mjs`、`scripts/fetch-arxiv-papers.mjs`、`scripts/run-research-worker.mjs`、`scripts/parse-raw-documents.mjs`、`scripts/extract-candidates-from-raw-documents.mjs`、`scripts/lib/extraction-artifacts.mjs`、`scripts/validate-rss-worker-fixture.mjs`、`scripts/run-llm-extraction.mjs`、`scripts/sync-review-candidates.mjs` 和 `scripts/generate-research-artifacts.mjs`，从免费指标 snapshot、Wikidata profile snapshot、OpenAlex works snapshot、arXiv papers snapshot 与 `data/research-watchlist.json` 生成候选、connector run、raw document、parsed document、抽取记录、LLM-ready prompt、LLM extraction records、失败重试 backlog、证据补强 backlog，并可合并进 Next generated fallback 审核队列；RSS worker fixture 已覆盖本地 RSS raw document 到 parsed RSS item/facts、extraction record、candidate relationship/metric 的链路，真实 fetch 已接入 OpenAI 官方 RSS、NVIDIA 官方博客 RSS、AWS Machine Learning Blog RSS 和 Meta Engineering RSS，当前解析 4 个 RSS document、54 个 RSS item；OpenAlex/arXiv 当前已生成 paper、research_org、research_author、referenced work 和 `related_to`、`published_by`、`authored_by`、`cites` 候选，并为论文/作者写入 dedup keys、过滤无效 arXiv 作者、补充引用详情 payload；同时生成 graph snapshot、timeline、CSV export，并通过 `/api/research/*` 读取；实体详情页和 `POST /api/corrections` 支持用户纠错进入候选关系审核队列。

当前验证命令：

```bash
node --check app.js
node --check data/seed.js
node --check data/p1-extension.js
node --check scripts/validate-data.mjs
node --check scripts/validate-metrics.mjs
node --check scripts/fetch-free-metrics.mjs
node --check scripts/approve-metrics.mjs
node scripts/validate-data.mjs
node scripts/validate-metrics.mjs
node scripts/fetch-free-metrics.mjs --dry-run
npm run candidates:generate
npm run worker:run -- --dry-run
npm run worker:parse -- --dry-run
npm run worker:extract -- --dry-run
npm run llm:status
npm run worker:llm -- --provider=fixture --dry-run
LLM_EXTRACT_COMMAND='node scripts/llm-command-fixture.mjs' npm run worker:llm -- --provider=command --dry-run
LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token LLM_EXTRACT_RPM=600 LLM_EXTRACT_MAX_RETRIES=1 npm run llm:verify-production -- --provider=http --timeout-ms=5000 --limit=1
# 另一个终端启动本地 HTTP fixture，验证后 Ctrl-C 停止
npm run llm:http-fixture -- --port=55991 --require-token=test-token
# 当前终端执行 HTTP provider dry-run
LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token npm run llm:status -- --provider=http --require-provider=http --timeout-ms=5000
LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token npm run worker:llm -- --provider=http --dry-run --timeout-ms=5000
npm run fetch:wikidata -- --fetch --timeout-ms=15000
npm run fetch:openalex -- --fetch --per-page=5 --timeout-ms=15000
npm run fetch:arxiv -- --fetch --max-results=5 --timeout-ms=15000
npm run candidates:sync -- --dry-run
npm run research:generate
npm run validate:research
npm run validate:parser
npm run validate:graph
npm run validate:ui
npm run validate:admin-ux
npm run validate:dedup
npm run export:data
npm run validate:next-data
npm run db:e2e
npm run db:plan-import
npm run worker:plan-import
npm run worker:verify-plan
npm run db:emit-sql
npm run db:verify
npm run build
```

当前版本定位：

```text
P1.2 = 静态数据增强版 + 真实免费指标展示，Hugging Face 模型指标已通过官方模型页审核覆盖展示
P2.1 preview = Next.js/TypeScript 交互预览
近期目标 = 补证据 URL、接入长期 PostgreSQL、增强 P3 worker、扩大 OpenAlex/arXiv 真实采集范围
不是 = 完整数据库产品、实时数据平台、自动审核系统
```

## 3. 目标产品分层

### 3.1 P0：静态 MVP，已完成

目标：

- 快速验证用户是否需要“一层一层看 AI 产业依赖关系”的产品。
- 建立实体、关系、来源、置信度的最小数据结构。
- 不依赖后端、数据库、构建工具。

技术形态：

```text
HTML + CSS + JavaScript
data/seed.js 作为前端数据源
scripts/validate-data.mjs 做本地质量检查
scripts/fetch-free-metrics.mjs 做免费 API 采集入口
```

### 3.2 P1：数据增强版静态站

目标：

- 扩展到 100 个实体、300 条关系。当前 P1.1 已超过该数据密度目标。
- 把 GitHub、Hugging Face、SEC、OpenAlex 的采集结果转成可审核 snapshot。
- 在页面中展示已审核的真实指标。

仍然不引入数据库。

### 3.3 P2：工程化 Web App

目标：

- 迁移到 Next.js / React / TypeScript。
- 引入 PostgreSQL。
- 增加 API、数据导入、审核后台。
- 支持增量更新和实体合并。

当前状态：

- 已建立 Next.js / TypeScript 项目骨架。
- 已建立 `scripts/export-next-data.mjs`，把现有 P1 数据导出为 typed JSON。
- 已建立 `scripts/validate-next-data.mjs`，校验 generated JSON 与 P1 数据源一致。
- 已建立 `src/lib/types.ts` 和 `src/lib/data.ts`。
- 已建立 `src/app/CapitalMapClient.tsx`，迁移核心交互。
- 已建立 `src/app/components/CapitalMapPanels.tsx`、`src/app/components/EntityDetailSections.tsx`、`src/app/components/EntityDetailPanel.tsx` 和 `src/lib/ui-formatters.ts`，拆分统计条、控制栏、图谱面板、层级网格、详情容器、指标面板、证据来源、纠错表单、关系列表、来源弹窗和 UI 格式化输出。
- 已迁移搜索、实体列表、图谱深度、关系过滤、置信度过滤、详情侧栏、指标展示、来源弹窗和 URL query 状态。
- 已新增 PostgreSQL schema、seed import dry-run、SQL/apply 入口、API repository fallback 和只读 API 起点。
- 已完成临时 PostgreSQL 导入验证、前端 API 数据源切换、候选关系/实体/指标审核、关系候选基础编辑，以及三类候选 approve 后进入公开读取路径。
- 已完成 P3 离线候选生成第一版：免费指标 snapshot 去重转候选、失败重试 backlog、证据补强 backlog，并可同步到 generated fallback 审核队列。
- 已完成 P3 OpenAlex/arXiv 学术候选第一版：3 组 OpenAlex 查询产出 15 条 work，3 组 arXiv 查询产出 15 篇 paper；生成 paper、research_org、research_author、referenced work 候选实体，并生成 company/model-paper `related_to`、paper-institution `published_by`、paper-author `authored_by`、paper-paper `cites` 候选关系；论文/作者 payload 已补 DOI/OpenAlex/arXiv/title/author dedup keys，arXiv 作者会过滤无效名称，引用候选会保留 source paper 和 referenced-by 明细，进入 `/admin`、research export 和 PostgreSQL candidate 表。
- 已完成 P3 研究产物第一版：graph snapshot、timeline、CSV/JSON export、只读 research API 和 `/research` 页面入口。
- 已完成 P3 用户纠错第一版：详情页提交纠错，`POST /api/corrections` 写入 candidate queue 和 audit log。

### 3.4 P3：研究级数据平台

目标：

- 自动采集公司公告、新闻稿、财报、论文、开源依赖。
- LLM 抽取候选关系，人工审核。
- 增加图谱快照、时间线、导出、API。
- 后续可接入 PitchBook、Crunchbase、CB Insights、Dealroom 等付费源。

## 4. 产业链范围

第一阶段保持 8 层，后续再细分。

| 层级 | 当前 key | 说明 | 代表实体 |
| --- | --- | --- | --- |
| 设备 | `equipment` | EUV、沉积、刻蚀、检测设备 | ASML |
| 芯片 / EDA | `chip_design` | GPU、ASIC、网络芯片、EDA/IP | NVIDIA、AMD、Broadcom |
| 代工 / 存储 | `foundry_memory` | 晶圆代工、先进封装、HBM、DRAM | TSMC、SK Hynix |
| 服务器 / 数据中心 | `datacenter` | AI 服务器、网络、电力、液冷 | Supermicro、Arista |
| 云 / 算力 | `cloud_compute` | 公有云、GPU 云、推理平台 | Azure、AWS、CoreWeave |
| 基础模型 | `foundation_model` | 大模型、语音、图像、视频模型 | OpenAI、Anthropic、Mistral |
| AI Infra 软件 | `ai_infra` | 模型托管、Agent 框架、向量库、评测 | Hugging Face、LangChain、Pinecone |
| AI 应用 | `application` | 编程、搜索、语音、图像、行业应用 | Cursor、Perplexity、ElevenLabs |

P2 后可扩展为更细的枚举：

```text
semiconductor_equipment
eda_ip
chip_design
foundry
advanced_packaging
memory_hbm
server_oem
networking
datacenter_power_cooling
cloud_compute
gpu_cloud
foundation_model
model_serving
agent_framework
vector_database
observability_eval
ai_application
investor
research_org
data_provider
```

## 5. 数据源设计

### 5.1 免费数据源

| 数据源 | 当前状态 | 用途 | 备注 |
| --- | --- | --- | --- |
| SEC EDGAR | connector 已有 | 上市公司财务、company facts | 需要 User-Agent，适合美国上市公司 |
| GitHub REST API | connector 已有 | stars、forks、issues、repo 更新时间 | 可不登录低频访问，token 可提高限额 |
| Hugging Face Hub API | connector 已有；当前本机直连 API 超时，2 个模型已用官方模型页人工审核覆盖 | downloads、likes、模型 metadata | 适合模型热度和分发关系 |
| OpenAlex | connector 已有，3 组 works 指标已采集、审核并展示；15 条 works 已生成 paper/research_org/research_author/referenced work 候选实体和 `related_to`/`published_by`/`authored_by`/`cites` 候选关系；论文/作者 dedup keys 和引用详情 payload 已补齐 | 论文、机构、作者、引用关系 | 已进入研究候选和导出；后续扩大采集范围和人工审批样本 |
| arXiv | connector 已有，3 组查询已生成 15 篇 paper 候选实体、research_author 候选实体和论文-公司/模型、论文-作者关系候选；作者候选已过滤无效名称并写入 normalized author name/dedup keys | 预印本、论文主题、作者 | 已进入研究候选和导出；后续增强跨 OpenAlex/arXiv 作者实体归并 |
| 公司官网 / IR | watchlist/worker/fetch 第一版已有 | 公告、财报、客户案例、合作关系 | 先进入 raw document 和候选审核 |
| 新闻 RSS | watchlist/worker/fetch 第一版已有，OpenAI/NVIDIA 官方 RSS 已真实入库 | 融资、估值、合作事件 | 先进入 raw document、parsed RSS item 和候选审核 |
| Wikidata | connector 已有，5 个 profile 已生成 candidate entity | 公司基础资料、别名、国家、官网 | 只写候选实体，审核后才更新主图谱 |

### 5.2 估值口径

必须区分：

```text
market_cap
reported_private_valuation
estimated_valuation
unknown
not_applicable
```

展示规则：

- 上市公司：优先展示 `market_cap`，并说明行情来源和更新时间。
- 私营公司：只展示公开披露估值，字段为 `reported_private_valuation`。
- 没有可靠公开来源：显示 `Unknown`。
- 投资机构、模型、项目等非公司实体：显示 `N/A`。
- 估算值必须展示计算方法和 `is_estimated=true`。

### 5.3 指标口径

指标分为三类：

```text
financial_metric
technical_metric
relationship_metric
```

示例：

```json
{
  "entityId": "nvidia",
  "metricType": "revenue",
  "value": 130497000000,
  "unit": "USD",
  "period": "FY2026",
  "asOfDate": "2026-01-25",
  "sourceId": "src_sec",
  "confidence": 1,
  "isEstimated": false
}
```

## 6. 数据模型

### 6.1 P0/P1 前端数据结构

当前 `data/seed.js` 暴露：

```js
window.AI_CAPITAL_SEED = {
  layers,
  entities,
  sources,
  relationships,
  relationLabels
};
```

实体结构：

```js
{
  id: "nvidia",
  name: "NVIDIA",
  type: "company",
  layer: "chip_design",
  status: "public",
  ticker: "NVDA",
  valuation: "Market cap: public",
  metrics: {
    "总部": "United States",
    "状态": "Public",
    "核心": "GPU / Networking",
    "数据口径": "SEC + market data"
  },
  description: "..."
}
```

关系结构：

```js
{
  id: "rel_1",
  source: "tsmc",
  target: "nvidia",
  type: "supplies_to",
  confidence: 0.9,
  sourceId: "src_manual",
  note: "TSMC 为高端 GPU 和 AI 芯片提供代工与封装能力。"
}
```

来源结构：

```js
{
  id: "src_sec",
  title: "SEC EDGAR Data APIs",
  publisher: "U.S. SEC",
  date: "Live public data",
  url: "https://data.sec.gov/",
  note: "用于美国上市公司 filings、company facts 和财务指标。"
}
```

### 6.2 P2 数据库表

P2 使用 PostgreSQL，建议先不引入 Neo4j。关系图查询可以先用普通关系表完成，后续再评估图数据库。

```sql
entity
- id
- type
- name
- slug
- layer
- description
- website_url
- country
- founded_year
- status
- created_at
- updated_at
```

```sql
entity_alias
- id
- entity_id
- alias
- alias_type
- source_id
- created_at
```

```sql
company_profile
- entity_id
- ticker
- exchange
- legal_name
- sector
- headquarters
- employee_count
- is_public
```

```sql
relationship
- id
- source_entity_id
- target_entity_id
- relation_type
- confidence
- is_inferred
- extraction_method
- first_seen_at
- last_seen_at
- status: candidate|approved|rejected
- created_at
- updated_at
```

```sql
relationship_evidence
- id
- relationship_id
- source_id
- evidence_title
- evidence_url
- evidence_date
- quote_excerpt
- notes
```

```sql
source
- id
- source_type
- url
- title
- publisher
- published_at
- fetched_at
- license_note
- content_hash
```

```sql
metric
- id
- entity_id
- metric_type
- value
- unit
- period
- as_of_date
- source_id
- confidence
- is_estimated
- calculation_note
```

```sql
raw_document
- id
- source_id
- url
- fetched_at
- content_type
- content_hash
- storage_path
- parse_status
```

## 7. 关系类型与置信度

### 7.1 关系类型

当前已实现：

```text
supplies_to
runs_on
invested_in
integrates_with
released_by
competes_with
partners_with
```

P1/P2 增加：

```text
customer_of
owns
uses
manufactured_by
designed_by
trained_on
derived_from
depends_on
funded_by
```

### 7.2 置信度规则

指标置信度：

```text
1.00 SEC/company filing
0.90 company official press release
0.80 major media report
0.70 official API or reputable public database
0.50 community-maintained source
0.30 LLM extracted but not reviewed
```

关系置信度：

```text
0.95 explicit contract / official filing
0.90 official partnership announcement
0.80 official customer case study
0.70 repo dependency / model card reference
0.60 credible media report
0.40 inferred from ecosystem context
```

前端默认最小置信度：

```text
0.6
```

低于 `0.6` 的关系可以存在于数据中，但默认不显示。

## 8. 前端方案

### 8.1 当前 P0 页面

当前 `index.html` 已包含：

- 顶部导航。
- 概览统计。
- 搜索和过滤控制面板。
- SVG 图谱。
- 公司详情侧栏。
- 产业链层级卡片。
- 数据来源说明。

### 8.2 P1 前端增强

实施项：

1. 增加“指标更新时间”区域。
2. 增加真实指标区：GitHub stars、HF downloads、SEC revenue。
3. 增加“低置信度关系”开关。
4. 增加“只看上市公司 / 私营公司 / 开源项目”过滤。
5. 增加来源详情弹窗，而不是只显示来源列表。
6. 增加图谱节点 tooltip。
7. 增加 URL 状态，例如 `?entity=openai&depth=2`。

### 8.3 P2 前端迁移

目标技术栈：

```text
Next.js
React
TypeScript
Tailwind CSS
React Flow 或 Cytoscape.js
TanStack Query
```

迁移原则：

- 先把当前静态功能逐页迁移，不重做产品结构。
- 数据先从 JSON API 读取。
- 图谱组件独立成 `GraphPanel`。
- 详情侧栏独立成 `EntityDetailPanel`。
- 过滤状态统一放在 URL query params。

## 9. 后端与 API 方案

P0/P1 没有后端。

P2 增加 API：

```http
GET /api/entities?query=nvidia&type=company&layer=chip_design
GET /api/entities/:slug
GET /api/entities/:slug/metrics
GET /api/entities/:slug/relationships?minConfidence=0.6
GET /api/graph?entity=openai&depth=2&minConfidence=0.6&type=all
GET /api/layers
GET /api/sources/:id
POST /api/admin/relationships/:id/approve
POST /api/admin/relationships/:id/reject
POST /api/admin/entities/merge
```

图谱响应：

```json
{
  "nodes": [
    {
      "id": "openai",
      "label": "OpenAI",
      "type": "company",
      "layer": "foundation_model",
      "status": "private"
    }
  ],
  "edges": [
    {
      "id": "rel_azure_openai",
      "source": "azure",
      "target": "openai",
      "type": "runs_on",
      "confidence": 0.92,
      "sourceIds": ["src_123"]
    }
  ]
}
```

## 10. 数据采集方案

### 10.1 当前 P0 脚本

当前已有：

```text
data/connectors.json
scripts/fetch-free-metrics.mjs
```

支持：

- GitHub repo 指标。
- Hugging Face model 指标。
- SEC company facts。
- `--dry-run` 查看请求计划。
- 输出 `data/free-metrics.snapshot.json`。
- `data/metric-overrides.json` 支持官方来源人工审核覆盖，解决免费 API 临时不可达但官方页面/API 已核验的指标。

当前设计要求：

- 采集脚本不直接覆盖 seed。
- 先生成 snapshot。
- 人工审核后再合并；覆盖项必须保留官方 `evidenceUrl`、证据强度和审核说明。

### 10.2 P1 采集流程

```text
connectors.json
-> fetch-free-metrics.mjs
-> free-metrics.snapshot.json
-> metric-overrides.json
-> approve-metrics.mjs
-> metrics.js
-> frontend display
```

新增脚本：

```text
scripts/approve-metrics.mjs
scripts/metric-overrides.mjs
```

P1 数据格式：

```json
{
  "generatedAt": "2026-07-02T00:00:00.000Z",
  "results": [
    {
      "entityId": "langchain",
      "source": "github",
      "metrics": {
        "stars": 123456,
        "forks": 10000
      }
    }
  ],
  "errors": []
}
```

### 10.3 P2 Worker

P2 后使用定时任务：

```text
GitHub Worker: daily
Hugging Face Worker: daily
SEC Worker: daily
OpenAlex Worker: weekly
Company Site Worker: weekly
News/RSS Worker: hourly or daily
```

Worker 输出：

```text
raw_document
metric
relationship candidate
source
```

所有自动抽取关系默认进入：

```text
status = candidate
```

人工审核通过后才进入主图谱。

## 11. 实体归一化

### 11.1 P0/P1

先维护简单 alias 字段：

```js
aliases: ["Nvidia Corporation", "NVDA", "英伟达"]
```

校验规则：

- `id` 唯一。
- `ticker` 不强制唯一，因为不同交易所可能重复。
- `website_url` 后续作为强匹配键。

### 11.2 P2

建立 `entity_alias` 表。

匹配优先级：

1. `ticker + exchange`
2. `website_domain`
3. `github_org`
4. `huggingface_org`
5. `legal_name`
6. `alias`
7. fuzzy match，只生成候选，不自动合并

实体合并要求：

- 合并前显示两个实体的所有关系和指标。
- 合并后保留旧 ID 到新 ID 的 redirect。
- 合并操作写入 audit log。

## 12. 实施步骤

### 12.1 阶段 P0：静态 MVP 整理，当前已完成

目标：

- 让网站能打开、能看图谱、能搜索、能查看详情。
- seed 数据可独立维护。
- 有最基础数据质量校验。

已完成交付：

- `index.html`
- `styles.css`
- `app.js`
- `data/seed.js`
- `data/connectors.json`
- `scripts/validate-data.mjs`
- `scripts/fetch-free-metrics.mjs`
- `README.md`

验收标准：

```bash
node scripts/validate-data.mjs
node scripts/fetch-free-metrics.mjs --dry-run
```

页面验收：

- 打开 `index.html` 不报错。
- 默认展示 OpenAI 详情。
- 搜索实体后详情和图谱联动。
- 1 层、2 层、全部图谱切换可用。
- 移动宽度无页面级横向溢出。

### 12.2 阶段 P1.1：扩充 seed 数据

目标：

- 从 25 个实体扩展到 100 个实体。
- 从 29 条关系扩展到 300 条关系。
- 每条关系至少有一个来源。

状态：已完成。当前为 112 个实体、777 条关系、11 个来源。

已完成步骤：

1. 新增 `data/p1-extension.js` 承载 P1 扩展数据。
2. 按产业层级补充实体到 112 个。
3. 给实体补充 `website_url`、`aliases`、`country`、`exchange`。
4. 生成并校验 777 条关系。
5. 扩展 `scripts/validate-data.mjs`，检查 `website_url`、country 和 aliases。
6. 前端搜索覆盖别名、官网、国家/地区、交易所。
7. 详情页展示官网、国家/地区、交易所和别名。

建议优先扩展：

- 半导体：Micron、Samsung、Synopsys、Cadence、Arm、Marvell、Coherent。
- 云和算力：Google Cloud、Oracle Cloud、Lambda、Crusoe、Nebius。
- 模型：Google DeepMind、Cohere、xAI、Together AI、Stability AI。
- Infra：LlamaIndex、Weights & Biases、Snowflake、Weaviate、Chroma、Modal。
- 应用：Harvey、Glean、Runway、Synthesia、Character AI、Replit。

验收标准：

```text
entities >= 100
relationships >= 300
all relationships have sourceId
all sourceId references are valid
```

### 12.3 阶段 P1.2：真实指标快照

目标：

- 把免费 API 拉到的指标展示到页面中。

当前状态：基本完成。GitHub、Hugging Face、SEC 和 OpenAlex 指标已经采集或审核并展示，当前共有 13 组 approved metric groups：3 组 GitHub、2 组 Hugging Face、5 组 SEC、3 组 OpenAlex。Hugging Face connector 已保留；当前本机直连官方 API 超时，因此 Meta AI 的 `facebook/bart-large-cnn` 与 Mistral 的 `mistralai/Mistral-7B-Instruct-v0.2` 使用官方模型页人工审核覆盖进入 `data/metrics.js`。`data/metric-overrides.json` 和 `scripts/metric-overrides.mjs` 已支持带 evidence URL 的审核覆盖；覆盖会移除同一 entity/source 的失败状态，并避免继续生成 retry backlog。

步骤：

1. 运行 `node scripts/fetch-free-metrics.mjs` 生成 snapshot。已完成。
2. 新增 `data/metrics.js` 保存审核后的指标。已完成。
3. 新增 `scripts/validate-metrics.mjs`。已完成。
4. 页面详情侧栏增加“公开指标”模块。已完成。
5. GitHub 指标展示 stars、forks、open issues、repo updated at。已完成。
6. Hugging Face 指标展示 downloads、likes、pipeline tag。已完成，当前 2 个模型用官方模型页人工审核覆盖；实时 connector 保留，待网络可达环境继续验证。
7. SEC 指标展示 revenue、assets、period end。已完成。
8. 每个指标显示来源和 `asOf`。已完成。
9. OpenAlex connector 和指标可视化。已完成，当前 3 组 works 指标已进入公开指标。
10. 免费指标人工审核覆盖机制。已完成，Hugging Face 两个模型已通过覆盖进入同一公开指标链路。

验收标准：

```text
至少 3 个 GitHub repo 指标可展示：已完成
至少 2 个 Hugging Face model 指标可展示：已完成，当前 2 个官方模型页审核覆盖指标可展示
至少 3 个 SEC company facts 指标可展示：已完成
指标显示更新时间和来源：已完成
OpenAlex connector：已完成，当前 3 个 works 指标可展示
```

### 12.4 阶段 P1.3：OpenAlex / arXiv

目标：

- 增加论文和研究机构维度。

当前状态：已完成 OpenAlex works 和 arXiv papers 学术候选第一版。`npm run fetch:openalex -- --fetch --per-page=5` 会按 `data/connectors.json` 中的 OpenAlex 配置拉取高引用 works；当前 3 组查询产出 15 条 work，`npm run candidates:generate` 会把这些 work 转成 paper、research_org、research_author、referenced work 候选实体，并生成 OpenAlex company/model-paper、paper-institution、paper-author、paper-paper citation 候选关系，paper payload 带 OpenAlex/DOI/arXiv/title dedup keys，author payload 带 normalized author name 和 author dedup keys，citation payload 带 source paper、target OpenAlex URL、引用方向和 referenced-by 明细。`npm run fetch:arxiv -- --fetch --max-results=5` 会按 arXiv 配置拉取预印本；当前 3 组查询产出 15 篇 paper，并生成 arXiv paper、research_author、company/model-paper 和 paper-author 候选；arXiv 作者会过滤空值/标点类无效名称并写入 normalized author name。当前 candidate snapshot 有 398 个候选实体和 401 条候选关系，其中学术来源关系为 30 条 `related_to`、47 条 `published_by`、191 条 `authored_by`、132 条 `cites`；`npm run db:e2e` 已验证候选实体审批后，paper-institution 候选关系可写入正式 `relationship` 表。`/admin` 候选实体队列已完成合并/去重基础版：会显示同 entityId、名称/别名、官网域名、DOI、OpenAlex/arXiv/ROR/作者 ID 的主图谱或候选匹配；支持 duplicate hints 一键 merge、搜索全量主图谱实体/duplicate hints/当前候选实体队列后选择目标、输入主图谱实体 ID 或候选实体 ID 后确认手动 merge，并在合并前显示旧 ID、目标 ID、redirect/audit log、候选关系端点引用数、目标指标字段和字段差异摘要；冲突字段可选择保留目标值、使用候选值或记录手动值，字段策略会写入 merge payload/audit log，并在 PostgreSQL merge 中更新目标主实体或目标候选字段；合并会记录 audit log，写入 `entity_redirect`，并把候选关系 payload 中的旧端点批量重挂到目标候选；公开实体详情和图谱 API 已能解析 redirect，详情面板会提示旧实体 ID 已合并；实体详情页已新增研究关联分区，会把已审批入图的论文、研究机构、作者和引用关系按相关研究、机构作者、引用关系分组展示。

步骤：

1. 新增 `openAlex` connector。已完成指标 connector 和 works snapshot connector。
2. 按机构或关键词拉取 works。已完成第一版，当前 3 组查询、每组 5 条高引用 works。
3. 抽取 paper、institution、author、citation_count、referenced works。已完成第一版，进入 OpenAlex snapshot 和 candidate entity/relationship payload，并补充 paper/author dedup keys 与 citation details。
4. 新增实体类型：`paper`、`research_org`、`research_author`。已完成候选实体层，审核后才进入主图谱。
5. 新增关系：`published_by`、`authored_by`、`cites`、`related_to`。已完成第一版候选生成和校验。
6. 页面详情展示相关论文、研究机构、作者和引用关系。已完成基础版：审批入图后在实体详情页 `ResearchSection` 分组展示。
7. 新增 arXiv connector。已完成第一版，当前 3 组查询、15 篇 paper 候选，并生成过滤无效名称后的作者候选。

验收标准：

```text
至少 20 篇论文：已完成，当前 30 篇直接 paper 候选，其中 15 篇来自 OpenAlex、15 篇来自 arXiv；另有 130 个 OpenAlex referenced work 候选用于 citation 边
至少 5 个研究机构：已完成候选层，当前 45 个 research_org 候选
论文实体能关联到公司或模型：已完成候选层，当前 30 条 company/model-paper `related_to` 候选关系；审核通过后进入公开图谱，并在实体详情页研究关联分区展示
论文能关联作者和引用：已完成候选层，当前 191 条 `authored_by` 和 132 条 `cites` 候选关系；审核通过后进入公开图谱，并在实体详情页研究关联分区展示
```

### 12.5 阶段 P2.1：迁移到 Next.js

目标：

- 保留当前体验，迁移到工程化前端。

当前状态：已完成。项目骨架、类型、数据导出、数据一致性校验、核心交互预览、URL 状态、只读 API、数据库导入验证、客户端异步 API adapter、候选关系/实体/指标审核流、关系候选编辑能力、组件拆分、React render smoke test、交互回调契约测试和 P0-P3 本地总验收入口已完成。

输入：

- `data/seed.js`
- `data/p1-extension.js`
- `data/metrics.js`
- 当前静态站的交互逻辑和 UI 信息架构

输出：

- 可构建的 Next.js 应用
- 类型化数据读取层
- 与静态站一致的搜索、过滤、详情和图谱体验

步骤：

1. 初始化 Next.js + TypeScript。
2. 建立 `scripts/export-next-data.mjs`，从现有 `window.AI_CAPITAL_SEED` / `window.AI_CAPITAL_METRICS` 导出 JSON。
3. 建立 `src/lib/types.ts`，定义 `Layer`、`Entity`、`Relationship`、`Source`、`MetricBundle`。
4. 建立 `src/lib/data.ts`，集中读取 generated JSON。
5. 建立 P2 预览页，先验证数据、构建和页面框架。
6. 建立 `scripts/validate-next-data.mjs`，保证 Next generated JSON 与 P1 数据源一致。
7. 建立 `CapitalMapClient` 客户端组件，迁移当前静态站核心状态。
8. 迁移搜索：覆盖名称、别名、官网、国家/地区、交易所、指标来源。已完成。
9. 迁移过滤：深度、关系类型、最低置信度。已完成。
10. 迁移图谱：复用 SVG 布局和 320 条边上限。已完成。
11. 迁移详情：身份信息、上下游关系、公开指标、采集失败、来源弹窗。已完成。
12. 用 URL query 保存选中实体、搜索词、深度、置信度、关系类型。已完成。
13. 继续拆组件：`StatsGrid`、`ControlPanel`、`GraphPanel`、`EntityDetailPanel`、`LayerGrid`、`SourceModal`、`RelationSection`、`MetricPanel`、`SourceList`、`CorrectionForm` 已完成；`npm run validate:render` 已提供 React 服务端渲染 smoke test 第一版，`npm run validate:interactions` 已覆盖 ControlPanel/GraphPanel 的交互回调契约第一版。
14. 增加基础测试：数据导出、类型读取、图谱过滤、详情面板渲染、搜索/过滤/选择/边点击交互回调。

验收标准：

```text
当前静态站所有交互在 Next.js 版本可用
npm run build 通过
核心类型无 any
静态站和 Next.js 版本读取的实体/关系/来源/指标数量一致
npm run validate:next-data 通过
npm run validate:p0-p3:local 通过
```

### 12.6 阶段 P2.2：数据库和 API

目标：

- 从静态数据迁移到数据库。

当前状态：基本完成。已完成 schema、seed import dry-run、可执行 SQL 生成、`DATABASE_URL` + `psql` apply 入口、`db:verify` 表计数和关键样例验证脚本、API repository、JSON fallback、临时 PostgreSQL 导入/API 验证、首页初始数据源切换，以及客户端异步 API adapter。已新增两条长期本地 PostgreSQL 路径：Docker Compose 路径提供 `db:up`、`db:down`、`db:bootstrap`；native 路径提供 `db:bootstrap:native`、`db:stop:native`，默认连接串为 `postgres://ai_capital:ai_capital@127.0.0.1:55432/ai_capital`，数据目录为 `.local/postgres/data`。`db:status` 会同时诊断 compose、Docker daemon、native PostgreSQL 工具链、native cluster、`DATABASE_URL` 连接和 schema 状态；`db:status -- --require-ready` 已可作为本机/部署验收门禁，并已在 Docker daemon 未运行的本机环境通过 native 长期库验证。

步骤：

1. 选择 PostgreSQL。已完成。
2. 建 `db/schema.sql`。已完成。
3. 编写 seed import dry-run 脚本 `scripts/plan-seed-import.mjs`。已完成。
4. 生成 idempotent PostgreSQL upsert SQL。已完成。
5. 增加 `DATABASE_URL` + `psql` apply 入口。已完成，并已用临时 PostgreSQL 验证。
6. 增加 `scripts/verify-db-import.mjs`，验证表计数、NVIDIA profile、Qdrant 关系样例。已完成，并已通过。
7. 实现 JSON fallback 只读 API：`/api/entities`、`/api/entities/:id`、`/api/graph`。已完成。
8. 引入轻量 PostgreSQL client `pg`。已完成。
9. API 从数据库读取实体、关系、指标。已用临时 PostgreSQL 验证 `meta.dataSource=postgres`。
10. 首页初始图谱和指标通过统一仓储读取，并按 `DATABASE_URL` 在 PostgreSQL 与 JSON fallback 间切换。已完成。
11. 前端搜索、详情和图谱过滤继续拆成异步 API adapter，避免首屏一次性携带全部数据。已完成，保留本地 seed fallback。
12. 保留静态 fallback，避免开发期数据库不可用。
13. 增加长期本地 PostgreSQL 配置：`docker-compose.yml`、`.env.example`、`npm run db:up`、`npm run db:down`、`npm run db:bootstrap`、`npm run db:bootstrap:native`、`npm run db:stop:native`、`npm run db:status`。已完成 Docker Compose 和 native 两条启动路径；native bootstrap 已实际完成初始化、seed import、worker import、`db:verify`、`worker:verify` 和 `db:status -- --require-ready` 验收，Docker Compose 路径在 Docker daemon 可用时仍可作为替代运行方式。

验收标准：

```text
数据库可从 data/seed.js 导入
GET /api/entities 可搜索
GET /api/graph 可返回 1-2 层图谱
页面不再直接依赖 window.AI_CAPITAL_SEED
首页可显示当前数据源：PostgreSQL / JSON fallback
浏览器端搜索、详情、图谱过滤会调用只读 API
```

### 12.7 阶段 P2.3：审核后台

目标：

- 自动采集的数据先进入候选区，人工审核后再进主图谱。

当前状态：基本完成。候选关系、候选实体、候选指标的基础审核流已完成：`/admin` 后台、三类候选列表、关系候选 confidence/note/source/evidence 编辑、候选指标 metric type/value/as-of/source/source ref/confidence/evidence/note 口径编辑、候选实体重复提示、duplicate hints 一键 merge、全量主图谱/候选队列搜索式合并目标选择、手动目标 ID merge、候选关系端点影响预览、目标指标字段预览、字段差异摘要、冲突字段策略选择、merge payload/audit log 策略记录、候选实体 merge 到已有实体、候选到候选 merge、目标主实体/目标候选字段覆盖策略、`entity_redirect`、候选关系端点重挂、公开实体详情和图谱 redirect 解析、详情页合并提示、approve/reject API、audit log、JSON fallback 审核状态、PostgreSQL 写入路径，以及 approve 后进入公开读取路径。`ADMIN_REVIEW_TOKEN` 继续作为 legacy admin token；`ADMIN_REVIEW_ADMIN_TOKEN` 和 `ADMIN_REVIEW_REVIEWER_TOKEN` 已提供轻量角色权限，admin 可 edit/merge/approve/reject，reviewer 只能 approve/reject，actor 会写入 audit log；`/api/admin/session` 已提供用户名/密码登录和 HttpOnly 签名 session cookie，`/admin` 前端支持会话登录/退出并保留 token fallback。

步骤：

1. 增加 `candidate_relationship` 或给 `relationship` 加 `status`。已完成。
2. 增加后台列表：候选关系、候选实体、候选指标。已完成。
3. 支持 approve/reject。已完成。
4. 支持编辑 confidence、note、source。已完成，并补充关系 evidence URL 编辑和指标口径编辑。
5. 增加 audit log。已完成。
6. 低置信度关系默认不进入主图谱。已完成，只有 approve 后才合并进图谱读取路径。
7. 候选实体 approve 后进入实体搜索/图谱实体池。已完成。
8. 候选指标 approve 后进入实体详情指标。已完成。
9. 候选实体 merge 到已有实体。已完成基础版，支持主图谱匹配项 merge、全量主图谱实体搜索选择目标、手动输入主图谱目标 ID、alias 合并和 audit log。
10. 候选到候选 merge。已完成基础版，支持 duplicate hints 一键合并、搜索当前候选实体队列选择目标、手动输入候选目标 ID、`entity_redirect`、候选关系端点重挂、公开实体详情/图谱 redirect 解析、详情面板合并提示和 PostgreSQL E2E 验证。
11. 候选指标口径编辑。已完成基础版，支持 JSON fallback 与 PostgreSQL 更新，并由 `candidate:verify-metric-edit` 验证 approve 使用编辑后的正式指标字段；`candidate:verify-worker-metric` 覆盖真实 worker RSS 候选指标经人工口径编辑后写入正式 `metric` 表。
12. 审核权限。已完成轻量角色/会话版，`ADMIN_REVIEW_TOKEN` 继续作为 legacy admin token；`ADMIN_REVIEW_ADMIN_TOKEN` 可执行 edit/merge/approve/reject，`ADMIN_REVIEW_REVIEWER_TOKEN` 只能 approve/reject；也可设置 `ADMIN_REVIEW_ADMIN_USERNAME`/`ADMIN_REVIEW_ADMIN_PASSWORD`、`ADMIN_REVIEW_REVIEWER_USERNAME`/`ADMIN_REVIEW_REVIEWER_PASSWORD` 和 `ADMIN_REVIEW_SESSION_SECRET` 启用 HttpOnly session cookie 登录；actor 写入 audit log，并由 `npm run validate:admin-auth` 校验。
13. 冲突字段处理策略。已完成基础版，审核员可对差异字段选择保留目标值、使用候选值或记录手动值，覆盖 name/type/layer/description/websiteUrl/country/status/valuation/aliases；策略写入 merge payload/audit log，并在 PostgreSQL merge 中更新目标主实体或目标候选字段；`npm run db:e2e` 中的 `candidate:verify-merge` 会验证 `mergeFieldPolicy` 和目标字段更新。
14. 审核 UX 回归。已完成第一版，`npm run validate:admin-ux` 会检查手动合并表单、全量主图谱/候选队列搜索式目标选择、指标影响预览、字段差异摘要、字段策略控件、确认勾选、主实体/候选实体目标字段、目标字段覆盖 SQL、候选关系端点影响预览和移动端布局钩子。

验收标准：

```text
候选关系不会默认出现在公开图谱
审核通过后出现在图谱
拒绝后保留日志但不展示
```

### 12.8 阶段 P3：自动抽取和研究功能

目标：

- 从网站变成持续更新的研究平台。

当前状态：已启动第一版 worker、结构化解析层、抽取层、RSS worker fixture、LLM 适配层、Wikidata profile connector、OpenAlex works connector、arXiv papers connector、研究产物层、用户纠错入口、数据库 E2E、常驻 DB P3 持久化验证、weekly research cycle、环境配置校验和 P0-P3 readiness audit。`npm run candidates:generate` 会读取 `data/connectors.json`、`data/free-metrics.snapshot.json`、`data/wikidata-profiles.snapshot.json`、`data/openalex-works.snapshot.json`、`data/arxiv-papers.snapshot.json` 和已审核 `data/metrics.js`，输出 `data/candidate-snapshot.json` 和 `data/evidence-backlog.json`；`npm run fetch:wikidata -- --fetch` 会从 Wikidata API 生成基础资料 snapshot，并转成 candidate entity；`npm run fetch:openalex -- --fetch --per-page=5` 会从 OpenAlex API 生成 works snapshot，并转成 paper、research_org、research_author、referenced work 候选实体与 `related_to`、`published_by`、`authored_by`、`cites` 候选关系，同时写入论文/作者 dedup keys、normalized author name 和 citation details；`npm run fetch:arxiv -- --fetch --max-results=5` 会从 arXiv API 生成 papers snapshot，并转成 paper、research_author 候选实体与 `related_to`、`authored_by` 候选关系，同时过滤无效作者名称；`npm run worker:run -- --offline` 会读取 `data/research-watchlist.json`，生成 `data/worker-run.json` 和 `data/raw-documents.json`；`npm run worker:run -- --fetch --timeout-ms=10000` 已支持真实 HTTP 抓取，记录 HTTP 状态、content type、content hash、正文预览和短 raw excerpt，抓取失败会标记为 `fetch_failed` 并跳过候选生成，旧 worker 候选会按 watchlist 替换清理；`npm run worker:parse` 会从 raw document 生成 `data/parsed-documents.json`，包含格式识别、正文、HTML 章节、链接、RSS item、table row facts、财报字段 facts、PDF quality gate、hint、parser status 和 quality gate；`npm run validate:parser` 用 HTML/RSS/PDF fixture 覆盖结构化 parser；`npm run worker:extract` 会从 parsed document 生成 `data/extraction-candidates.json`、带结构化章节/链接/facts 上下文的 LLM-ready prompt、候选关系和候选指标抽取结果，并把财务 facts 转成待审核 candidate metric，最终 candidate snapshot 会按稳定 ID 去重；`npm run validate:rss-worker` 会用本地 RSS XML fixture 验证 RSS raw document 到 parsed RSS item/facts、extraction record、candidate relationship/metric 的链路；`npm run worker:llm -- --provider=fixture` 会生成 `data/llm-extractions.json`，校验 provider/model 输出 schema，并按稳定 ID 合并进 candidate snapshot；`npm run llm:status` 会诊断当前 LLM provider，并可用 `--require-provider=command|http` 强制探测外部 provider schema；设置 `LLM_EXTRACT_COMMAND` 后可用 `--provider=command` 调外部模型命令；设置 `LLM_EXTRACT_URL` 后可用 `--provider=http` 调 HTTP 模型网关，支持 Bearer token、超时控制、`{ data: ... }` 响应 envelope，并已用本地 `validate:llm-http` 自动验证 HTTP fixture、鉴权、schema、dry-run 和 production gate；`npm run candidates:sync` 可把 candidate snapshot 合并进 Next generated fallback 审核队列；`npm run candidates:archive` 会把当前 candidate snapshot 写入 `data/research/candidate-snapshots/` 并更新 manifest，按内容 hash 去重；`npm run worker:import` 可把 connector run、raw document、parsed document、extraction record、LLM extraction 和候选关系/实体/指标三类 candidate snapshot 导入 PostgreSQL candidate 表；`npm run db:verify:p3-persistent` 会在常驻 PostgreSQL 验证 P3 raw/parsed/extraction/LLM/candidate snapshot 已导入，并提交、重读、清理用户纠错 candidate/audit 记录；`npm run research:generate` 会生成 `data/research/graph-snapshot.json`、`data/research/timeline.json` 和 `data/exports/*.csv`，其中 candidate entity、Wikidata profile、OpenAlex works、arXiv papers 和 candidate snapshot archive manifest 也会导出为 CSV；`npm run research:weekly` 会把免费 connector、worker、parser、extractor、LLM fixture/外部 provider、archive、research export、可选常驻 DB import 和校验串成每周刷新流程，`.github/workflows/research-weekly.yml` 可按周触发并在 artifacts 变化时创建刷新 PR；`npm run db:e2e` 会启动临时 PostgreSQL，导入 seed 和 worker artifacts，运行 `db:verify`、`worker:verify` 和 `candidate:verify-approval`，其中 `candidate:verify-approval` 会验证候选实体审批后 paper-institution 候选关系可写入正式 `relationship` 表；`npm run validate:env` 会检查 `.env.example` 覆盖数据库、审核、LLM、免费源和本机 PostgreSQL 配置，并在 `--require-production` 下要求真实数据库、审核鉴权和生产 LLM；`npm run audit:p0-p3` 会检查关键脚本、环境配置校验入口、generated 数据、candidate snapshot、research graph/timeline、validation/weekly workflow 文件和关键命令片段、证据 backlog 审查状态和生产 LLM 配置状态，`--require-production-llm` 可作为发布门禁；实体详情页的纠错表单会通过 `POST /api/corrections` 写入 candidate queue 和 audit log。当前真实 fetch 链路产出 13 组 approved metric groups、0 个 metric failures、4 个 connector run、9 个 raw document、9 个 parsed document、4 个 RSS parsed document、54 个 RSS item、64 条 parsed facts、9 条 extraction record、9 条 LLM extraction record、401 条候选关系、398 个候选实体、5 条候选指标、5 个 Wikidata profiles、15 条 OpenAlex works、15 篇 arXiv papers、0 个失败重试任务、19 份 candidate snapshot archive、50 条优先补证据关系、879 条 timeline 事件和 15 组 CSV export。

步骤：

1. 免费指标 snapshot 转候选和重试 backlog。已完成第一版。
2. 证据补强 backlog。已完成第一版。
3. 公司公告和 IR 页面采集。已完成 watchlist/worker 第一版，并支持真实 HTTP fetch。
4. 新闻 RSS 采集。已完成 watchlist/worker 第一版，并支持真实 HTTP fetch；OpenAI 官方 RSS、NVIDIA 官方博客 RSS、AWS Machine Learning Blog RSS 和 Meta Engineering RSS 已进入 raw/parsed/extraction/LLM/candidate/archive 链路。
5. 财报 PDF/HTML 解析。已完成内置结构化 parser 第一版，支持 html/json/rss/pdf/text 格式识别、正文规范化、HTML 章节、链接、RSS item、table row facts、revenue/operating income/net income/capex/R&D/gross margin/operating margin 财报字段 facts、`financialFactCount` quality gate、PDF quality gate 和 parser fixture 校验；更深的 PDF 表格抽取、单位标准化和期间归因可继续增强。
6. LLM 抽取关系候选。已完成 parsed document 抽取层、规则化 extraction hint、LLM-ready prompt、LLM output schema 校验、`LLM_EXTRACT_COMMAND` 命令适配、`LLM_EXTRACT_URL` HTTP 网关适配、`llm:status` provider 就绪门禁、`validate:llm-http` 本地 HTTP provider 合约验证、`llm:verify-production` 生产验收门禁、`--limit`/`--only-extracted` 抽样 dry-run、command timeout、HTTP/command provider 限流和指数退避重试第一版；真实云端模型 URL/凭证需要在部署环境配置。
7. 图谱快照。已完成第一版。
8. 事件 timeline。已完成第一版。
9. 数据导出 CSV/JSON。已完成第一版。
10. 公开 API。已完成 research API 第一版。
11. 环境配置门禁。已完成 `.env.example` 覆盖校验和生产必需项校验，`validate:p0-p3:local` 已接入 `validate:env`。
11. 用户纠错入口。已完成第一版。
12. Candidate snapshot 长期归档和去重。已完成第一版，manifest 会记录 latest archive、content hash 和候选/重试计数。
13. 每周自动发现流程。已完成第一版，`npm run research:weekly` 支持 dry-run、真实 fetch、可选常驻 DB 导入和 provider 参数，GitHub Actions workflow 可按周运行并提交刷新 PR。
14. 常驻数据库 P3 持久化验证。已完成第一版，`db:verify:p3-persistent` 会验证 P3 artifact/candidate snapshot 已进入常驻 PostgreSQL，并验证用户纠错 candidate/audit 的写入、重读和清理。

验收标准：

```text
每周自动发现新候选关系
每条候选关系有 evidence_url
用户能查看图谱变化历史
```

## 13. 细化实施计划

### 13.1 近期里程碑

| 里程碑 | 状态 | 目标 | 主要交付 | 验收 |
| --- | --- | --- | --- | --- |
| P0 静态 MVP | 已完成 | 验证产品形态 | 静态页面、seed、基础校验 | 页面可打开，图谱/搜索/详情可用 |
| P1.1 数据扩充 | 已完成 | 达到可研究的数据密度 | 112 实体、777 关系、11 来源 | `node scripts/validate-data.mjs` 通过 |
| P1.2 免费指标 | 基本完成 | 展示真实公开指标 | GitHub/Hugging Face/SEC/OpenAlex 指标、人工审核覆盖、来源弹窗、connector 失败诊断机制 | `node scripts/validate-metrics.mjs` 通过；当前 13 组 approved metric groups、0 个 metric failures |
| P1.3 证据细化 | 已启动 | 把高价值关系绑定到更细 URL，并降级无证据推断边 | evidence backlog、direct evidence override、relationship review override、来源类型、授权口径、证据强度展示、top 75 evidence review 校验 | 已生成 50 条优先补证据关系；`source_type`、`license_note`、`fetched_at` 和证据强度基础展示已完成；20 条关系已绑定具体 evidence URL 并进入 CSV/DB，其中 8 条关系标记为 `official_docs`，6 条竞争关系标记为 `official_product_overlap`，4 条关系标记为 `credible_report`，2 条关系标记为 `third_party_index`；top 75 backlog 已全部审查，75 条均标记为 `inferred_ecosystem_mapping` 并降 confidence；`npm run validate:evidence` 已覆盖 top 75 不含未审查关系 |
| P2.1 Next.js 迁移 | 已完成 | 建立工程化前端 | Next.js、类型、导出脚本、交互预览页、URL 状态、图谱/详情脚本级回归测试、React render smoke test、交互回调契约测试、P0-P3 本地总验收脚本、P0-P3 readiness audit | `npm run validate:next-data`、`npm run validate:graph`、`npm run validate:render`、`npm run validate:interactions`、`npm run audit:p0-p3`、`npm run validate:p0-p3:local -- --skip-db-e2e --skip-build` 和 `npm run build` 通过 |
| P2.2 API + DB | 基本完成 | 从静态文件迁到数据库 | PostgreSQL schema、seed import dry-run、SQL/apply 入口、db verify、API repository、JSON fallback、首页数据源切换、客户端异步 API adapter、Docker Compose 长期本地 PostgreSQL 配置、native 本机 PostgreSQL bootstrap、`db:status` 状态门禁 | 临时 PostgreSQL 导入、native 长期 PostgreSQL、API postgres 数据源、首页 fallback、浏览器端 API 调用已验证；compose 配置已通过 `docker compose config`，`db:status` 可诊断 daemon/native DB/schema 状态，`db:bootstrap:native` 和 `db:status -- --require-ready` 已通过 |
| P2.3 审核后台 | 基本完成 | 自动采集先候选后审核 | 关系/实体/指标 candidate queue、关系编辑、指标口径编辑、候选实体重复提示、duplicate hints 一键 merge、全量主图谱/候选队列搜索式目标选择、手动目标 ID merge、候选关系端点影响预览、目标指标字段预览、字段差异摘要、字段策略控件、目标主实体/目标候选字段覆盖、merge payload/audit log 策略记录、候选实体 merge 到已有实体、候选到候选 merge、`entity_redirect`、候选关系端点重挂、公开实体详情和图谱 redirect 解析、详情页合并提示、legacy/admin/reviewer token 轻量角色权限、HttpOnly session cookie 登录、approve/reject、audit log、`/admin` | 三类候选 approve 后进入公开读取路径，reject 不展示；`npm run validate:dedup` 能验证去重信号，`npm run validate:admin-ux` 能验证搜索/手动合并审核入口、指标影响预览、字段策略控件、字段差异摘要、会话登录面板和影响预览，`npm run validate:admin-auth` 能验证审核 mutation 权限、reviewer/admin 角色边界和 session cookie，`npm run db:e2e` 会执行 `candidate:verify-merge`、`candidate:verify-metric-edit` 和 `candidate:verify-worker-metric`，其中 `candidate:verify-merge` 会验证 `mergeFieldPolicy` 和目标字段更新，`candidate:verify-worker-metric` 会验证真实 worker RSS 候选指标人工改口径后写入正式 `metric` 表 |
| P3 研究平台 | 已启动 | 持续采集和研究分析 | 候选生成 worker、Wikidata profile connector、OpenAlex works connector、arXiv papers connector、paper/research_org/research_author/referenced work 候选、论文/作者 dedup keys、arXiv 作者过滤、citation details、`related_to`/`published_by`/`authored_by`/`cites` 学术候选关系、实体详情页研究关联分区、connector run、raw document、parsed document、parsed facts、结构化 parser fixture、RSS worker fixture、财报字段 facts、OpenAI/NVIDIA/AWS/Meta 真实 RSS 入库、fetch 失败候选清理、抽取记录、LLM-ready prompt、LLM extraction records、重试 backlog、证据 backlog、generated fallback 同步、candidate snapshot archive、weekly research cycle、GitHub Actions 周期刷新 PR、graph snapshot、timeline、CSV/JSON export、research API、用户纠错入口、真实 HTTP fetch 第一版、research artifact 校验、PostgreSQL E2E、三类 candidate snapshot 入库、常驻 DB P3 持久化验证、candidate relationship approval 验证、candidate entity merge 验证、candidate metric edit 验证、worker RSS metric approval 验证、LLM command provider、LLM HTTP provider、本地 HTTP fixture、`llm:status` provider 门禁、`validate:llm-http` 本地 HTTP 合约门禁、`llm:verify-production` 生产门禁、`audit:p0-p3 -- --require-production-llm` 发布门禁、限流/重试和抽样 dry-run；真实云端 LLM URL/凭证待环境注入 | `npm run fetch:wikidata -- --fetch --timeout-ms=15000`、`npm run fetch:openalex -- --fetch --per-page=5 --timeout-ms=15000`、`npm run fetch:arxiv -- --fetch --max-results=5 --timeout-ms=15000`、`npm run candidates:generate`、`npm run candidates:archive`、`npm run research:weekly -- --skip-db --skip-build`、`npm run worker:run -- --dry-run`、`npm run worker:run -- --fetch --dry-run --timeout-ms=500`、`npm run worker:parse -- --dry-run`、`npm run worker:extract -- --dry-run`、`npm run validate:rss-worker`、`npm run validate:llm-http`、`npm run validate:worker-cleanup`、`npm run llm:status`、`npm run audit:p0-p3`、`npm run worker:llm -- --provider=fixture --dry-run`、`LLM_EXTRACT_COMMAND='node scripts/llm-command-fixture.mjs' npm run llm:status -- --provider=command --require-provider=command`、`LLM_EXTRACT_COMMAND='node scripts/llm-command-fixture.mjs' npm run worker:llm -- --provider=command --dry-run`、`LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token npm run llm:status -- --provider=http --require-provider=http --timeout-ms=5000`、`LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token npm run worker:llm -- --provider=http --dry-run --timeout-ms=5000`、`LLM_EXTRACT_URL=http://127.0.0.1:55991 LLM_EXTRACT_API_KEY=test-token LLM_EXTRACT_RPM=600 LLM_EXTRACT_MAX_RETRIES=1 npm run llm:verify-production -- --provider=http --timeout-ms=5000 --limit=1`、`npm run candidates:sync -- --dry-run`、`npm run worker:plan-import`、`npm run worker:verify-plan`、`npm run db:verify:p3-persistent`、`npm run candidate:verify-approval`（由 `db:e2e` 在临时数据库中执行）、`npm run candidate:verify-merge`（由 `db:e2e` 在临时数据库中执行）、`npm run candidate:verify-metric-edit`（由 `db:e2e` 在临时数据库中执行）、`npm run candidate:verify-worker-metric`（由 `db:e2e` 在临时数据库中执行）、`npm run research:generate`、`npm run validate:parser`、`npm run validate:research`、`npm run validate:graph`、`npm run validate:render`、`npm run validate:interactions`、`npm run validate:dedup`、`npm run validate:admin-ux`、`npm run validate:admin-auth`、`npm run db:e2e`、`npm run build` 通过；当前 398 个候选实体、401 条候选关系、5 条候选指标、4 个 RSS parsed document、54 个 RSS item、30 篇直接 paper 候选、130 个 referenced work 候选、879 条 timeline events、19 份 candidate snapshot archive；`/api/research/export` 支持 raw/parsed/extraction/llm/candidate/candidate-entities/candidate-metrics/wikidata-profiles/openalex-works/arxiv-papers/candidate-snapshot-archives 数据集，latest candidate snapshot archive 支持 JSON 回溯 |

### 13.2 从当前版本继续的实施顺序

当前版本已经具备静态 fallback、Next.js 前端、只读 API、候选审核后台、PostgreSQL schema、免费源 worker、research artifact、weekly workflow 和本地 P0-P3 总验收脚本。后续开发不再按“迁移静态站”推进，而是按数据可信度、长期持久化、生产采集和研究体验推进。

| 阶段 | 目标 | 输入 | 输出 | 验收命令 |
| --- | --- | --- | --- | --- |
| A. 证据收口 | 把高价值主图谱关系从泛来源变成可解释证据 | `data/evidence-backlog.json`、官网/IR/SEC/产品文档/可信报道 | direct evidence override、relationship review override、降级后的 inferred 关系 | `npm run validate:evidence`、`npm run export:data`、`npm run validate:next-data` |
| B. 免费源扩展 | 扩大自动发现覆盖，但只产出候选 | RSS watchlist、Wikidata、OpenAlex、arXiv、GitHub、Hugging Face、SEC | raw/parsed/extraction/LLM artifact、candidate relationship/entity/metric、retry backlog | `npm run research:weekly -- --skip-db --skip-build`、`npm run validate:research` |
| C. 长期库运营 | 让本机/部署环境都能复现同一套数据状态 | seed、metrics、worker artifacts、candidate snapshot | 常驻 PostgreSQL、schema readiness、P3 artifact import、用户纠错持久化 | `npm run db:bootstrap:native`、`npm run db:status -- --require-ready`、`npm run db:verify:p3-persistent` |
| D. 审核闭环 | 把候选进入公开图谱前的人工决策做稳定 | `/admin`、candidate queue、duplicate hints、audit log | approve/reject/merge/edit、redirect、正式 relationship/entity/metric | `npm run validate:admin-auth`、`npm run validate:admin-ux`、`npm run db:e2e` |
| E. 生产 LLM 接入 | 把真实模型网关接到同一候选协议 | `LLM_EXTRACT_URL`、`LLM_EXTRACT_API_KEY`、模型名和限流配置；`LLM_EXTRACT_COMMAND` 仅保留给本地或自定义 CI | schema 合法的 LLM extraction record、带证据候选、不直接污染主表 | `npm run llm:status -- --require-provider=http`、`npm run llm:verify-production -- --provider=http --limit=1` |
| F. 生产配置门禁 | 避免部署环境缺 DB、审核鉴权或 LLM 凭证 | `.env.example`、部署 env、GitHub secrets/vars | 环境变量覆盖清单、生产必需项检查、CI 早失败 | `npm run validate:env`、`npm run validate:env -- --require-production` |
| G. 研究体验增强 | 让用户看懂变化、来源和待审核状态 | graph snapshot、timeline、CSV/JSON export、research API | 变化历史、数据导出、候选快照回溯、实体研究关联分区 | `npm run research:generate`、`npm run validate:research`、`npm run build` |
| H. 生产完成证据 | 防止本地 fixture 或陈旧 artifact 被误认为生产完成 | GitHub `production` environment、workflow run metadata、生产 evidence artifact、expected commit/repo/ref、dispatch timestamp | `p0-p3-production-readiness-report` artifact、verified run id/attempt、createdAt-after-dispatch、completion matrix `complete` 状态 | `npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main`、`npm run validate:production-completion -- --commit=... --repo=... --ref=refs/heads/main --run-id=... --dispatch-started-at=... --download` |

执行优先级：

1. 先跑 `npm run validate:p0-p3:local -- --skip-db-e2e --skip-build`，确认静态数据、Next 数据、P2/P3 artifact 和审核脚本没有断。
2. 持续处理新增 evidence backlog；找不到直接公开证据时继续保留低置信度或推断状态，不能为了图谱完整性升高置信度。
3. 扩展 RSS/IR/公告 watchlist，每加一个来源都要保证失败不会生成候选，成功时至少保留 raw document、parsed document、extraction record 和 evidence URL。
4. 在常驻 PostgreSQL 中重复导入 seed 和 worker artifacts，确保 upsert 幂等、candidate ID 稳定、用户纠错能写入和清理。
5. 配置真实 LLM 网关后只运行抽样 dry-run，通过 schema、鉴权、限流和重试门禁后再允许进入候选队列。
6. 生产发布只通过 `production:p0-p3:run` 或等价 `validate:production-completion` 收口；不能用本地 fixture、手写 evidence 文件或旧 artifact 把 completion matrix 人工改成完成。
7. 每次 production artifact 变更后运行 `npm run audit:p0-p3:matrix`，确认无真实证据时矩阵仍为 `local_ready_production_pending`，有真实证据时才记录 `productionSourceRevision.gitCommit` 和 `summary.productionGitCommit`。
8. 生产 release checklist 使用 schema v2；每个 pending external 项必须同时有兼容单行 `command` 和可逐步执行的 `commands[]`，其中 source revision、production secrets、DB 导入验证和 completion metadata 校验都必须给出具体命令。

### 13.3 分周实施步骤

第 0 周，基线冻结：

- 运行 `npm run validate:p0-p3:local`，把当前 P0-P3 的本地基线固定下来。
- 运行常驻库分支：`DATABASE_URL=postgres://ai_capital:ai_capital@127.0.0.1:55432/ai_capital npm run validate:p0-p3:local -- --with-persistent-db --skip-db-e2e --skip-build`。
- 输出当前能力清单：实体/关系/来源数、candidate snapshot 规模、RSS item 数、timeline event 数、仍需直接证据的关系。

第 1 周，证据与来源可信度：

- 逐条处理新增高优先级 evidence backlog。
- 对官方文档、财报、SEC、IR、产品文档、可信报道、第三方索引分别补 `source_type`、`evidence_strength` 和授权口径。
- 更新 `data/evidence-overrides.json` 或 `data/relationship-review-overrides.json` 后运行 `npm run candidates:generate`、`npm run research:generate`、`npm run validate:evidence`。

第 2 周，免费源扩展：

- 增加 10-20 个公司官网、IR、工程博客、RSS 或 SEC 入口到 `data/research-watchlist.json`。
- 每个入口先用 dry-run，再真实 fetch；失败只进入 connector run 错误和 retry backlog。
- 扩展 parser 的财报字段、单位标准化、期间归因和 PDF/table row 解析。

第 3 周，候选审核运营：

- 选取一批 RSS/论文/指标候选做人工审批样本，覆盖 approve、reject、merge、metric edit。
- 增强 `/admin` 的候选排序、冲突提示、证据摘录、历史决策和重复实体解释。
- 用 `npm run db:e2e` 验证候选关系、候选实体合并、候选指标编辑和 worker 指标审批都能进入正式表。

第 4 周，生产 LLM 网关：

- 在部署环境配置 `LLM_EXTRACT_URL`、`LLM_EXTRACT_API_KEY`、`LLM_EXTRACT_RPM`、`LLM_EXTRACT_MAX_RETRIES`。
- 先运行 `npm run llm:status -- --provider=http --require-provider=http --timeout-ms=30000`。
- 再运行 `npm run llm:verify-production -- --provider=http --timeout-ms=30000 --limit=1`；只允许 dry-run 抽样通过后进入候选合并。

第 5 周，研究产品化：

- 给 research snapshot、timeline 和 export 增加页面级入口，让用户能查看“本周新增候选”“证据待补”“已批准变化”。已完成 `/research` 第一版，展示候选队列规模、层级/关系分布、高连接实体、最新研究事件、候选快照历史和 CSV/JSON 下载入口；timeline 已支持本周新增、候选、证据待补、采集链路、已入图/指标、全部筛选、审批状态筛选和关键词搜索，并把 `view`/`q`/`entity`/`status` 同步到 URL 以便复制、刷新和回退；实体详情页已接入该实体最近 8 条 research timeline event，并链接到 `/research?entity=...` 完整实体 timeline；`/api/research/timeline` 也支持 `entity` 精确过滤和 `status` 过滤。
- 为重点公司详情页增加研究关联分组、最近变化、公开指标趋势和候选纠错入口。
- 保留 CSV/JSON 导出，便于把结果交给人工研究或外部 notebook。

第 6 周，部署与自动化：

- 在 GitHub Actions 配置 weekly research refresh 的 token、限流、可选 LLM provider 和 PR 分支策略。
- 部署 Next.js 应用，配置只读公开环境和受保护审核环境。
- 把 `validate:p0-p3:local` 和 `validate:p0-p3:production` 放进 CI 门禁，防止自动刷新破坏公开图谱。已新增 `.github/workflows/validate-p0-p3.yml`：PR/main push 运行完整本地 P0-P3 验收，手动触发可选择 `production_llm=true` 并使用 secrets 运行生产环境、生产 DB、生产 LLM readiness audit 与 dry-run 统一门禁。

### 13.4 P1.3 证据细化任务

输入：

- 当前 777 条关系
- 当前 11 个来源
- 公司官网、IR、SEC、GitHub、Hugging Face、OpenAlex、arXiv、新闻稿 URL

输出：

- 每条高价值关系尽量绑定具体 evidence URL
- `source` 从泛来源升级为具体页面或文档
- 关系 note 从推断描述升级为事实摘要

执行步骤：

1. 按 `confidence >= 0.8`、核心节点、用户常查节点筛出优先关系。
2. 对 `runs_on`、`supplies_to`、`integrates_with`、`partners_with` 四类关系优先补证据。
   已完成第一批 direct evidence override：NVIDIA/CoreWeave、Azure/OpenAI、Microsoft/OpenAI 投资合作、Hugging Face/LangChain、Pinecone/LangChain、Databricks/OpenAI 等 6 条关系已绑定官方 URL，并从 evidence backlog 中剔除。
   已完成第二批产品重叠证据 override：OpenAI/ElevenLabs、Midjourney/OpenAI、Snowflake/Databricks、Glean/Perplexity、Stability AI/Runway、Runway/Adobe Firefly 等 6 条竞争关系已绑定官方产品页，并用 `official_product_overlap` 区分为能力重叠证据。
   已完成第三批可信报道证据 override：Scale AI/OpenAI、CoreWeave/Mistral AI 等 2 条关系已绑定可信报道 URL，并用 `credible_report` 区分为报道证据。
   已完成第四批补证据：Broadcom/AWS、Supermicro/CoreWeave 等 2 条关系用 `credible_report`，OpenAI/Perplexity、Anthropic/Perplexity 等 2 条关系用 `third_party_index`，并从 evidence backlog 中剔除。
   已完成第五批官方证据 override：Sequoia/Hugging Face 和 AWS/Anthropic 等 2 条投资/战略合作关系已绑定官方页面，并从 evidence backlog 中剔除。
3. 给来源增加 `source_type`、`license_note`、`fetched_at` 的 P2 字段映射。已完成基础版，并进入 seed 校验、Next generated JSON、PostgreSQL import 和来源弹窗展示。
4. 对无法找到公开证据的关系降 confidence 或标记为 inferred。已完成 top 75 evidence backlog 审查：Labelbox/Cohere、Arista/CoreWeave 以及 Hugging Face、LangChain、Databricks、Pinecone、LlamaIndex、Weights & Biases、Snowflake、Weaviate、Chroma、MongoDB、Elastic、Redis、Milvus/Zilliz 到应用层的一批泛化供应边均标记为 `inferred_ecosystem_mapping` 并降 confidence；这些状态进入 generated JSON、CSV export、evidence backlog 和 PostgreSQL `is_inferred`，并由 `npm run validate:evidence` 校验。
5. 在页面展示“证据强度”，区分官方、财报、API、媒体、推断。已完成基础版，当前分类为官方 API、官方/公开文档、官方产品重叠、可信报道、第三方索引、人工种子和派生。

验收：

```text
top 75 高价值关系有具体 evidence URL，或被明确降级/标记为待补直接证据或生态推断
无证据的高置信度关系被降级或标记
来源弹窗能解释来源类型和口径
```

### 13.5 P2 数据库实施步骤

输入：

- `src/generated/seed.json`
- `src/generated/metrics.json`
- P2 数据模型

输出：

- PostgreSQL schema
- seed import 脚本
- 只读 API
- 前端 API 数据层
- 本地长期 PostgreSQL bootstrap 和状态门禁

执行步骤：

1. 选 ORM：优先 Drizzle 或 Prisma，先以迁移和类型稳定为标准。
2. 建表：`entity`、`entity_alias`、`source`、`relationship`、`relationship_evidence`、`metric`。
3. 写 import dry-run：输出将新增/更新/跳过的实体、关系、来源、指标数量。
4. 写 import apply：幂等 upsert，不生成重复关系。
5. 实现 `GET /api/entities`，支持 query、type、layer。
6. 实现 `GET /api/entities/:slug`，返回详情、指标、关系摘要。
7. 实现 `GET /api/graph`，支持 entity、depth、minConfidence、relationType。
8. 首页服务端入口接入统一仓储，保留 JSON fallback。已完成。
9. 前端增加异步 API adapter，用 `/api/entities`、`/api/entities/:id`、`/api/graph` 驱动搜索、详情和图谱过滤。已完成。
10. 加最小测试：schema import、API shape、graph depth。
11. 增加长期本地 PostgreSQL 运行路径：Docker Compose 用 `db:bootstrap`，本机 PostgreSQL 工具链用 `db:bootstrap:native`，两者共用默认 `DATABASE_URL` 和 `db:status -- --require-ready` 门禁。已完成，native 路径已验证导入 seed、worker artifacts 和 schema readiness。

验收：

```text
seed import 可重复执行
API 返回数量与 generated JSON 一致
Next 页面可切换 JSON fallback/API
首页显示当前数据源
浏览器端搜索/选择实体触发只读 API
npm run db:bootstrap:native 可初始化长期库并导入数据
npm run db:status -- --require-ready 通过
npm run build 通过
```

### 13.6 P3 自动化实施步骤

输入：

- 免费 API connector
- 公司官网/IR/news URL watchlist
- Wikidata profile snapshot
- OpenAlex works snapshot
- arXiv papers snapshot
- 审核后台

输出：

- 定时采集 worker
- raw document 存储
- parsed document 结构化解析
- extraction/LLM artifact 存储
- 候选关系/指标/实体
- paper/research_org 候选实体
- 图谱快照和 timeline

执行步骤：

1. 建 `connector_run` 表，记录每次采集的状态、耗时、错误和结果数量。已完成。
2. 先做离线 worker：从 `free-metrics.snapshot.json` 生成 `candidate-snapshot.json`、失败重试 backlog 和证据补强 backlog，并同步到 generated fallback 审核队列。已完成第一版。
3. 所有 worker 先写 `raw_document`，再由 parser 写 parsed artifact，最后由抽取层写 extraction/LLM artifact 和 candidate 表。已完成离线 JSON artifact、结构化 parsed artifact、抽取 artifact、LLM artifact 和 PostgreSQL import/verify 计划第一版；parser 支持 HTML 章节、链接、RSS item、table row facts 和 PDF quality gate，`validate:rss-worker` 已覆盖本地 RSS raw document 到候选关系/指标的成功路径。
4. LLM 只在 parsed document 上抽候选，不写 approved 主表。已完成规则 hint、带结构化章节/链接/facts 上下文的 LLM-ready prompt、command provider、HTTP provider、schema 校验、candidate merge、`llm:status` provider readiness、`llm:verify-production` 生产门禁、限流/重试和抽样 dry-run 版本；真实云端模型 URL/凭证需要在部署环境配置，并可用 `llm:verify-production -- --provider=http --limit=1` 作为验收门禁。
5. 审核后台显示证据、摘录、来源、置信度建议和历史冲突。
6. 审核通过后写主图谱，并生成 graph snapshot。
7. timeline 从 approved relationship、source date、metric date、retry backlog、evidence backlog、候选关系、候选实体和候选指标生成。已完成第一版，并为候选事件保留审批状态和置信度。
8. 提供 CSV/JSON 导出。已完成第一版，包含 candidate snapshot archive manifest CSV。
9. 提供 `/api/research/snapshot`、`/api/research/timeline`、`/api/research/export` 和 `/research` 研究页面。已完成第一版，导出 API 已支持 candidate snapshot archive manifest 和 latest archive JSON；timeline API 支持 `type`、`entity`、`status`、`limit` 过滤；研究页面已展示候选队列规模、层级/关系分布、高连接实体、最新研究事件、候选快照历史和下载入口，并支持 timeline 分组筛选、审批状态筛选、关键词搜索和 URL 状态。
10. 提供用户纠错入口，提交后写入 candidate queue 和 audit log。已完成第一版。
11. 提供 worker artifact PostgreSQL import：`worker:plan-import`、`worker:emit-sql`、`worker:import`。已完成第一版，覆盖 connector run、raw document、parsed document、extraction record、LLM extraction，以及候选关系、候选实体、候选指标三类 candidate 表。
12. 提供 candidate snapshot 归档：`candidates:archive`。已完成第一版，按内容 hash 去重，manifest 进入 research artifact 校验和 graph snapshot 计数。
13. 提供 Wikidata/OpenAlex/arXiv 候选实体入口。已完成第一版，Wikidata 生成公司基础资料候选，OpenAlex works 生成 paper/research_org/research_author/referenced work 候选，arXiv papers 生成 paper/research_author 候选。
14. 提供论文候选关系入口。已完成第一版，OpenAlex/arXiv 生成 company/model-paper `related_to`、paper-institution `published_by`、paper-author `authored_by` 和 paper-paper `cites` 候选关系；PostgreSQL E2E 已验证候选实体审批后 paper-institution 候选关系可正式入图；基础合并/去重提示、merge 到已有实体、候选到候选 merge、redirect、候选关系端点重挂、公开实体详情/图谱 redirect 解析和详情页合并提示已完成。
15. 提供 RSS worker 成功 fixture 和真实 RSS 样本。已完成第一版，覆盖 RSS format 识别、RSS item/facts、结构化 prompt、candidate relationship、candidate metric 生成，并已把 OpenAI/NVIDIA/AWS/Meta 官方或公开 RSS 成功样本批量入库、归档和导出；`candidate:verify-worker-metric` 已验证真实 worker RSS 候选指标经人工口径编辑后进入正式 `metric` 表；下一步继续扩大 RSS 源和人工审批样本。

验收：

```text
worker 失败不会污染公开图谱
每条自动候选都有 evidence_url
审核动作有 audit log
用户能查看图谱变化历史
worker run 和 raw document 可追踪
```

### 13.7 免费数据源接入矩阵

免费源优先级按“可验证性 > 结构化程度 > 更新频率 > 覆盖面”排序。所有来源都只能进入 raw/parsed/candidate 层，除人工审核通过外不能直接写公开主图谱。

| 数据源 | 主要用途 | 免费接入方式 | 入库层级 | 信任等级 | 刷新频率 | 当前状态 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 公司官网/产品文档 | 供应、集成、合作、产品能力 | watchlist URL、RSS、HTML parser | raw document -> parsed document -> candidate relationship | 高，官方来源 | 每周 | 已接 RSS/HTML parser 基础版 | 扩大到重点实体官网和文档页 |
| IR/财报/SEC | 收入、capex、R&D、风险、客户/供应披露 | SEC company facts、IR 页面、PDF/HTML | parsed facts -> candidate metric/relationship | 高，监管或公司披露 | 每月/季度 | SEC 指标和财报字段 facts 基础版 | 强化单位标准化和期间归因 |
| GitHub | 开源项目热度、生态集成信号 | GitHub public API 或页面快照 | metric、candidate relationship | 中，高频但需防噪声 | 每周 | 已有 repo metric | 增加依赖/README 引用证据 |
| Hugging Face | 模型下载、点赞、模型生态 | 模型页、公开 API、人工覆盖 | metric、candidate relationship | 中，高频但字段会变 | 每周 | 已有人工审核指标覆盖 | 网络可达环境复测实时 connector |
| OpenAlex | 论文、机构、作者、引用关系 | OpenAlex API | candidate entity/relationship | 中高，学术索引 | 每周/月 | 已生成 paper/research_org/author/cites 候选 | 作者归一化、机构去重、引用详情增强 |
| arXiv | 最新论文和预印本 | arXiv API | candidate entity/relationship | 中，预印本需人工判断 | 每周 | 已生成 paper/author 候选 | 关联模型/公司证据更细化 |
| Wikidata | 公司基础资料、别名、官网、ID | Wikidata API | candidate entity | 中，适合补基础字段 | 每月 | 已生成 profile 候选 | 做字段冲突策略和别名审核 |
| 新闻/可信报道 | 融资、合作、客户案例 | RSS/网页 URL，人工白名单 | candidate relationship/metric | 中，取决于 publisher | 每周 | 已支持 `credible_report` override | 建 publisher allowlist 和风险标签 |
| 第三方索引 | 竞品、产品分类、生态映射 | 页面 URL，人工审查 | inferred relationship | 低到中，只能辅助 | 低频 | 已支持 `third_party_index` | 默认低置信度，不作为直接证据 |

接入规则：

1. Connector 必须记录 `source_url`、`publisher`、`fetched_at`、`license_note`、HTTP 状态和错误。
2. Parser 必须保留正文摘要、结构化 sections、links、facts 和 extraction hints，不能只保留 LLM 输出。
3. Candidate 必须有稳定 ID、来源 URL、confidence、note、evidence strength 和生成器版本。
4. 审核员看到的候选必须能回溯 raw document、parsed document、extraction record 和 LLM extraction record。
5. 自动刷新产生的数据必须先进 archive 和 candidate queue，由人工审核决定是否进入公开图谱。

### 13.8 实施完成定义

P0-P3 的“完成”不是指所有产业链数据都采完，而是指产品、数据、采集、审核和验证链路形成闭环：

| 层级 | 完成定义 | 当前证据 |
| --- | --- | --- |
| 产品层 | 用户能搜索实体、过滤图谱、看详情、看来源、提交纠错 | 静态站和 Next.js 页面已具备，纠错进入 candidate queue |
| 数据层 | 主图谱有稳定 seed，来源和证据可解释，低证据关系被标注 | 112 实体、777 关系、20 条 direct evidence override、top 75 已审查 |
| 指标层 | 免费公开指标能展示，失败 connector 可诊断 | GitHub/Hugging Face/SEC/OpenAlex 指标和 metric failure 诊断已具备 |
| API/DB 层 | JSON fallback 和 PostgreSQL 都能读取，长期库可验证 | `db:status -- --require-ready`、`db:verify:p3-persistent` 已通过 |
| 审核层 | 候选关系/实体/指标可以 approve/reject/edit/merge，并有 audit log | `/admin` 和 `db:e2e` 覆盖核心流 |
| 采集层 | 免费源能定时进入 raw/parsed/extraction/candidate/archive | RSS、Wikidata、OpenAlex、arXiv、weekly workflow 已具备 |
| LLM 层 | LLM 只产候选，schema/鉴权/限流/重试有门禁 | 本地 fixture 和 HTTP fixture 已通过；真实云端 URL/凭证待部署注入 |
| 验收层 | 本地、常驻库、生产三类门禁分开 | `validate:p0-p3:local`、`audit:p0-p3:write`、`audit:p0-p3:matrix` 和 `production:p0-p3:checklist` 已通过；completion matrix 当前为 `local_ready_production_pending`；生产 release checklist 当前有 15 个 external pending 项；`validate:p0-p3:production` 已统一生产 DB、审核鉴权和 LLM 门禁，最终完成仍需真实生产 workflow artifact 和 GitHub run metadata |

## 14. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 私营估值不完整 | 用户误读为空缺或错误 | 显示 Unknown，并解释口径 |
| 免费 API 限流 | 自动更新失败 | 缓存 snapshot，低频采集，支持 token |
| 数据授权不清 | 法务风险 | 只存 URL、事实摘要、短摘录和元数据 |
| 实体重复 | 图谱混乱 | alias、domain、ticker 归一化 |
| 关系推断过度 | 图谱不可信 | 默认隐藏低置信度关系 |
| LLM 幻觉 | 错误关系进入图谱 | LLM 只生成候选，人工审核 |
| 图谱过密 | 不可读 | 默认深度 1-2，按层级和关系类型过滤 |
| 静态数据膨胀 | 前端变慢 | P1 做分页/懒加载，P2 迁移 API |

## 15. 验收标准

### P0 验收，当前状态

```text
8 layers
112 entities
777 relationships
11 sources
search works
graph works
detail panel works
validation script passes
```

### P1 验收

```text
100+ entities
300+ relationships
all relationships have evidence
GitHub/SEC/OpenAlex metrics displayed
Hugging Face metrics displayed or connector failure shown
OpenAlex connector ready and at least 3 works metrics shown
no uncited valuation claims
source evidence strength and license note visible
```

### P2 验收

```text
Next.js app builds
P2 preview reads generated JSON
homepage switches between repository JSON fallback and PostgreSQL when DATABASE_URL is set
P2 interactive search/filter/detail/source modal works
P2 graph/filter/detail behavior script passes
PostgreSQL schema exists
seed import works
read APIs work
frontend async API adapter exists
relationship admin review workflow exists
entity and metric admin review workflow exists
candidate snapshot/backlog generation and fallback sync exists
```

### P3 验收

```text
automatic candidate extraction
weekly research cycle and scheduled refresh workflow
manual approval workflow
retry backlog
evidence backlog
graph snapshots
timeline
export
research API
research page
user correction flow
Wikidata profile candidates
OpenAlex paper/research_org candidates
arXiv paper candidates
```

### P0-P3 总体验收

本地总验收：

```bash
npm run deploy:setup-guide
npm run validate:env
npm run validate:deployment-secrets
npm run validate:p0-p3:local
npm run validate:p0-p3:production-fixture
npm run validate:production-artifact-fixture
npm run validate:production-completion-fixture
npm run validate:production-run-orchestrator-fixture
npm run audit:p0-p3:write
npm run audit:p0-p3:matrix
npm run production:p0-p3:checklist
npm run validate:production-release-checklist
```

快速开发验收：

```bash
npm run validate:p0-p3:local -- --skip-db-e2e --skip-build
```

常驻 PostgreSQL 验收：

```bash
DATABASE_URL=postgres://ai_capital:ai_capital@127.0.0.1:55432/ai_capital npm run validate:p0-p3:local -- --with-persistent-db --skip-db-e2e --skip-build
```

生产 LLM 网关验收：

```bash
export DATABASE_URL=postgres://user:password@host:5432/ai_capital
export ADMIN_REVIEW_SESSION_SECRET=...
export ADMIN_REVIEW_ADMIN_PASSWORD=...
export ADMIN_REVIEW_REVIEWER_PASSWORD=...
export LLM_EXTRACT_URL=https://your-llm-gateway/extract
export LLM_EXTRACT_API_KEY=...
export LLM_EXTRACT_RPM=30
export LLM_EXTRACT_MAX_RETRIES=2
npm run validate:env -- --require-production
npm run validate:p0-p3:production -- --provider=http --timeout-ms=120000 --limit=1 --write-evidence
```

当前已通过本地总验收和常驻 PostgreSQL 分支；真实云端 LLM URL/API key 和线上定时刷新凭证仍属于部署闭环项。真实生产门禁会拒绝 localhost/127.0.0.1/::1 的 DB/LLM 服务，并要求 `ADMIN_REVIEW_SESSION_SECRET`、`ADMIN_REVIEW_ADMIN_PASSWORD` 和 `ADMIN_REVIEW_REVIEWER_PASSWORD` 三项 session 登录配置齐备；legacy token/角色 token 只作为本地或兼容 fallback，不能单独通过生产发布门禁。只有 `validate:p0-p3:production-fixture` 会用 `--allow-local-services` 放行本地 fixture。真实生产门禁通过后必须用 `--write-evidence` 写入 `data/research/p0-p3-production-readiness-report.json`；GitHub 生产 workflow 在 `production` environment 中运行。生产仓库需要先创建名为 `production` 的 GitHub environment，并把真实 `DATABASE_URL`、审核 session secrets、`LLM_EXTRACT_URL` 和 `LLM_EXTRACT_API_KEY` 放到 environment-scoped secrets（如仓库策略允许），同时启用 required reviewers 或等价 environment protection rule，让生产 secrets 必须经过发布审核才释放。

最终推荐用 `npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main` 收口，它会预检 production environment、触发前解析远端 `main` 的 commit SHA、为本次触发生成唯一 dispatch UUID、触发 `Validate P0-P3`，并只接受 run title 带该 UUID、`headSha` 与远端提交完全一致且创建时间不早于本次 dispatch 的 run；随后等待成功、下载 artifact，并调用 `validate:production-completion`。workflow 会把 `P0_P3_EXPECTED_SOURCE_COMMIT` 设为当前 `${{ github.sha }}`，把 `P0_P3_EXPECTED_GITHUB_REPOSITORY` 设为当前 `${{ github.repository }}`，固定 `P0_P3_EXPECTED_GITHUB_REF=refs/heads/main`，所以证据里的 `sourceRevision.gitCommit`、`sourceRevision.githubRepository` 和 `sourceRevision.githubRef` 必须绑定产出 artifact 的代码版本、仓库和发布分支，同时会设置 `P0_P3_REQUIRE_GITHUB_EVIDENCE=true`，要求证据带 `sourceRevision.githubRunId`、`sourceRevision.githubRunAttempt`、`sourceRevision.githubEventName=workflow_dispatch`、`sourceRevision.productionLlmInput=true`、`sourceRevision.productionEnvironment=production` 和 `sourceRevision.githubWorkflow=Validate P0-P3`。

运行生产门禁前，必须把完整发布代码（包括 workflow 文件）提交并推送到生产仓库 `main`。orchestrator 只读取远端仓库，不会上传本地工作树；因此本地未提交或未推送的修改不会进入生产证据。

`validate:production-evidence` 会校验 provider、`adminAuthMode=session`、`sourceRevision.gitCommit`、`generatedAt` 非未来且默认 14 天内、非 localhost URL、脱敏连接串和命令链；如发布策略需要不同新鲜度窗口，可设置 `P0_P3_PRODUCTION_EVIDENCE_MAX_AGE_DAYS`。生产证据文件和下载 artifact 目录都被 `.gitignore` 排除，GitHub 手动生产门禁会把 `p0-p3-production-readiness-report.json`、`p0-p3-completion-matrix.json` 和 `p0-p3-production-release-checklist.json` 一起上传为 `p0-p3-production-readiness-report` artifact；`validate:production-artifact` 会要求三份 JSON 都存在，只允许这三份 JSON 加可选 `run-metadata.json`，可选 metadata 也必须是有效 JSON，并校验 checklist 与 matrix 的 external pending 项一致。

`validate:production-completion` 会下载 artifact、复验证据、确认 `sourceRevision.githubRunId` 匹配 `--run-id`，确认 `sourceRevision.githubRunAttempt` 匹配 GitHub run metadata，并用 GitHub run metadata 校验 workflow/event/status/conclusion/head SHA/branch、`createdAt` 不早于 `--dispatch-started-at` 以及 run URL 是否绑定 expected repo/run id，再刷新 completion matrix 和 production release checklist；它只在矩阵达到 `complete` 时通过。completion matrix 只有看到这份已校验生产证据或已下载 artifact，且 expected commit/repository/ref 与证据匹配，并确认 artifact 来自 GitHub `production` environment、`workflow_dispatch` 且 `production_llm=true`，同时由 `validate:production-completion` 注入已校验的 `P0_P3_VERIFIED_GITHUB_RUN_ID` 和 `P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT` 后才会显示 `complete`，并记录 `productionSourceRevision.gitCommit` 和 `summary.productionGitCommit` 以绑定通过验收的代码版本。若 artifact 目录中 evidence JSON 损坏、metadata 不匹配、目录混入旧文件或下载路径不是空目录，矩阵必须保持 `local_ready_production_pending`；`productionEvidenceDiagnostics` 会记录候选 artifact/evidence 的校验失败原因，方便排障但不作为完成证据。

真实生产库上线前必须先在指向生产 PostgreSQL 的 shell 中执行 `npm run db:import` 和 `npm run worker:import` 导入数据；生产统一门禁会强制执行 `npm run db:status -- --require-ready`、`npm run db:verify`、`npm run worker:verify` 和 `npm run db:verify:p3-persistent`，确认 schema、seed、P3 worker artifacts 和用户纠错持久化路径已就绪，再继续验证 LLM 网关和生成生产证据。

生产 workflow 会把 GitHub Actions run context 显式注入为 `P0_P3_GITHUB_RUN_ID` 和 `P0_P3_GITHUB_RUN_ATTEMPT`，并显式设置 `P0_P3_EXPECTED_SOURCE_COMMIT`、`P0_P3_EXPECTED_GITHUB_REPOSITORY` 和 `P0_P3_EXPECTED_GITHUB_REF`；`validate:p0-p3:production -- --write-evidence` 写证据时优先使用这些 P0-P3 字段，再回退到 GitHub 默认环境变量，避免生产 artifact 的来源只依赖隐式 CI 环境。
`production:p0-p3:run` 会把本次 dispatch 的 ISO 时间传给 `validate:production-completion`；completion validator 会要求 GitHub run metadata 的 `createdAt` 不早于该时间，防止旧的成功 run 或旧 artifact 被拿来完成 P0-P3。
生产完成链路固定使用 `refs/heads/main`；`production:p0-p3:run` 会拒绝其他 ref，因为 workflow evidence validator 固定 `P0_P3_EXPECTED_GITHUB_REF=refs/heads/main`。
手动调用 `validate:production-completion` 时，`--run-id` 也必须同时提供 `--dispatch-started-at`，否则不会接受该 run 作为完成证据。

CI 验收：

- `.github/workflows/validate-p0-p3.yml` 在 PR 和 `main` push 上运行完整本地 P0-P3 验收，刷新 completion matrix，生成/校验 production release checklist，并运行 production fixture gate。
- 生产发布运行 `npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main`；脚本会预检 GitHub `production` environment，触发 `production_llm=true` 的 `Validate P0-P3`，并使用 `DATABASE_URL`、审核鉴权、`LLM_EXTRACT_URL`/`LLM_EXTRACT_API_KEY` secrets 和相关 vars 执行 `validate:p0-p3:production`。
- `.github/workflows/research-weekly.yml` 在刷新后运行 `audit:p0-p3`；当手动选择 http LLM provider 时要求生产 LLM 配置存在。`command` provider 保留给本地或自定义 CI 环境直接运行脚本时使用。

## 16. 近期实施清单

下一轮开发直接做这些：

1. 证据闭环：继续研究新增高优先级 evidence backlog；找到官方或可信来源后写入 `data/evidence-overrides.json`，找不到则保留低置信度或降级为 `inferred_ecosystem_mapping`。
2. 免费源扩展：给重点公司补官网、IR、SEC、工程博客和 RSS watchlist，新增来源必须通过 raw document、parsed document、extraction record、candidate snapshot 和 research export 全链路。
3. 论文候选质量：扩大 OpenAlex/arXiv 采集范围，增强 DOI/OpenAlex/arXiv/ROR/作者 ID 去重、作者归一化、机构合并和引用方向说明。
4. 财报和指标抽取：增强 PDF/table row、单位标准化、期间归因、currency/scale 处理和指标口径编辑后的审计记录。
5. 审核运营样本：人工审批一批真实 RSS/论文/指标候选，覆盖 approve、reject、merge、metric edit、redirect 和公开详情展示。
6. 生产 LLM：在部署环境配置真实 `LLM_EXTRACT_URL`/`LLM_EXTRACT_API_KEY`，用 `llm:verify-production` 做抽样 dry-run；通过前不允许自动写公开主表。
7. 自动刷新：给 `.github/workflows/research-weekly.yml` 配置 secrets/vars，确认 weekly PR 只提交 artifact 差异，不直接改线上主图谱。
8. 研究体验：`/research` 页面、timeline 筛选、URL 状态、`entity` 精确过滤和重点实体详情页最近研究动态第一版已完成；下一步增强事件类型细分和审批状态联动。

完成这些后，当前版本会从“可工程化迭代的数据产品”进入“可持续运营的 AI 产业链研究平台”。
