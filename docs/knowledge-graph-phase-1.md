# 数学知识星图 · Phase 1

## 当前架构与边界

项目使用 React 19、Next 16 / Vinext、TypeScript、Drizzle ORM 和 SQLite / Cloudflare D1。
已有 `knowledge_points`、`math_knowledge_relations`、解题方法及知识图谱页面继续使用原有结构。
本阶段只新增课程知识模型，不替换旧模块，不新增学生画像或掌握度模型。

模型入口：`db/knowledge_graph/models.ts`，由 `db/schema.ts` 导出。
后续服务放 `lib/knowledge_graph/`，API 在现有 `app/api/knowledge-graph/` 下新增独立的 `catalog` 路由，避免覆盖旧接口。本阶段不开放写入接口。

## 三张新表

### knowledge_nodes

`id` 为稳定文本标识；`code` 为稳定知识编码。`subject` 默认 math，`stage` 默认 senior_high；预留 junior_high 等学段。
`curriculum_version` 默认 general-v1，区分课程体系版本；同学科、学段、版本内编码唯一，名称不唯一。

`level`：1 学科模块、2 一级章节、3 核心知识点、4 考试考点、5 常见题型。
`description` 描述概念；`difficulty` 为可空的 1–5 整数；`importance` 和 `exam_frequency` 为可空的 low / medium / high。
空值代表尚未评定，不把未知频率当作低频。频率是编辑评定标签，并非学生数据或真实考试统计。
`metadata` 是 JSON 对象，预留别名、课程标准引用、评定依据等数据。
章节从层级关系查得，不重复保存 chapter 字符串，避免改名后信息不一致。

### knowledge_edges

`source_id`、`target_id` 均引用节点；同一方向、同一关系不能重复，禁止自环，禁止悬空外键。

| 关系 | 固定方向 |
| --- | --- |
| belongs_to | 子节点 → 父节点，例如二次函数 → 函数 |
| contains | 父节点 → 子节点，作为 belongs_to 的反向表达 |
| prerequisite | 当前知识 → 必需的前置知识，例如导数 → 函数性质 |
| related | 对称关联；后续写入服务按 ID 排序后只存一条 |
| advanced | 基础知识 → 进阶知识 |

层级关系推荐只存 belongs_to；查询生成反向 contains，不同时写入两份。
跨行的层级相邻性、同课程版本、环路检测以及 related 反向去重由后续服务在事务内实现；本阶段 SQL 仅保证行级约束和引用完整性，不宣称已完成这些业务校验。

### question_knowledge_relation

`question_id` 引用现有 `canonical_questions.id`，不是旧 `questions.id` 整数。
上传试卷题和原题库记录通过已有 `question_module_links` 取得统一题目 ID；未建立映射的旧题需先完成映射，不伪造 ID。
`scope_id` 与题目 ID 使用复合外键，保证题库归属一致；权限仍须由服务端校验，外键不是授权机制。
`knowledge_id` 引用知识节点，二者组成主键，支持一题多知识点。
`weight` 范围 (0,1]；`role` 为 main / secondary / exam_point / question_type。
权重是单条关联强度，不强制一题所有层级的权重总和为 1；需要比例时按角色在读取端归一化。
数量按授权 scope 内已审核、未删除且有效的统一题目去重统计，不能暴露其他教师私有题库数量。

## 审核、维护和扩展

三张表都有 `knowledge_review_status`（pending / approved），默认 pending。
`source` 为 manual / seed / ai；`reviewed_by`、`reviewed_at` 保存审核信息，approved 必须有非空审核人及时间。
`created_at` 和 `updated_at` 默认当前时间；后续更新服务必须显式更新 updated_at（没有自动更新时间触发器）。

正式图谱只查询 approved 节点；边须同时满足边和两端节点 approved；题目关联须同时满足关联及知识节点 approved。
候选项可以留在同表，只有独立审核入口可以读取 pending。现有接口不读取新表，因而本阶段不会将候选项暴露到正式图谱。
撤回节点审核后，以上联表过滤应立即隐藏相关边和题目关联。
Phase 3 再实现 AI 输出匹配、候选创建、授权及事务审核；不得仅凭 AI 输出直接批准。
所有新外键使用 RESTRICT，避免误删一个知识点造成关联数据级联丢失。将来合并节点须先迁移引用。

## 迁移与验证

`drizzle/0023_mathematics_knowledge_catalog.sql` 为纯新增迁移，仅创建三张表和索引，不重写旧表、不导入知识数据。
Drizzle 日志和 0023 快照一起提交；保留已有 0021、0022 迁移与未提交修改。
本阶段仅在内存 SQLite 中按顺序执行全部迁移，未修改当前业务数据库。
实际部署须沿用项目备份及离线迁移流程，核对数据库路径、已有迁移和外键状态后执行；不要直接对正在写入的 SQLite 文件操作。

运行相关测试：`node --import tsx --test tests/knowledge-catalog-schema.test.ts tests/canonical-schema.test.ts`。
覆盖新模型导出和字段对应、全迁移兼容、完整性、审核约束、重复关系、自环、无效权重、跨题库外键及删除保护。

## 下一阶段

Phase 2：为指定的 11 个高中数学章节编写至少 300 个节点的版本化 JSON，覆盖章节、知识点、考点和题型；建立稳定编码、来源依据、幂等导入及层级/环路验证。初始化必须经过明确的人工或种子审核，不由 AI 自动批准。
Phase 3：实现自动关联及审核服务；Phase 4：接入 G6 页面；Phase 5：优化视觉和动效。
