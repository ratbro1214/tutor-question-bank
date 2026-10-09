# 阶段 2D：套卷题 Canonical 只读映射规则

日期：2026-10-07。本阶段只处理 `papers` 和 `paper_questions` 的内容候选；其他表仅查询行数用于零写入核验。不处理学生学习关系、英语内容或 AI 解析迁移。

## 1. 使用与交付

```powershell
node scripts/preview-paper-canonical-mapping.mjs
# 保留旧报告并在另一个目录运行
node scripts/preview-paper-canonical-mapping.mjs --output-dir="E:\codex\毕设探索\outputs\paper-preview-rerun"
# 指定独立恢复副本；不需要启动项目
node scripts/preview-paper-canonical-mapping.mjs --project-root="E:\codex\毕设探索\work\restored-project" --output-dir="E:\codex\毕设探索\outputs\restored-paper-preview"
node --test tests/paper-canonical-preview.test.mjs
```

默认从本项目 `.wrangler/state/v3/d1` 找到唯一非 metadata SQLite；有多个时必须显式 `--db=<文件>`。所有 SQLite 连接是 `DatabaseSync({readOnly:true})`，所有执行语句通过单条 SELECT 白名单。没有 `.exec()`、数据库 `.run()`、DDL/DML、PRAGMA、AI 或网络调用。唯一写入是输出 JSON/Markdown 报告。不覆盖已有报告，不允许报告目录与数据库/R2、data/public、schema、备份目录重叠，拒绝符号链接路径；检测正在运行的数据服务并拒绝继续。

报告默认放外层 E 盘工作区：

- `E:/codex/毕设探索/outputs/阶段2D-paper-canonical-preview.json`
- `E:/codex/毕设探索/outputs/阶段2D-paper-canonical-preview.md`

Markdown 先展示总览、来源映射、逐题摘要和四类抽样完整路径，再列出全部题目详细文本/ID/警告。真实数据没有重复组时明确说明，不制造重复题，也不把合成测试当真实数据。

## 2. 当前数据质量

| 试卷 | 题数 |
|---|---:|
| 双栏与跨页验证卷 | 2 |
| 炎德·英才大联考湖南师大附中 2026 届高三月考试卷(二) | 19 |
| 雅礼中学月考 | 3 |
| 合计 | 24 |

24 道全部有题干、图片键、合法 classification 对象、有效 regions、解析；旧业务状态 ready=24，pending=0，failed=0，空题干=0。5 道存在多个 regions。只统计解析是否存在，不将解析正文转入任何候选。

预览状态 READY=0、NEEDS_REVIEW=24、INCOMPLETE=0、DUPLICATE_CANDIDATE=0。24 个非空文字 hash 都唯一，同卷/跨卷重复组均 0。

NEEDS_REVIEW 不等于数据损坏。每道题有原题图，但分类没有提供经确认的“无图形且全文完整”证据；即使 AI needs_review=false，也只代表原分类判断，不证明 OCR、裁切或题目内容完整。本阶段没有调用视觉模型或执行人工图像确认，因此保守要求复核。

## 3. normalized_text v1

`lib/paper-canonical-preview.mjs` 导出 `normalizeQuestionTextV1()`，规则版本 `math-paper-text-v1`：

1. CRLF/CR 统一为 LF。
2. 全角空格、NBSP、普通空白与版式换行合并为一个普通空格，trim 首尾。
3. 只删除文本最开头的明显题号，如 `17.`、`17．`、`17、`、`第17题：`；支持全角题号数字。传入原题号时，必须匹配才能删除。
4. 不删除 `3.14` 等小数前缀、不删除 `(1)` 等小问标签；去除题号之后再次 trim。

不执行 NFKC、语义改写、公式重排、数学符号统一、同义词替换或字面 `\\n` 解码。不删除正文数字、变量、条件、选项、指数/下标、负号、不等号、集合符号、分值说明、跨页续文。除明显开头题号外的所有数字均保留。`x² = 4y` 与 `x² = 8y` 不相等；`x²` 与 `x2` 不相等。

空格规则有意保守：`x = 4` 与 `x=4` 可能仍不同，不冒险去掉符号周围空格。矩阵、分段函数等版式可能承载语义，压平换行并不证明其语义完整；原文本与完整 regions 仍保留以供人工检查。

SHA-256 只对上述 UTF-8 normalized_text 计算。空题干 hash 为 NULL，不把一批空题归为重复组。hash 命中还比较规范文本，报告 `normalized_texts_equal`；即使一样也不合并。

特别注意：2C revision 的生产身份规则要求完整内容 payload；2D 按要求生成的是**文字候选 hash**。候选明确标记 `normalized_hash_kind=text_candidate_only`，revision 的 `full_content_identity_hash=null`、`insertable_without_review=false`，不能将本报告原封不动当成可执行导入数据。

## 4. 来源、版本、出现位置和旧模块映射

