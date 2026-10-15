# Phase 4：数学知识星图

已接入 AntV G6 5.1.1，入口为侧栏「数学知识星图」，地址 /knowledge-graph/star-map。原有 /knowledge-graph 页面继续保留，可通过「知识与解题方法」进入。

## 修改文件

- app/knowledge-graph/star-map/page.tsx：教师登录保护与页面入口。
- components/knowledge_graph/KnowledgeGraph.tsx：真实 API 数据加载、搜索、章节选择、审核/正式视图、节点审核。
- components/knowledge_graph/Graph.tsx：G6 画布，拖拽、缩放、展开、路径高亮、关系样式、动画及销毁清理。
- components/knowledge_graph/NodeDetail.tsx：名称、章节、当前已审核关联题数、重要程度、考点、题型与审核入口。
- lib/knowledge_graph/star-map.ts：可见节点、知识路径、径向初始布局、颜色与大小计算。
- app/api/knowledge-graph/catalog/route.ts：返回共享种子审核权限标识，服务端权限校验继续生效。
- components/app-shell.tsx：侧栏指向新星图入口。
- package.json、package-lock.json：锁定 G6 依赖。
- tests/knowledge-star-map.test.ts：图谱浏览行为测试。
- docs/knowledge-graph-phase-4.md：本说明。

## 数据库变化

Phase 4 不新增表结构。本次已在项目服务停止时，将前两阶段的 0023/0024 结构与知识种子应用到本地业务数据库，导入 392 个节点、426 条关系，全部保留 pending；重复导入新增 0 条。旧表内容校验一致，外键检查通过，完整性检查为 ok。

备份及验证报告：E:/codex/毕设探索/outputs/knowledge-graph-phase2/1791962215635-37192/。

正式图谱目前为空是预期行为。重要程度、考频没有证据时不伪造评级；题数只统计有权限、当前版本、已审核、未删除题目的直接关联。浏览器测试没有批准任何节点。

## 验证方法与结果

- TypeScript 检查通过；新增前端/API及测试文件 ESLint 通过。
- node --import tsx --test tests/knowledge-star-map.test.ts：4 项通过；其中逐一覆盖 152 个典型题型的路径定位。
- 浏览器实际加载：392 节点、11 章节、426 关系。
- 点击函数章节、直接点击画布「二次函数」可展开并联动详情；搜索可定位二次函数及相关题型。
- 切换正式图谱显示「等待审核」，切回审核预览可恢复星图。
- 浏览器错误日志为空。未运行全量测试与生产构建。
- 效果截图：E:/codex/毕设探索/outputs/knowledge-graph-phase4/star-map.png。

复查时通过 E:/codex/毕设探索/Start-Tutor.cmd 启动项目，点击侧栏入口。已审核节点按上级先于下级的顺序确认。

## 下一步

Phase 5：优化标签避让、节点缓慢浮动与高亮对比度，完善窄屏布局及动画暂停策略。当前已有展开过渡、路径高亮和 reduced-motion 适配，尚未加入持续浮动动画。
