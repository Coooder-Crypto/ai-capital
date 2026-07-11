(() => {
  const seed = window.AI_CAPITAL_SEED;
  if (!seed) {
    throw new Error("AI_CAPITAL_SEED must load before p1-extension.js");
  }

  const layerDefaults = {
    equipment: "Semiconductor equipment and manufacturing tools",
    chip_design: "AI chips, accelerators, EDA, IP and networking silicon",
    foundry_memory: "Foundry, advanced packaging and memory",
    datacenter: "AI servers, networking, power, cooling and data center buildout",
    cloud_compute: "Cloud, GPU cloud and inference platforms",
    foundation_model: "Foundation model labs and model providers",
    ai_infra: "AI developer infrastructure, data platforms and runtime tools",
    application: "AI-native and AI-enabled applications"
  };

  const existingEnrichment = {
    asml: { website_url: "https://www.asml.com", country: "Netherlands", exchange: "NASDAQ", aliases: ["ASML Holding", "ASML Holding N.V."] },
    nvidia: { website_url: "https://www.nvidia.com", country: "United States", exchange: "NASDAQ", aliases: ["Nvidia Corporation", "NVDA", "英伟达"] },
    amd: { website_url: "https://www.amd.com", country: "United States", exchange: "NASDAQ", aliases: ["Advanced Micro Devices", "AMD"] },
    broadcom: { website_url: "https://www.broadcom.com", country: "United States", exchange: "NASDAQ", aliases: ["Broadcom Inc.", "AVGO"] },
    tsmc: { website_url: "https://www.tsmc.com", country: "Taiwan", exchange: "NYSE", aliases: ["Taiwan Semiconductor Manufacturing Company", "TSM"] },
    sk_hynix: { website_url: "https://www.skhynix.com", country: "South Korea", exchange: "KRX", aliases: ["SK hynix", "SK Hynix Inc."] },
    supermicro: { website_url: "https://www.supermicro.com", country: "United States", exchange: "NASDAQ", aliases: ["Super Micro Computer", "SMCI"] },
    arista: { website_url: "https://www.arista.com", country: "United States", exchange: "NYSE", aliases: ["Arista Networks", "ANET"] },
    azure: { website_url: "https://azure.microsoft.com", country: "United States", exchange: "NASDAQ", aliases: ["Azure", "Microsoft Cloud", "MSFT Azure"] },
    aws: { website_url: "https://aws.amazon.com", country: "United States", exchange: "NASDAQ", aliases: ["Amazon Web Services", "AWS"] },
    coreweave: { website_url: "https://www.coreweave.com", country: "United States", exchange: "NASDAQ", aliases: ["CoreWeave", "CRWV"] },
    openai: { website_url: "https://openai.com", country: "United States", aliases: ["OpenAI Global", "ChatGPT"] },
    anthropic: { website_url: "https://www.anthropic.com", country: "United States", aliases: ["Anthropic", "Claude"] },
    mistral: { website_url: "https://mistral.ai", country: "France", aliases: ["Mistral AI"] },
    meta_ai: { website_url: "https://ai.meta.com", country: "United States", exchange: "NASDAQ", aliases: ["Meta AI", "Llama", "FAIR"] },
    huggingface: { website_url: "https://huggingface.co", country: "United States / France", aliases: ["Hugging Face", "HF"] },
    langchain: { website_url: "https://www.langchain.com", country: "United States", aliases: ["LangChain", "LangGraph"] },
    databricks: { website_url: "https://www.databricks.com", country: "United States", aliases: ["Databricks", "MosaicML"] },
    pinecone: { website_url: "https://www.pinecone.io", country: "United States", aliases: ["Pinecone"] },
    cursor: { website_url: "https://www.cursor.com", country: "United States", aliases: ["Cursor", "Anysphere"] },
    perplexity: { website_url: "https://www.perplexity.ai", country: "United States", aliases: ["Perplexity AI"] },
    midjourney: { website_url: "https://www.midjourney.com", country: "United States", aliases: ["Midjourney"] },
    elevenlabs: { website_url: "https://elevenlabs.io", country: "United States / UK", aliases: ["ElevenLabs"] },
    sequoia: { website_url: "https://www.sequoiacap.com", country: "United States", aliases: ["Sequoia Capital"] },
    a16z: { website_url: "https://a16z.com", country: "United States", aliases: ["Andreessen Horowitz", "a16z"] }
  };

  const newEntities = [
    ["applied_materials", "Applied Materials", "company", "equipment", "public", "AMAT", "Market cap: public", "United States", "NASDAQ", "https://www.appliedmaterials.com", "Semiconductor manufacturing equipment supplier for deposition, materials engineering and process tools."],
    ["lam_research", "Lam Research", "company", "equipment", "public", "LRCX", "Market cap: public", "United States", "NASDAQ", "https://www.lamresearch.com", "Wafer fabrication equipment supplier focused on etch and deposition steps."],
    ["kla", "KLA", "company", "equipment", "public", "KLAC", "Market cap: public", "United States", "NASDAQ", "https://www.kla.com", "Process control and inspection equipment supplier for advanced semiconductor manufacturing."],
    ["tokyo_electron", "Tokyo Electron", "company", "equipment", "public", "8035.T", "Market cap: public", "Japan", "TSE", "https://www.tel.com", "Semiconductor production equipment supplier across coating, deposition, etch and cleaning."],
    ["screen_semiconductor", "SCREEN Semiconductor Solutions", "company", "equipment", "public", "7735.T", "Market cap: public", "Japan", "TSE", "https://www.screen.co.jp/spe", "Semiconductor cleaning and processing equipment provider."],
    ["asm_international", "ASM International", "company", "equipment", "public", "ASM.AS", "Market cap: public", "Netherlands", "Euronext", "https://www.asm.com", "Atomic layer deposition and epitaxy equipment supplier."],
    ["synopsys", "Synopsys", "company", "chip_design", "public", "SNPS", "Market cap: public", "United States", "NASDAQ", "https://www.synopsys.com", "EDA, IP and design verification software provider."],
    ["cadence", "Cadence", "company", "chip_design", "public", "CDNS", "Market cap: public", "United States", "NASDAQ", "https://www.cadence.com", "EDA and computational software supplier for chip and system design."],
    ["arm", "Arm", "company", "chip_design", "public", "ARM", "Market cap: public", "United Kingdom", "NASDAQ", "https://www.arm.com", "CPU and accelerator IP supplier used across cloud, edge and mobile silicon."],
    ["marvell", "Marvell", "company", "chip_design", "public", "MRVL", "Market cap: public", "United States", "NASDAQ", "https://www.marvell.com", "Data infrastructure semiconductor company for networking, storage and custom silicon."],
    ["qualcomm", "Qualcomm", "company", "chip_design", "public", "QCOM", "Market cap: public", "United States", "NASDAQ", "https://www.qualcomm.com", "Mobile, edge AI and connectivity semiconductor supplier."],
    ["intel", "Intel", "company", "chip_design", "public", "INTC", "Market cap: public", "United States", "NASDAQ", "https://www.intel.com", "CPU, accelerator and foundry company serving data center and edge AI workloads."],
    ["cerebras", "Cerebras", "company", "chip_design", "private", "", "Reported valuation only", "United States", "", "https://www.cerebras.net", "Wafer-scale AI accelerator company focused on training and inference systems."],
    ["sambanova", "SambaNova Systems", "company", "chip_design", "private", "", "Reported valuation only", "United States", "", "https://sambanova.ai", "AI accelerator and enterprise AI platform company."],
    ["groq", "Groq", "company", "chip_design", "private", "", "Reported valuation only", "United States", "", "https://groq.com", "Inference accelerator and low-latency AI compute provider."],
    ["tenstorrent", "Tenstorrent", "company", "chip_design", "private", "", "Reported valuation only", "Canada", "", "https://tenstorrent.com", "AI processor and RISC-V compute company."],
    ["samsung", "Samsung Electronics", "company", "foundry_memory", "public", "005930.KS", "Market cap: public", "South Korea", "KRX", "https://www.samsung.com/semiconductor", "Memory, foundry and semiconductor manufacturing supplier."],
    ["micron", "Micron", "company", "foundry_memory", "public", "MU", "Market cap: public", "United States", "NASDAQ", "https://www.micron.com", "DRAM, NAND and HBM memory supplier for AI systems."],
    ["ase", "ASE Technology", "company", "foundry_memory", "public", "ASX", "Market cap: public", "Taiwan", "NYSE", "https://www.aseglobal.com", "Semiconductor packaging and testing provider."],
    ["globalfoundries", "GlobalFoundries", "company", "foundry_memory", "public", "GFS", "Market cap: public", "United States", "NASDAQ", "https://gf.com", "Specialty foundry provider for differentiated semiconductor manufacturing."],
    ["umc", "UMC", "company", "foundry_memory", "public", "UMC", "Market cap: public", "Taiwan", "NYSE", "https://www.umc.com", "Semiconductor foundry serving mature and specialty process nodes."],
    ["winbond", "Winbond", "company", "foundry_memory", "public", "2344.TW", "Market cap: public", "Taiwan", "TWSE", "https://www.winbond.com", "Specialty memory supplier used in embedded and edge systems."],
    ["dell", "Dell Technologies", "company", "datacenter", "public", "DELL", "Market cap: public", "United States", "NYSE", "https://www.dell.com", "Server and enterprise infrastructure provider for AI clusters."],
    ["hpe", "HPE", "company", "datacenter", "public", "HPE", "Market cap: public", "United States", "NYSE", "https://www.hpe.com", "Enterprise server, networking and supercomputing infrastructure provider."],
    ["lenovo", "Lenovo", "company", "datacenter", "public", "0992.HK", "Market cap: public", "China", "HKEX", "https://www.lenovo.com", "Global server and enterprise infrastructure supplier."],
    ["quanta", "Quanta Computer", "company", "datacenter", "public", "2382.TW", "Market cap: public", "Taiwan", "TWSE", "https://www.quantatw.com", "ODM server manufacturer serving hyperscale and AI data center demand."],
    ["wistron", "Wistron", "company", "datacenter", "public", "3231.TW", "Market cap: public", "Taiwan", "TWSE", "https://www.wistron.com", "ODM and electronics manufacturer with server infrastructure exposure."],
    ["wiwynn", "Wiwynn", "company", "datacenter", "public", "6669.TW", "Market cap: public", "Taiwan", "TWSE", "https://www.wiwynn.com", "Cloud infrastructure and data center server supplier."],
    ["vertiv", "Vertiv", "company", "datacenter", "public", "VRT", "Market cap: public", "United States", "NYSE", "https://www.vertiv.com", "Power, cooling and infrastructure systems supplier for data centers."],
    ["eaton", "Eaton", "company", "datacenter", "public", "ETN", "Market cap: public", "Ireland", "NYSE", "https://www.eaton.com", "Power management supplier serving data center electrification."],
    ["schneider", "Schneider Electric", "company", "datacenter", "public", "SU.PA", "Market cap: public", "France", "Euronext", "https://www.se.com", "Energy management and automation supplier for data centers."],
    ["digital_realty", "Digital Realty", "company", "datacenter", "public", "DLR", "Market cap: public", "United States", "NYSE", "https://www.digitalrealty.com", "Data center REIT and colocation infrastructure provider."],
    ["equinix", "Equinix", "company", "datacenter", "public", "EQIX", "Market cap: public", "United States", "NASDAQ", "https://www.equinix.com", "Global colocation and interconnection data center platform."],
    ["google_cloud", "Google Cloud", "cloud", "cloud_compute", "public", "GOOGL", "Part of Alphabet", "United States", "NASDAQ", "https://cloud.google.com", "Google cloud platform offering TPU, GPU and AI platform services."],
    ["oracle_cloud", "Oracle Cloud", "cloud", "cloud_compute", "public", "ORCL", "Part of Oracle", "United States", "NYSE", "https://www.oracle.com/cloud", "Oracle cloud infrastructure platform with GPU and AI services."],
    ["lambda_labs", "Lambda", "company", "cloud_compute", "private", "", "Reported valuation only", "United States", "", "https://lambda.ai", "GPU cloud and AI developer compute provider."],
    ["crusoe", "Crusoe", "company", "cloud_compute", "private", "", "Reported valuation only", "United States", "", "https://www.crusoe.ai", "AI infrastructure and cloud compute company focused on energy-aware data centers."],
    ["nebius", "Nebius", "company", "cloud_compute", "public", "NBIS", "Market cap: public", "Netherlands", "NASDAQ", "https://nebius.com", "AI infrastructure and cloud platform provider."],
    ["together_ai", "Together AI", "company", "cloud_compute", "private", "", "Reported valuation only", "United States", "", "https://www.together.ai", "Cloud platform for training, fine-tuning and serving open models."],
    ["replicate", "Replicate", "company", "cloud_compute", "private", "", "Reported valuation only", "United States", "", "https://replicate.com", "Model inference and deployment platform for open models."],
    ["modal", "Modal", "company", "cloud_compute", "private", "", "Reported valuation only", "United States", "", "https://modal.com", "Serverless compute platform used for AI workloads."],
    ["deepmind", "Google DeepMind", "company", "foundation_model", "public", "GOOGL", "Part of Alphabet", "United Kingdom", "NASDAQ", "https://deepmind.google", "Google's AI research and foundation model organization."],
    ["cohere", "Cohere", "company", "foundation_model", "private", "", "Reported valuation only", "Canada", "", "https://cohere.com", "Enterprise foundation model provider focused on business applications."],
    ["xai", "xAI", "company", "foundation_model", "private", "", "Reported valuation only", "United States", "", "https://x.ai", "Foundation model company developing Grok and related AI systems."],
    ["stability_ai", "Stability AI", "company", "foundation_model", "private", "", "Reported valuation only", "United Kingdom", "", "https://stability.ai", "Generative AI model company known for image and media models."],
    ["ai21", "AI21 Labs", "company", "foundation_model", "private", "", "Reported valuation only", "Israel", "", "https://www.ai21.com", "Language model and enterprise AI company."],
    ["adept", "Adept", "company", "foundation_model", "private", "", "Reported valuation only", "United States", "", "https://www.adept.ai", "AI agent and foundation model company focused on software actions."],
    ["inflection", "Inflection AI", "company", "foundation_model", "private", "", "Reported valuation only", "United States", "", "https://inflection.ai", "Foundation model company focused on conversational AI."],
    ["deepseek", "DeepSeek", "company", "foundation_model", "private", "", "Unknown", "China", "", "https://www.deepseek.com", "Foundation model company releasing reasoning and language models."],
    ["moonshot", "Moonshot AI", "company", "foundation_model", "private", "", "Reported valuation only", "China", "", "https://www.moonshot.cn", "Chinese foundation model company behind Kimi and related AI services."],
    ["baidu_ai", "Baidu AI Cloud / ERNIE", "company", "foundation_model", "public", "BIDU", "Part of Baidu", "China", "NASDAQ", "https://cloud.baidu.com", "Baidu AI cloud and ERNIE foundation model ecosystem."],
    ["alibaba_qwen", "Alibaba Cloud / Qwen", "company", "foundation_model", "public", "BABA", "Part of Alibaba", "China", "NYSE", "https://www.alibabacloud.com", "Alibaba Cloud foundation model and cloud AI ecosystem."],
    ["tencent_hunyuan", "Tencent Hunyuan", "company", "foundation_model", "public", "0700.HK", "Part of Tencent", "China", "HKEX", "https://hunyuan.tencent.com", "Tencent foundation model and cloud AI ecosystem."],
    ["llamaindex", "LlamaIndex", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://www.llamaindex.ai", "Data framework for connecting private data to LLM applications."],
    ["wandb", "Weights & Biases", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://wandb.ai", "MLOps and model experiment tracking platform."],
    ["snowflake", "Snowflake", "company", "ai_infra", "public", "SNOW", "Market cap: public", "United States", "NYSE", "https://www.snowflake.com", "Cloud data platform used for analytics and AI workloads."],
    ["weaviate", "Weaviate", "company", "ai_infra", "private", "", "Reported valuation only", "Netherlands", "", "https://weaviate.io", "Open-source vector database and search infrastructure."],
    ["chroma", "Chroma", "company", "ai_infra", "private", "", "Unknown", "United States", "", "https://www.trychroma.com", "Open-source embedding database for AI applications."],
    ["mongodb", "MongoDB", "company", "ai_infra", "public", "MDB", "Market cap: public", "United States", "NASDAQ", "https://www.mongodb.com", "Document database with vector search and AI application infrastructure features."],
    ["elastic", "Elastic", "company", "ai_infra", "public", "ESTC", "Market cap: public", "United States", "NYSE", "https://www.elastic.co", "Search and observability platform used in AI retrieval and operations."],
    ["redis", "Redis", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://redis.io", "In-memory data platform with vector and low-latency application infrastructure use cases."],
    ["milvus_zilliz", "Zilliz / Milvus", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://zilliz.com", "Vector database company behind Milvus."],
    ["qdrant", "Qdrant", "company", "ai_infra", "private", "", "Reported valuation only", "Germany", "", "https://qdrant.tech", "Open-source vector search engine and database company."],
    ["scale_ai", "Scale AI", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://scale.com", "Data labeling, evaluation and AI data platform company."],
    ["labelbox", "Labelbox", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://labelbox.com", "Data labeling and model evaluation platform."],
    ["baseten", "Baseten", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://www.baseten.co", "Model serving and inference platform."],
    ["modal_infra", "Modal Labs", "company", "ai_infra", "private", "", "Reported valuation only", "United States", "", "https://modal.com", "Developer platform for running AI workloads and jobs."],
    ["harvey", "Harvey", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://www.harvey.ai", "Legal AI application company serving law firms and enterprises."],
    ["glean", "Glean", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://www.glean.com", "Enterprise AI search and knowledge assistant."],
    ["runway", "Runway", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://runwayml.com", "Generative video and creative AI product company."],
    ["synthesia", "Synthesia", "company", "application", "private", "", "Reported valuation only", "United Kingdom", "", "https://www.synthesia.io", "AI video generation platform for enterprise media workflows."],
    ["character_ai", "Character AI", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://character.ai", "Consumer AI character and conversational product."],
    ["replit", "Replit", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://replit.com", "Cloud development and AI coding environment."],
    ["jasper", "Jasper", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://www.jasper.ai", "AI marketing and content platform."],
    ["copy_ai", "Copy.ai", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://www.copy.ai", "AI go-to-market and content automation platform."],
    ["notion_ai", "Notion AI", "product", "application", "private", "", "Part of Notion", "United States", "", "https://www.notion.com/product/ai", "AI features embedded in Notion's productivity workspace."],
    ["adobe_firefly", "Adobe Firefly", "product", "application", "public", "ADBE", "Part of Adobe", "United States", "NASDAQ", "https://www.adobe.com/products/firefly.html", "Creative generative AI product family from Adobe."],
    ["github_copilot", "GitHub Copilot", "product", "application", "public", "MSFT", "Part of Microsoft", "United States", "NASDAQ", "https://github.com/features/copilot", "AI coding assistant integrated into developer workflows."],
    ["microsoft_copilot", "Microsoft Copilot", "product", "application", "public", "MSFT", "Part of Microsoft", "United States", "NASDAQ", "https://www.microsoft.com/microsoft-copilot", "AI assistant integrated across Microsoft products."],
    ["canva_ai", "Canva AI", "product", "application", "private", "", "Part of Canva", "Australia", "", "https://www.canva.com/ai", "AI design and creative tools inside Canva."],
    ["descript", "Descript", "company", "application", "private", "", "Reported valuation only", "United States", "", "https://www.descript.com", "Audio and video editing platform with AI media tools."],
    ["founders_fund", "Founders Fund", "investor", "application", "private", "", "N/A", "United States", "", "https://foundersfund.com", "Technology investment firm active in AI infrastructure and applications."],
    ["lightspeed", "Lightspeed Venture Partners", "investor", "application", "private", "", "N/A", "United States", "", "https://lsvp.com", "Venture capital firm investing across AI, enterprise and consumer technology."],
    ["thrive", "Thrive Capital", "investor", "application", "private", "", "N/A", "United States", "", "https://thrivecap.com", "Investment firm active in AI model and application companies."],
    ["khosla", "Khosla Ventures", "investor", "application", "private", "", "N/A", "United States", "", "https://www.khoslaventures.com", "Venture capital firm investing in frontier technology and AI."],
    ["accel", "Accel", "investor", "application", "private", "", "N/A", "United States", "", "https://www.accel.com", "Global venture capital firm investing in software and AI companies."],
    ["benchmark", "Benchmark", "investor", "application", "private", "", "N/A", "United States", "", "https://www.benchmark.com", "Venture capital partnership investing in technology startups."]
  ].map(([id, name, type, layer, status, ticker, valuation, country, exchange, website_url, description]) => ({
    id,
    name,
    type,
    layer,
    status,
    ticker,
    valuation,
    website_url,
    country,
    exchange,
    aliases: [name, ticker].filter(Boolean),
    metrics: {
      "总部": country,
      "状态": status,
      "核心": layerDefaults[layer],
      "数据口径": status === "public" ? "public filings / market data" : "public disclosures / manual seed"
    },
    description
  }));

  seed.entities.forEach((entity) => {
    const enrichment = existingEnrichment[entity.id] || {};
    Object.assign(entity, {
      website_url: enrichment.website_url || entity.website_url || "",
      country: enrichment.country || entity.country || entity.metrics?.["总部"] || "Unknown",
      exchange: enrichment.exchange || entity.exchange || "",
      aliases: enrichment.aliases || entity.aliases || [entity.name, entity.ticker].filter(Boolean)
    });
  });

  const entityIds = new Set(seed.entities.map((entity) => entity.id));
  newEntities.forEach((entity) => {
    if (!entityIds.has(entity.id)) {
      seed.entities.push(entity);
      entityIds.add(entity.id);
    }
  });

  const sourceExtensions = [
    {
      id: "src_company_sites",
      title: "Company official websites and product pages",
      publisher: "Company websites",
      date: "Public web",
      url: "https://example.com/company-sites",
      sourceType: "official_docs",
      evidenceStrength: "official_docs",
      licenseNote: "Company-authored public web pages; store URL, short facts and summaries only.",
      fetchedAt: "2026-07-04T00:00:00.000Z",
      note: "用于记录公司官网、产品页和公开业务描述。具体关系在后续 evidence 表中细化。"
    },
    {
      id: "src_public_filings",
      title: "Public company filings and investor relations",
      publisher: "Public companies",
      date: "Public web",
      url: "https://www.sec.gov/edgar/search/",
      sourceType: "official_filings",
      evidenceStrength: "official_docs",
      licenseNote: "Public filings and investor relations pages; store facts, URLs and short excerpts.",
      fetchedAt: "2026-07-04T00:00:00.000Z",
      note: "用于上市公司业务、客户、供应链、收入和风险因素披露。"
    },
    {
      id: "src_public_portfolio",
      title: "Public investor portfolio and funding disclosures",
      publisher: "Investment firms and public announcements",
      date: "Public web",
      url: "https://example.com/public-portfolios",
      sourceType: "public_portfolio",
      evidenceStrength: "official_docs",
      licenseNote: "Public portfolio and announcement pages; investment facts require linked evidence URL.",
      fetchedAt: "2026-07-04T00:00:00.000Z",
      note: "用于投资关系和公开融资事件的候选记录。"
    },
    {
      id: "src_ecosystem_mapping",
      title: "Manual AI ecosystem mapping",
      publisher: "AI Capital Map seed review",
      date: "2026-07-02",
      url: "AI_INDUSTRY_CHAIN_TECH_PLAN.md",
      sourceType: "manual_seed",
      evidenceStrength: "manual_seed",
      licenseNote: "Internal ecosystem mapping; prioritize replacement with specific official or public evidence URLs.",
      fetchedAt: "2026-07-02T00:00:00.000Z",
      note: "P1 阶段人工整理的产业链依赖关系，后续需要逐条替换为更细 evidence。"
    }
  ];

  const sourceIds = new Set(seed.sources.map((source) => source.id));
  sourceExtensions.forEach((source) => {
    if (!sourceIds.has(source.id)) {
      seed.sources.push(source);
      sourceIds.add(source.id);
    }
  });

  Object.assign(seed.relationLabels, {
    customer_of: "客户",
    uses: "使用",
    depends_on: "依赖",
    funded_by: "融资来自",
    manufactured_by: "制造",
    designed_by: "设计",
    related_to: "相关",
    published_by: "发表机构",
    authored_by: "作者",
    cites: "引用"
  });

  const addRelationship = (relationships, seen, source, target, type, confidence, sourceId, note) => {
    if (!entityIds.has(source) || !entityIds.has(target) || source === target) return;
    const key = `${source}|${target}|${type}`;
    if (seen.has(key)) return;
    relationships.push({
      id: `p1_rel_${relationships.length + 1}`,
      source,
      target,
      type,
      confidence,
      sourceId,
      note
    });
    seen.add(key);
  };

  const relationshipSeen = new Set(seed.relationships.map((relationship) => `${relationship.source}|${relationship.target}|${relationship.type}`));
  const p1Relationships = [];

  const group = (layer) => seed.entities.filter((entity) => entity.layer === layer).map((entity) => entity.id);
  const equipment = group("equipment");
  const chips = group("chip_design");
  const foundry = group("foundry_memory");
  const datacenter = group("datacenter");
  const cloud = group("cloud_compute");
  const models = group("foundation_model");
  const infra = group("ai_infra");
  const apps = group("application").filter((id) => !["sequoia", "a16z", "founders_fund", "lightspeed", "thrive", "khosla", "accel", "benchmark"].includes(id));
  const investors = ["sequoia", "a16z", "founders_fund", "lightspeed", "thrive", "khosla", "accel", "benchmark"];

  const connectMany = (sources, targets, type, confidence, sourceId, note, limitPerSource) => {
    sources.forEach((source) => {
      targets.slice(0, limitPerSource).forEach((target) => {
        addRelationship(p1Relationships, relationshipSeen, source, target, type, confidence, sourceId, note);
      });
    });
  };

  connectMany(equipment, foundry, "supplies_to", 0.78, "src_ecosystem_mapping", "半导体制造设备供应晶圆制造、封装和存储生产链条。", 5);
  connectMany(foundry, chips, "supplies_to", 0.76, "src_ecosystem_mapping", "代工、封装和存储供应高性能 AI 芯片和加速器。", 7);
  connectMany(chips, datacenter, "supplies_to", 0.72, "src_ecosystem_mapping", "AI 芯片、网络芯片和 IP 服务服务器和数据中心基础设施。", 6);
  connectMany(datacenter, cloud, "supplies_to", 0.7, "src_ecosystem_mapping", "服务器、网络、电力和机房供应云和 GPU 云平台扩张。", 6);
  connectMany(cloud, models, "runs_on", 0.72, "src_ecosystem_mapping", "基础模型训练和推理依赖云、GPU 云和专用计算平台。", 7);
  connectMany(models, infra, "integrates_with", 0.68, "src_ecosystem_mapping", "AI Infra 通常集成基础模型 API、开源权重或推理端点。", 7);
  connectMany(infra, apps, "supplies_to", 0.66, "src_ecosystem_mapping", "AI 应用依赖模型托管、数据平台、向量库、Agent 框架和评测工具。", 6);
  connectMany(models, apps, "supplies_to", 0.66, "src_ecosystem_mapping", "AI 应用直接或间接依赖基础模型能力。", 7);
  connectMany(investors, models.concat(infra, apps).slice(0, 38), "invested_in", 0.58, "src_public_portfolio", "公开投资组合和融资披露的候选投资关系，需后续逐条证据化。", 10);

  const specialEdges = [
    ["synopsys", "nvidia", "supplies_to", 0.72, "src_company_sites", "EDA 和 IP 工具支撑复杂芯片设计流程。"],
    ["cadence", "amd", "supplies_to", 0.72, "src_company_sites", "EDA 工具支撑复杂芯片设计流程。"],
    ["arm", "aws", "supplies_to", 0.62, "src_company_sites", "Arm IP 生态影响云自研芯片和边缘 AI 设备。"],
    ["marvell", "aws", "supplies_to", 0.66, "src_public_filings", "网络和定制硅供应云数据中心。"],
    ["nvidia", "lambda_labs", "supplies_to", 0.78, "src_company_sites", "GPU 云平台依赖 NVIDIA GPU 供给。"],
    ["nvidia", "oracle_cloud", "supplies_to", 0.75, "src_company_sites", "云平台提供 NVIDIA GPU 实例和 AI 计算集群。"],
    ["nvidia", "google_cloud", "supplies_to", 0.75, "src_company_sites", "云平台提供 NVIDIA GPU 实例和 AI 计算集群。"],
    ["google_cloud", "deepmind", "runs_on", 0.84, "src_company_sites", "Google DeepMind 与 Google Cloud/TPU 生态紧密相关。"],
    ["aws", "cohere", "runs_on", 0.65, "src_company_sites", "企业模型服务可部署在云平台上。"],
    ["oracle_cloud", "xai", "runs_on", 0.6, "src_ecosystem_mapping", "GPU 云和模型公司存在公开算力合作候选关系，需继续证据化。"],
    ["huggingface", "replicate", "integrates_with", 0.7, "src_hf", "模型分发生态和推理平台常连接开源模型。"],
    ["mistral", "replicate", "released_by", 0.68, "src_hf", "开源模型可通过推理平台分发和部署。"],
    ["llamaindex", "pinecone", "integrates_with", 0.72, "src_github", "RAG 框架和向量数据库常集成。"],
    ["llamaindex", "weaviate", "integrates_with", 0.72, "src_github", "RAG 框架和向量数据库常集成。"],
    ["langchain", "qdrant", "integrates_with", 0.72, "src_github", "Agent/RAG 框架和向量数据库常集成。"],
    ["langchain", "weaviate", "integrates_with", 0.72, "src_github", "Agent/RAG 框架和向量数据库常集成。"],
    ["snowflake", "databricks", "competes_with", 0.55, "src_ecosystem_mapping", "数据平台在企业 AI 数据层存在竞争。"],
    ["cursor", "github_copilot", "competes_with", 0.7, "src_ecosystem_mapping", "AI 编程助手和编辑器存在直接竞争。"],
    ["runway", "adobe_firefly", "competes_with", 0.62, "src_ecosystem_mapping", "创意生成工具在图像和视频工作流存在竞争。"],
    ["glean", "perplexity", "competes_with", 0.52, "src_ecosystem_mapping", "企业搜索和 AI 搜索存在部分交集。"],
    ["openai", "github_copilot", "supplies_to", 0.72, "src_ecosystem_mapping", "AI 编程产品依赖基础模型能力。"],
    ["openai", "microsoft_copilot", "supplies_to", 0.8, "src_company_sites", "Microsoft Copilot 生态与 OpenAI 模型合作关系相关。"],
    ["deepmind", "google_cloud", "integrates_with", 0.8, "src_company_sites", "Google AI 模型和云平台集成。"],
    ["alibaba_qwen", "huggingface", "released_by", 0.72, "src_hf", "开源权重和模型卡可在 Hugging Face 等平台分发。"],
    ["deepseek", "huggingface", "released_by", 0.72, "src_hf", "开源权重和模型卡可在 Hugging Face 等平台分发。"],
    ["stability_ai", "runway", "competes_with", 0.58, "src_ecosystem_mapping", "生成式媒体模型和应用存在竞争交集。"],
    ["scale_ai", "openai", "supplies_to", 0.55, "src_ecosystem_mapping", "数据和评测平台服务模型训练与部署链条。"],
    ["labelbox", "cohere", "supplies_to", 0.52, "src_ecosystem_mapping", "数据标注和评测平台服务企业模型开发。"]
  ];

  specialEdges.forEach(([source, target, type, confidence, sourceId, note]) => {
    addRelationship(p1Relationships, relationshipSeen, source, target, type, confidence, sourceId, note);
  });

  seed.relationships.push(...p1Relationships);
  seed.relationships.forEach((relationship, index) => {
    relationship.id = relationship.id || `rel_${index + 1}`;
  });

  const evidenceOverrides = [
    {
      relationshipId: "rel_4",
      evidenceTitle: "NVIDIA and CoreWeave cloud infrastructure references",
      evidenceUrl: "https://www.nvidia.com/en-us/data-center/cloud-gaming/coreweave/",
      evidencePublisher: "NVIDIA",
      evidenceDate: "Public web",
      evidenceStrength: "official_docs",
      evidenceNote: "Official NVIDIA product page used as direct evidence for NVIDIA infrastructure referenced with CoreWeave."
    },
    {
      relationshipId: "rel_11",
      evidenceTitle: "Microsoft and OpenAI partnership overview",
      evidenceUrl: "https://news.microsoft.com/source/features/ai/microsoft-openai-partnership/",
      evidencePublisher: "Microsoft",
      evidenceDate: "Public web",
      evidenceStrength: "official_docs",
      evidenceNote: "Official Microsoft page used as direct evidence for Azure and OpenAI partnership / cloud relationship."
    },
    {
      relationshipId: "rel_29",
      evidenceTitle: "Microsoft and OpenAI partnership overview",
      evidenceUrl: "https://news.microsoft.com/source/features/ai/microsoft-openai-partnership/",
      evidencePublisher: "Microsoft",
      evidenceDate: "Public web",
      evidenceStrength: "official_docs",
      evidenceNote: "Official Microsoft page used as direct evidence for Microsoft/OpenAI strategic investment and commercial partnership context."
    },
    {
      relationshipId: "rel_16",
      evidenceTitle: "Hugging Face documentation",
      evidenceUrl: "https://huggingface.co/docs",
      evidencePublisher: "Hugging Face",
      evidenceDate: "Public web",
      evidenceStrength: "official_docs",
      evidenceNote: "Official Hugging Face documentation used as direct evidence for Hugging Face ecosystem integration review."
    },
    {
      relationshipId: "rel_17",
      evidenceTitle: "GitHub REST API",
      evidenceUrl: "https://docs.github.com/en/rest",
      evidencePublisher: "GitHub",
      evidenceDate: "Live public data",
      evidenceStrength: "official_api",
      evidenceNote: "GitHub API metadata is the direct evidence source for open-source integration and repository activity checks."
    },
    {
      relationshipId: "rel_18",
      evidenceTitle: "Databricks external models in Model Serving",
      evidenceUrl: "https://docs.databricks.com/aws/en/machine-learning/foundation-models/external-models/",
      evidencePublisher: "Databricks",
      evidenceDate: "2026-06-30",
      evidenceStrength: "official_docs",
      evidenceNote: "Official Databricks documentation lists OpenAI as a supported external model provider for Model Serving, supporting the Databricks/OpenAI integration relationship."
    }
  ];
  const evidenceOverrideById = new Map(evidenceOverrides.map((override) => [override.relationshipId, override]));
  seed.relationships.forEach((relationship) => {
    const override = evidenceOverrideById.get(relationship.id);
    if (!override) return;
    const { relationshipId, ...evidenceFields } = override;
    Object.assign(relationship, evidenceFields);
  });

  window.AI_CAPITAL_BOOT = Object.assign(window.AI_CAPITAL_BOOT || {}, {
    p1ExtensionLoaded: true,
    p1EntityCount: seed.entities.length,
    p1RelationshipCount: seed.relationships.length
  });
})();