| 旧字段/信息 | 预览字段/处理 |
|---|---|
| papers.id | source_document.math_paper_id、legacy_source_key、source_paper_id；稳定 preview ID 的后缀 |
| papers.title / original_filename | 原样作为 title / original_filename |
| papers.source_key / file_hash | storage_key / file_hash 原样保留 |
| papers.source_type | 实际是 MIME，放 mime_type；新 source_type 固定 math_paper，file_storage=r2 |
| paper_questions.question_text | original_text 原样；normalized_text 与文字候选 SHA-256 按 v1 生成 |
| paper_questions.classification | JSON 解析后展示；education_stage 来自旧 AI 分类且注明未确认，不从试卷标题猜测 |
| paper_questions.id | module_record_id TEXT 原样保存，legacy_paper_question_id 同样原样 |
| paper_questions.question_number | 只放 source/occurrence/locator，不放 canonical 身份 |
| image_key / regions | 完整放 occurrence 与 revision.visual_refs；首页 page 仅为所有 regions 页码的最小值 |
| status、error、revision、updated_at | 作为旧状态/快照警告与 observed_source_hash 的依据，不冒充新版本审核事实 |
| explanation | 仅统计是否存在，不迁入 payload，不生成统一解析候选 |

三个 source document 的必需结构字段和 R2 键引用均存在；24 条 occurrence 与 module link 的结构映射完整。完整 regions 与稳定 `occurrence_key=paper_question:<旧ID>` 防止只用题号/首页丢失跨页定位。occurrence_hash 未计算，当前 R2 键存在不等于原件字节与 papers.file_hash 已核对。

scope 为 `migration-preview:paper-mapping`，kind=private、scope_type=legacy_private、owner=NULL、ownership_status=legacy_unassigned。它只是报告展示分组，不具备真实授权，不允许跨私人数据自动合并。source 许可、最终 owner/scope、真实 UUID、建立时间/审核者仍需确认。

所有 ID 使用 `preview:<类型>:<旧ID>` 的稳定标签，重复运行同一旧记录可获得相同展示 ID；不将 hash 当 canonical ID，不把这些标签直接登记为最终 UUID。同 hash 的旧记录继续拥有不同 proposed canonical ID。

## 5. 状态和合并安全

- INCOMPLETE：题干为空、来源缺失、题图/R2 键缺失、regions 无效或题号无效；保留诊断候选，但不可导入。
- NEEDS_REVIEW：缺分类、分类 JSON 无效、旧 pending/failed/error、图形提示、多区域/跨页、选择题选项疑似缺失或无法证实内容完整。
- READY：必要结构完整且无待核查警告；只表示未来创建新题候选的结构门槛，不代表安全合并。当前图像型历史数据都缺完整性确认，故没有 READY；未来人工复核结果的录入接口未实现。
- DUPLICATE_CANDIDATE：非 INCOMPLETE 的题目文字 hash 重复；保留 base_identity_status 和所有审核警告。INCOMPLETE 优先，不会因为文字重复被升级为可映射状态。

`exact_text_hash_match` 与 `safe_to_merge` 分开。当前 safe_to_merge 始终 false，不实现自动合并规则。重复组报告同时指出同卷重复、跨卷重复（两者可以同时发生）、成员题号/旧 ID/标题/文本预览与字面内容是否相同。

有图处理：题干或 existing extracted_question 中如图、图象、统计图等提示，分类几何/空间标签，以及多个 regions 均触发视觉复核。没有提示但仍有图片且缺少完整性证明，也触发复核；分类标签只用于保守提示，不据此断言真实图形存在。

合成测试演示同文字候选分别在两张试卷出现：预览保持独立 canonical；未来仅在人工确认同题、完整图形和授权后，才可以选择一个 approved canonical，保留多个不同 source_document/occurrence，并分别链接旧模块。真实数据没有这种重复样本。

## 6. 零写入验证与结果

每次运行前后记录：全部本地 D1 主文件与 WAL hash、旧表及六张新表行数、schema、papers/paper_questions 行内容、R2 映射记录/数量、R2 主文件/WAL 和全部二进制对象 hash。输入表以只读方式打开两次，不执行任何设置型 SQL。

SHM 是 SQLite 读协调的暂态文件，读连接也可能改变；明确不作为业务数据指纹。主 SQLite、已提交 WAL、对象映射和全部 R2 二进制均纳入严格比较，没有忽略任何 WAL。若文件增加/减少、hash/行数/schema/映射变化，脚本报错，不能输出成功报告。文件级漂移检查不是替代备份，本阶段不恢复或重写真实数据库。

真实运行结果：零写入核验 passed=true，旧业务表行数一致，六张新表均 0，R2 对象 35→35，D1 主文件/WAL 与 R2 指纹一致。没有执行 migration、回填、双写或修改 schema。

13 项相关测试通过，覆盖题号、空格/换行、小数、小问、数字/选项区别、数学符号、空题干、图片依赖、同卷/跨卷重复、三种旧 ID、非法数据、真实 CLI 逻辑在合成数据库/R2 上的零写入、报告覆盖/路径防护和静态无写入/网络调用检查。合成数据库只在 E 盘 work 中由测试建造，不接触真实业务表。

## 7. 人工复核重点及阶段 2E

最重要的三个问题：

1. 24 道图像型题目没有经过确认的全文/图形完整性记录；业务 ready 和 AI 分类 confidence 不能替代该记录。
2. 5 道多 regions 的跨页/多块题需要逐块核对，尤其公式、图形、续文与条件不能漏掉；最低完整性样本只是警告最多，当前没有真正空题干。
3. 最终 scope、来源许可/拥有者以及完整内容 hash 尚未确定。预览统一分组与文字 hash 都不能直接作为正式去重权限及身份依据。

建议阶段 2E 仍先只做**少量题目的人工复核清单与确认记录设计**：核对原图/多页裁切、题干/选项和最终私有 scope，确定必要图形纳入完整身份 payload 的方式。之后另行批准最小人工写入，不直接对 24 道进行回填，不开发批量导入、embedding 或相似题检索。
