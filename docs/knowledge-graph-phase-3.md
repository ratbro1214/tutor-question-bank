# 数学知识星图 · Phase 3

## 已完成与前端时间点

本阶段完成 AI 输出扩展、知识匹配、候选隔离、自动入库挂载、题目版本证据及审核/读取接口。
下一阶段 Phase 4 开始 G6 前端：KnowledgeGraph 页面、Graph 组件、NodeDetail 组件、缩放拖动、展开及详情；Phase 5 再处理视觉和动画。
当前旧知识图谱页面没有替换，因此用户暂时看不到新星图。

## AI 与上传流程

高中数学沿用现有一次识别分类请求，在 classification 内增加：

```json
{
  "knowledge_graph": {
    "main_knowledge": "二次函数",
    "secondary_knowledge": ["函数单调性"],
    "exam_point": "二次函数区间最值",
    "question_type": "含参数二次函数最值问题"
  }
}
```

结构化输出与修复提示均带上此字段，并在本地验证。主知识点必填，辅助知识点最多 3 个；不确定的考点/题型可为空。不更改初中输出协议。缓存版本已更新，防止复用不含新字段的旧模型缓存。

自动挂载沿用已有身份确认边界：

1. 未确认的试卷题先在原 classification 字段保存 AI 结果；接口返回 awaiting_identity。
2. 教师确认试卷加入统一题库后自动挂载；单题加入统一题库时同样自动挂载。
3. 已有映射的试卷题在分析完成或复用分类时尝试挂载，无需再次调用 AI。
4. 未初始化知识库或挂载失败时，上传/入库成功仍保留，接口返回 deferred。可通过 attach 接口重试，不吞掉原入库结果。

挂载只读取服务端保存的当前题目版本与分类，不接受客户端提交任意知识标签。历史分类缺少新字段时，仅从已有知识点名称提取主辅知识点，不伪造考点和题型。未扫描或批量修改当前业务库内的历史题目。

试卷来源分类仅在来源仍绑定当前 revision、来源文本与该 revision 原文相同且来源未脱离时使用；提交事务时再次检查来源 classification 和题目版本。文本变化应先沿用原系统核对身份，不能把新题分类挂到旧题身份。

## 匹配与审核

支持标准名称、稳定编码和少量显式维护的同义名称；只做字形/空白规范化及明确同义词匹配，不做子串猜测。
考点限制在主知识点下匹配，已知考点的典型题型限制在该考点下匹配。若名称不存在或存在歧义，创建 pending 候选；候选 ID 根据题库范围、层级、上级和名称确定，重复操作不会无限增加节点。
候选节点 metadata 记录 scope_id；教师不能读取或审核其他私有题库的候选。共享种子可读取，但只有项目维护者可批准。
主辅知识关联去重后，单主知识点权重为 1；有辅助知识点时主知识点为 0.6，其余 0.4 平分。考点和题型使用独立权重 1，不与核心知识点比例混加。

AI 创建的节点、层级边及题目关联均为 pending。种子节点也是此前的待审核状态，不能因为被 AI 匹配就自动批准。
审批节点必须先有唯一、相邻层级的已审核上级；待审核孤立候选可以在审批时指定 parentId。节点审批同时批准其归属边。共享前置/相关/进阶边需两端已审核，并由维护者批准。
题目关联审批要求知识节点已批准且证据属于题目当前版本。审批使用预期更新时间检查并在事务内校验，冲突时回滚。

重复分析只重建未审核 AI 关联，不覆盖教师已审核的同版本关联。题目 revision 变化后旧关联不计入正式题数；再次挂载同知识点时转为待审核，避免沿用旧题结论。

## 数据库变化

新增 `knowledge_relation_evidence`，字段：question_id、knowledge_id、revision_id、analysis_hash、created_at。
以题目与知识点组成主键；复合外键要求 evidence 对应已有题目关联、revision 属于同一题目。删除关联时清理其证据；不级联删除题目或知识节点。

