# 阶段6：方法库 2.0

交付日期：2026-10-15。完整验收报告位于工作目录 `outputs/阶段6-方法库2.0-验收报告-2026-10-15.md`。

- 策略模型：`lib/method-strategy-schema.ts`，复用原方法卡版本化 JSON。
- 核心数据：`data/method-strategies/core-v2.json`，11张参数策略、12张基本不等式策略，均为待审核教学草案。
- 导入及规则：`lib/method-strategies.ts`、`lib/strategy-decision.ts`。
- 教师界面：`components/method-strategy.tsx`、`components/strategy-decision.tsx`。
- 兼容索引：`drizzle/0025_method_strategy_identity.sql`；本地已备份并应用，生产环境未部署。
- 入口：使用工作目录的 `Start-Tutor.cmd`，访问 `/math-methods`。

本地导入23张候选卡、46条候选适用关系；重复导入零新增。缺失研究报告经用户同意忽略，没有声称已导入报告中的100张卡。

接续验证：37项相关及受阻回归测试全部通过，类型检查、相关 ESLint、构建通过，10道真实题目的召回和保守性检查通过。真实样本检查不代表专家标注推荐准确率。

历史私有题库 scope owner 与方法 owner 不同，离线导入 CLI 的直接所有权守卫会拒绝该组合；日常操作使用应用内授权 API。所有新卡及推断关系仍需人工审核。
