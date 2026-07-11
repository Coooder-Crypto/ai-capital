(() => {
window.AI_CAPITAL_BOOT = Object.assign(window.AI_CAPITAL_BOOT || {}, { seedStarted: true });

const layers = [
  {
    id: "equipment",
    name: "设备",
    color: "#6a5aa7",
    description: "EUV、沉积、刻蚀、检测等半导体生产设备。"
  },
  {
    id: "chip_design",
    name: "芯片 / EDA",
    color: "#b94a48",
    description: "GPU、ASIC、网络芯片、IP 和设计工具。"
  },
  {
    id: "foundry_memory",
    name: "代工 / 存储",
    color: "#b86623",
    description: "晶圆代工、先进封装、HBM、DRAM 和 NAND。"
  },
  {
    id: "datacenter",
    name: "服务器 / 数据中心",
    color: "#648b35",
    description: "服务器、网络、机房、电力和液冷基础设施。"
  },
  {
    id: "cloud_compute",
    name: "云 / 算力",
    color: "#087f7a",
    description: "公有云、GPU 云、训练和推理计算平台。"
  },
  {
    id: "foundation_model",
    name: "基础模型",
    color: "#2d6f9f",
    description: "闭源和开源大模型、语音、图像、视频模型。"
  },
  {
    id: "ai_infra",
    name: "AI Infra 软件",
    color: "#5d7c3f",
    description: "模型托管、向量库、Agent 框架、评测和可观测。"
  },
  {
    id: "application",
    name: "AI 应用",
    color: "#9a5c2e",
    description: "面向消费者、开发者和垂直行业的 AI 产品。"
  }
];

const entities = [
  {
    id: "asml",
    name: "ASML",
    type: "company",
    layer: "equipment",
    status: "public",
    ticker: "ASML",
    valuation: "Market cap: public",
    metrics: { "总部": "Netherlands", "状态": "Public", "核心": "EUV lithography", "数据口径": "上市公司" },
    description: "先进制程 EUV 光刻设备供应商，是高端 GPU 和 AI 加速器制造链条中的关键上游。"
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    type: "company",
    layer: "chip_design",
    status: "public",
    ticker: "NVDA",
    valuation: "Market cap: public",
    metrics: { "总部": "United States", "状态": "Public", "核心": "GPU / Networking", "数据口径": "SEC + market data" },
    description: "AI 训练和推理 GPU、网络、CUDA 软件生态的核心公司。"
  },
  {
    id: "amd",
    name: "AMD",
    type: "company",
    layer: "chip_design",
    status: "public",
    ticker: "AMD",
    valuation: "Market cap: public",
    metrics: { "总部": "United States", "状态": "Public", "核心": "GPU / CPU", "数据口径": "SEC + market data" },
    description: "CPU 与 AI GPU 供应商，MI 系列加速器面向云和企业 AI 工作负载。"
  },
  {
    id: "broadcom",
    name: "Broadcom",
    type: "company",
    layer: "chip_design",
    status: "public",
    ticker: "AVGO",
    valuation: "Market cap: public",
    metrics: { "总部": "United States", "状态": "Public", "核心": "Networking / ASIC", "数据口径": "SEC + market data" },
    description: "网络芯片、定制 AI ASIC 和企业软件供应商，受益于超大规模云厂商定制芯片需求。"
  },
  {
    id: "tsmc",
    name: "TSMC",
    type: "company",
    layer: "foundry_memory",
    status: "public",
    ticker: "TSM",
    valuation: "Market cap: public",
    metrics: { "总部": "Taiwan", "状态": "Public", "核心": "Foundry / CoWoS", "数据口径": "Public filings" },
    description: "全球领先晶圆代工厂和先进封装供应商，承接大量高端 AI 芯片制造。"
  },
  {
    id: "sk_hynix",
    name: "SK Hynix",
    type: "company",
    layer: "foundry_memory",
    status: "public",
    ticker: "000660.KS",
    valuation: "Market cap: public",
    metrics: { "总部": "South Korea", "状态": "Public", "核心": "HBM", "数据口径": "Public filings" },
    description: "HBM 内存关键供应商，AI GPU 和加速卡需要高带宽内存支撑。"
  },
  {
    id: "supermicro",
    name: "Supermicro",
    type: "company",
    layer: "datacenter",
    status: "public",
    ticker: "SMCI",
    valuation: "Market cap: public",
    metrics: { "总部": "United States", "状态": "Public", "核心": "AI servers", "数据口径": "SEC + market data" },
    description: "AI 服务器系统供应商，为 GPU 集群和数据中心提供整机方案。"
  },
  {
    id: "arista",
    name: "Arista Networks",
    type: "company",
    layer: "datacenter",
    status: "public",
    ticker: "ANET",
    valuation: "Market cap: public",
    metrics: { "总部": "United States", "状态": "Public", "核心": "Data center networking", "数据口径": "SEC + market data" },
    description: "数据中心交换机供应商，AI 集群需要高速网络连接 GPU 和存储。"
  },
  {
    id: "azure",
    name: "Microsoft Azure",
    type: "cloud",
    layer: "cloud_compute",
    status: "public",
    ticker: "MSFT",
    valuation: "Part of Microsoft",
    metrics: { "总部": "United States", "状态": "Public segment", "核心": "Cloud / AI compute", "数据口径": "Microsoft filings" },
    description: "微软云计算平台，也是多个基础模型公司训练和推理算力的重要承载方。"
  },
  {
    id: "aws",
    name: "AWS",
    type: "cloud",
    layer: "cloud_compute",
    status: "public",
    ticker: "AMZN",
    valuation: "Part of Amazon",
    metrics: { "总部": "United States", "状态": "Public segment", "核心": "Cloud / AI compute", "数据口径": "Amazon filings" },
    description: "亚马逊云平台，提供 GPU、Trainium、Inferentia 等 AI 计算资源。"
  },
  {
    id: "coreweave",
    name: "CoreWeave",
    type: "company",
    layer: "cloud_compute",
    status: "public",
    ticker: "CRWV",
    valuation: "Market cap: public",
    metrics: { "总部": "United States", "状态": "Public", "核心": "GPU cloud", "数据口径": "Public filings" },
    description: "面向 AI 工作负载的 GPU 云平台，连接数据中心资本开支和模型训练需求。"
  },
  {
    id: "openai",
    name: "OpenAI",
    type: "company",
    layer: "foundation_model",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States", "状态": "Private", "核心": "Foundation models", "数据口径": "公开披露" },
    description: "ChatGPT 和 GPT 系列模型开发者，处于 AI 应用、模型 API 和企业 AI 平台的中心位置。"
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "company",
    layer: "foundation_model",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States", "状态": "Private", "核心": "Claude models", "数据口径": "公开披露" },
    description: "Claude 模型开发者，重点面向企业和开发者 API。"
  },
  {
    id: "mistral",
    name: "Mistral AI",
    type: "company",
    layer: "foundation_model",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "France", "状态": "Private", "核心": "Open-weight models", "数据口径": "公开披露" },
    description: "欧洲基础模型公司，提供开源权重模型和企业模型服务。"
  },
  {
    id: "meta_ai",
    name: "Meta AI",
    type: "company",
    layer: "foundation_model",
    status: "public",
    ticker: "META",
    valuation: "Part of Meta",
    metrics: { "总部": "United States", "状态": "Public segment", "核心": "Llama models", "数据口径": "Meta disclosures" },
    description: "Meta 的 AI 研究和模型发布团队，Llama 系列推动开源模型生态。"
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    type: "company",
    layer: "ai_infra",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States / France", "状态": "Private", "核心": "Model hub", "数据口径": "公开披露 + HF API" },
    description: "模型、数据集和 Space 托管平台，是 AI 开源生态的重要分发层。"
  },
  {
    id: "langchain",
    name: "LangChain",
    type: "company",
    layer: "ai_infra",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States", "状态": "Private", "核心": "Agent framework", "数据口径": "GitHub + 公开披露" },
    description: "LLM 应用和 Agent 开发框架，连接模型 API、工具、检索和应用层。"
  },
  {
    id: "databricks",
    name: "Databricks",
    type: "company",
    layer: "ai_infra",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States", "状态": "Private", "核心": "Data + AI platform", "数据口径": "公开披露" },
    description: "数据湖仓和 AI 平台公司，连接企业数据、模型训练和部署。"
  },
  {
    id: "pinecone",
    name: "Pinecone",
    type: "company",
    layer: "ai_infra",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States", "状态": "Private", "核心": "Vector database", "数据口径": "公开披露" },
    description: "向量数据库服务商，常用于 RAG、语义搜索和 AI 应用检索。"
  },
  {
    id: "cursor",
    name: "Cursor",
    type: "company",
    layer: "application",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States", "状态": "Private", "核心": "AI code editor", "数据口径": "公开披露" },
    description: "AI 编程编辑器，将基础模型能力包装为开发者工作流产品。"
  },
  {
    id: "perplexity",
    name: "Perplexity",
    type: "company",
    layer: "application",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States", "状态": "Private", "核心": "AI search", "数据口径": "公开披露" },
    description: "AI 搜索和答案引擎，依赖模型 API、搜索索引和内容来源。"
  },
  {
    id: "midjourney",
    name: "Midjourney",
    type: "company",
    layer: "application",
    status: "private",
    valuation: "Unknown",
    metrics: { "总部": "United States", "状态": "Private", "核心": "Image generation", "数据口径": "公开信息" },
    description: "图像生成产品，代表创意工具应用层。"
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    type: "company",
    layer: "application",
    status: "private",
    valuation: "Reported valuation only",
    metrics: { "总部": "United States / UK", "状态": "Private", "核心": "Voice AI", "数据口径": "公开披露" },
    description: "语音生成和语音 AI 平台，面向内容、游戏、视频和企业场景。"
  },
  {
    id: "sequoia",
    name: "Sequoia Capital",
    type: "investor",
    layer: "application",
    status: "private",
    valuation: "N/A",
    metrics: { "类型": "Investor", "状态": "Private", "核心": "Venture capital", "数据口径": "公开 portfolio" },
    description: "科技风险投资机构，投资多个 AI 基础设施和应用层公司。"
  },
  {
    id: "a16z",
    name: "a16z",
    type: "investor",
    layer: "application",
    status: "private",
    valuation: "N/A",
    metrics: { "类型": "Investor", "状态": "Private", "核心": "Venture capital", "数据口径": "公开 portfolio" },
    description: "科技风险投资机构，覆盖 AI Infra、模型、应用和开源生态。"
  }
];

const sources = [
  {
    id: "src_sec",
    title: "SEC EDGAR Data APIs",
    publisher: "U.S. SEC",
    date: "Live public data",
    url: "https://data.sec.gov/",
    sourceType: "official_api",
    evidenceStrength: "official_api",
    licenseNote: "Public U.S. government data; store facts, URLs and derived metrics.",
    fetchedAt: "2026-07-04T00:00:00.000Z",
    note: "用于美国上市公司 filings、company facts 和财务指标。"
  },
  {
    id: "src_github",
    title: "GitHub REST API",
    publisher: "GitHub",
    date: "Live public data",
    url: "https://docs.github.com/en/rest",
    sourceType: "official_api",
    evidenceStrength: "official_api",
    licenseNote: "Public API metadata; respect GitHub API terms and repository licenses.",
    fetchedAt: "2026-07-04T00:00:00.000Z",
    note: "用于开源项目 stars、forks、commits、release 和依赖文件。"
  },
  {
    id: "src_hf",
    title: "Hugging Face Hub API",
    publisher: "Hugging Face",
    date: "Live public data",
    url: "https://huggingface.co/docs/hub/api",
    sourceType: "official_api",
    evidenceStrength: "official_api",
    licenseNote: "Public model metadata; individual model and dataset licenses still apply.",
    fetchedAt: "2026-07-04T00:00:00.000Z",
    note: "用于模型、数据集、downloads、likes 和模型卡元数据。"
  },
  {
    id: "src_openalex",
    title: "OpenAlex API",
    publisher: "OpenAlex",
    date: "Live public data",
    url: "https://developers.openalex.org/",
    sourceType: "scholarly_index",
    evidenceStrength: "third_party_index",
    licenseNote: "Open bibliographic metadata index; cite source URL and avoid storing full papers.",
    fetchedAt: "2026-07-04T00:00:00.000Z",
    note: "用于论文、机构、作者和引用关系。"
  },
  {
    id: "src_arxiv",
    title: "arXiv API",
    publisher: "arXiv",
    date: "Live public data",
    url: "https://info.arxiv.org/help/api/index.html",
    sourceType: "scholarly_index",
    evidenceStrength: "third_party_index",
    licenseNote: "Open scholarly metadata index; store paper metadata and source URLs, not full paper copies.",
    fetchedAt: "2026-07-04T00:00:00.000Z",
    note: "用于预印本、作者、主题分类和论文候选。"
  },
  {
    id: "src_wikidata",
    title: "Wikidata API",
    publisher: "Wikimedia Foundation",
    date: "Live public data",
    url: "https://www.wikidata.org/wiki/Wikidata:Data_access",
    sourceType: "third_party_index",
    evidenceStrength: "third_party_index",
    licenseNote: "Open linked-data index; use entity URLs and derived profile fields, not long copied text.",
    fetchedAt: "2026-07-04T00:00:00.000Z",
    note: "用于公司基础资料、别名、官网和国家/地区候选补全。"
  },
  {
    id: "src_manual",
    title: "Manual verified seed relationships",
    publisher: "Project data",
    date: "2026-07-02",
    url: "AI_INDUSTRY_CHAIN_TECH_PLAN.md",
    sourceType: "manual_seed",
    evidenceStrength: "manual_seed",
    licenseNote: "Internal seed curation; must be replaced or backed by specific external evidence before high-confidence publication.",
    fetchedAt: "2026-07-02T00:00:00.000Z",
    note: "MVP 阶段手工维护高置信度产业链关系，后续由证据 worker 替换。"
  }
];

const relationships = [
  ["asml", "tsmc", "supplies_to", 0.9, "src_manual", "EUV 设备支撑先进制程制造。"],
  ["tsmc", "nvidia", "supplies_to", 0.9, "src_manual", "TSMC 为高端 GPU 和 AI 芯片提供代工与封装能力。"],
  ["sk_hynix", "nvidia", "supplies_to", 0.85, "src_manual", "HBM 是 AI 加速卡关键组件。"],
  ["nvidia", "coreweave", "supplies_to", 0.85, "src_manual", "GPU 云平台依赖 NVIDIA GPU 供给。"],
  ["nvidia", "azure", "supplies_to", 0.8, "src_manual", "Azure AI 集群大量使用 NVIDIA GPU。"],
  ["nvidia", "aws", "supplies_to", 0.75, "src_manual", "AWS 提供 NVIDIA GPU 实例。"],
  ["amd", "azure", "supplies_to", 0.7, "src_manual", "云厂商提供 AMD 加速器实例。"],
  ["broadcom", "aws", "supplies_to", 0.65, "src_manual", "定制芯片和网络芯片服务云数据中心。"],
  ["supermicro", "coreweave", "supplies_to", 0.65, "src_manual", "AI 服务器供应链服务 GPU 云建设。"],
  ["arista", "coreweave", "supplies_to", 0.65, "src_manual", "AI 集群依赖高速数据中心网络。"],
  ["azure", "openai", "runs_on", 0.92, "src_manual", "OpenAI 与 Microsoft Azure 有公开云合作关系。"],
  ["aws", "anthropic", "runs_on", 0.85, "src_manual", "Anthropic 与 AWS 有公开云和投资合作关系。"],
  ["coreweave", "mistral", "runs_on", 0.55, "src_manual", "GPU 云与模型公司存在行业相关性，需进一步证据。"],
  ["meta_ai", "huggingface", "released_by", 0.82, "src_hf", "Llama 等模型在 Hugging Face 生态分发。"],
  ["mistral", "huggingface", "released_by", 0.82, "src_hf", "Mistral 模型在 Hugging Face 生态分发。"],
  ["huggingface", "langchain", "integrates_with", 0.7, "src_github", "开发者常将模型 hub 与 LLM 应用框架集成。"],
  ["pinecone", "langchain", "integrates_with", 0.72, "src_github", "向量数据库常作为 RAG 链路中的检索层。"],
  ["databricks", "openai", "integrates_with", 0.62, "src_manual", "企业数据平台通常集成外部模型 API。"],
  ["openai", "cursor", "supplies_to", 0.75, "src_manual", "AI 编程工具依赖基础模型 API。"],
  ["anthropic", "cursor", "supplies_to", 0.75, "src_manual", "AI 编程工具可接入 Claude 等模型。"],
  ["openai", "perplexity", "supplies_to", 0.65, "src_manual", "AI 搜索应用依赖基础模型能力。"],
  ["anthropic", "perplexity", "supplies_to", 0.65, "src_manual", "AI 搜索应用可接入多家模型。"],
  ["openai", "elevenlabs", "competes_with", 0.45, "src_manual", "多模态语音能力存在部分竞争，需要细分产品验证。"],
  ["midjourney", "openai", "competes_with", 0.55, "src_manual", "图像生成产品与多模态模型存在应用层竞争。"],
  ["sequoia", "huggingface", "invested_in", 0.7, "src_manual", "公开 portfolio 和融资信息需后续 worker 校验。"],
  ["a16z", "cursor", "invested_in", 0.7, "src_manual", "公开融资信息需后续 worker 校验。"],
  ["a16z", "mistral", "invested_in", 0.7, "src_manual", "公开融资信息需后续 worker 校验。"],
  ["aws", "anthropic", "invested_in", 0.8, "src_manual", "AWS/Anthropic 公开战略合作和投资关系。"],
  ["azure", "openai", "invested_in", 0.85, "src_manual", "Microsoft/OpenAI 公开投资和商业合作关系。"]
].map(([source, target, type, confidence, sourceId, note], index) => ({
  id: `rel_${index + 1}`,
  source,
  target,
  type,
  confidence,
  sourceId,
  note
}));

const relationLabels = {
  supplies_to: "供应",
  runs_on: "运行于",
  invested_in: "投资",
  integrates_with: "集成",
  released_by: "发布到",
  competes_with: "竞争",
  partners_with: "合作"
};

window.AI_CAPITAL_SEED = {
  layers,
  entities,
  sources,
  relationships,
  relationLabels
};

window.AI_CAPITAL_BOOT.seedLoaded = true;
})();