迁移：`drizzle/0024_knowledge_attachment_evidence.sql`，纯新增表及索引，保留前三张表。
离线初始化命令已更新，可按需应用 0023 和 0024；已存在但结构不完整的表不自动覆盖。当前运行中的业务库未执行迁移。

正式图谱的默认查询同时过滤节点、边、题目关联的审核状态；关联计数仅统计授权 scope 内、当前 revision、未进回收站、active 状态的不同题目。

## 前端可调用的接口

统一入口：`/api/knowledge-graph/catalog`，全部要求登录和现有 libraryScopes 授权，修改请求检查 Origin / Sec-Fetch-Site，响应不缓存。

| 请求 | 用途 |
| --- | --- |
| GET | 已审核节点、已审核边和每节点关联题数 |
| GET ?view=review | 共享种子和本人题库范围内的待审核内容 |
| GET ?questionId=… | 当前题目的关联列表，包含审核状态及 stale 标记 |
| POST action=attach | 按 questionId、revisionId 从已保存分类补挂载 |
| POST action=approve_node | 按 nodeId、expectedUpdatedAt 批准节点，可指定 parentId |
| POST action=approve_edge | 按 edgeId、expectedUpdatedAt 批准跨知识关系 |
| POST action=approve_link | 按 questionId、knowledgeId、revisionId、expectedUpdatedAt 批准关联 |

审批界面、候选名称编辑/合并、自动重试调度和全库批量补挂载不在本次实现中。当前可通过接口逐项审核和补挂载；下一阶段页面直接复用这些接口。

## 修改文件列表

- `lib/knowledge_graph/analysis.ts`：AI 输出协议、校验、历史分类适配。
- `lib/knowledge_graph/attachment-store.ts`：D1 事务匹配、候选创建、挂载、读取和审核。
- `lib/knowledge_graph/server.ts`：认证、来源检查、错误处理及试卷挂载桥接。
- `app/api/knowledge-graph/catalog/route.ts`：新模块接口。
- `lib/classification.ts`：高中输出协议与结果透传。
- `app/api/analyze/route.ts`：提示、协议修复校验和缓存版本。
- `lib/student-canonical-store.ts`：单题统一题库入库挂载。
- `lib/paper-batch-server.ts`：试卷确认入库挂载。
- `app/api/papers/batches/route.ts`：返回挂载状态。
- `app/api/papers/[id]/questions/[questionId]/analysis/route.ts`：分析完成/复用后的挂载。
- `db/knowledge_graph/models.ts`：关联证据模型。
- `drizzle/0024_knowledge_attachment_evidence.sql`、`drizzle/meta/0024_snapshot.json`、`drizzle/meta/_journal.json`：迁移及登记。
- `scripts/knowledge-catalog.ts`：离线初始化补上 0024。
- `tests/knowledge-attachment.test.ts`：10 项新模块测试。
- `tests/student-canonical.test.ts`、`tests/paper-batch.test.ts`：新增两条入库自动挂载集成测试。
- `docs/knowledge-graph-phase-3.md`：开发说明。

## 验证结果与复测方式

本次累计验证 53 项不同测试（分类 12、模型 4、种子导入 8、新挂载 10、单题入库 11、套卷入库 8），均通过。项目 TypeScript 检查和本次修改文件的 ESLint 检查通过。
覆盖精确/同义匹配、歧义候选、跨用户隔离、主辅权重、重复导入、审批限制、并发更新回滚、旧版本失效、回收站过滤及真实入库函数挂载链路。

```powershell
. 'E:\AI\environment.ps1'
node --import tsx --test tests/knowledge-attachment.test.ts tests/student-canonical.test.ts tests/paper-batch.test.ts tests/classification.test.ts tests/knowledge-catalog-schema.test.ts tests/knowledge-catalog-seed.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

数据库测试使用内存 SQLite 执行实际 D1 语句批次。没有付费调用真实 AI、启动开发服务器或运行浏览器验收；UI 与真实模型联调将在后续按需验证。业务库需在安全维护时应用迁移并导入种子后，新增功能才可实际读写。
