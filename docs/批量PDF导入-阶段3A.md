# 批量 PDF 导入（阶段 3A）

双击项目根目录的 `Start-Tutor.cmd`，随后打开 `http://localhost:5173/papers`。已有服务时直接使用该页面，不要重复启动。页面顶部是“批量导入试卷”。

1. 一次选择 3～5 份带文本层的数学试卷 PDF，点击“导入”。一次最多 20 份，每份最多 40MB、80 页。
2. 保持页面打开。系统按文件、按题顺序处理，逐题保存结果。每道题显示文本摘要、缩略图、状态和原因。
3. 查看总统计和每份 PDF 的结果。刷新后可通过“已保存批次”重新查看；处理过程中关闭页面会停止浏览器端处理，尚未完成的批次保留处理中状态。重新选择相同文件导入会创建新的结果批次，并复用原试卷和原题。
4. 待审核题可打开原卷工作台与裁切图，逐项核对公式、选项、小问、必要图形、跨页是否适用及完整。全部确认后勾选人工确认，再点击“确认 READY 并安全入库”。不确定的题保留待审核。

批量流程不调用 OCR、大模型、分类、解题或 embedding API。下方旧工作台的 AI 解析是独立功能，批量导入不会触发。

## 处理规则

- 文件内容通过 PDF 签名检查；复用原上传接口及文件 SHA-256 去重。
- 浏览器使用现有 PDF.js 读取文本、渲染页面，复用题号定位、region 切题、跨页拼接和题图裁切。
- 通过现有单题保存接口创建或复用 `paper_questions`，不传 `replace`，不改写已存在的题。
- 在 `project-private` scope 下复用或创建 `source_documents`；同一份文件再次导入复用相同 paper/source。
- 使用既有 normalized_text v1 与 SHA-256，记录文字 exact duplicate 提示。文字相同不代表必要图形相同，也不代表可以跨 scope 合并。
- AUTO_READY 仅复用已有人工 READY 的同来源、同版本映射，并检查题目观察 hash、完整身份、原 PDF hash、题图字节 hash、Canonical 状态及私有 scope。
- 新的自动切题默认 NEEDS_REVIEW；单 region、有文字、有图片不能代替 2E 人工核对。多 region、跨页、图形依赖、文本不完整、来源或图片异常继续待审。
- 人工确认沿用 2E decision validator 与完整身份构造。完全相同的身份复用 Canonical，并保留实际来源的 occurrence/module_link；文字相同但必要图形不同继续待审。
- 数据库写入使用 D1 batch 事务，事务内再次核对题目和来源，冲突时回滚；已有 Canonical 内容和 revision 不覆盖。
- 无可定位文本层的 PDF 标为文件级 needs_review；无效 PDF 为文件级 failed。题目失败数与文件失败数分别显示。

## 数据结构与迁移

迁移为 `drizzle/0016_paper_import_batches.sql`，本机已在阶段 2A 备份成功后执行。不要再次手工执行同一迁移。

| 表 | 保存内容 |
| --- | --- |
| paper_import_batches | scope、状态、创建时间 |
| paper_import_files | 文件名和顺序、状态、paper/source 引用、错误 |
| paper_import_items | 题号、paper_question 引用、规范化文字/hash、状态、Canonical/重复候选引用、观察 hash、原因和人工 decision |

统计从批次明细计算，不建立任务队列。批次状态为 processing/completed/completed_with_errors/failed；题目状态为 NEW/DUPLICATE/NEEDS_REVIEW/FAILED。

## 已完成验证

2026-10-07 的页面实测：两份真实数学卷分别识别 19 题，现有双栏/跨页测试卷识别 5 题，共 43 题。结果为 NEW 0、DUPLICATE 10、NEEDS_REVIEW 33、题目 FAILED 0。真实库新增 paper_questions 19，新增 Canonical 0；没有替用户确认未审核题。

再次导入上述三份并添加无文本层和无效 PDF：仍是 43 题、10 道已关联重复、33 道待审；文字 exact duplicate 为 43。无文本层文件需审核，无效文件失败，其余文件完成。同一 PDF 的两次结果引用相同 paper/source/原题。

2026-10-08 完成最终核验：所有原业务行保留，原 24 道套卷题及 10 个 Canonical/revisions 未改写，35 个旧 R2 映射和 blob 字节未变，数据库 integrity_check 为 ok、外键错误 0。本次 7 项批次回归测试通过，涵盖人工新增、重复复用、并发相同身份计数、图形区别、scope/文件变化拒绝及事务回滚；此前套卷/Canonical 相关 44 项测试通过。类型检查通过，ESLint 无错误，保留 1 项原生缩略图 img 性能提示。

详细数据验收、逐 PDF 统计及页面截图位于项目根目录 `outputs`。阶段止于 3A，未进入 3B。
