# Canonical Identity 人工审核规则与 Decision Schema（阶段 2E-2）

版本：`canonical-identity-review-v1`。本阶段仅定义格式与纯代码校验，不审核真实 24 道题，不保存决定到数据库，不执行 migration。校验入口：`lib/canonical-identity-decision.mjs` 的 `validateCanonicalIdentityDecision(decision)`，返回 `{valid, errors:[{path,code,message}]}`，不修改输入、不推导状态、不访问数据库/R2/网络、不调用 AI。

## 状态定义

| 人工身份状态 | 固定含义 |
|---|---|
| NEEDS_REVIEW | 现有证据不能确认完整身份，需要人工判断。multiple_regions、possible_cross_page、未知选项或小问都只是审核线索，不是缺失证明。 |
| READY | 人工明确确认题干、适用公式/符号/条件、选项、小问、必要图像、所有 regions、跨页拼接完整，来源可追溯且 scope 明确。仅表示内容身份稳定完整，不表示公开、可合并或可立即写入数据库。 |
| INCOMPLETE | 人工明确确认题干、条件、公式、选项、小问、图形、region、跨页内容至少一项缺失，或现有数据无法恢复完整题目。程序未知、缺少检出标记、引用异常或 source_confirmed=false 单独都不能直接产生此状态。 |

此处是**人工 decision 状态规则**，不改变旧业务 ready/pending/failed，也不修改 2D 程序结构诊断状态。旧预览中的 INCOMPLETE 是程序缺字段警告，不得原样升级成人工结论；旧 DUPLICATE_CANDIDATE 也不是允许的人工 decision 状态。没有 decision 时，人工身份状态仍为 NEEDS_REVIEW。

## Decision 格式

每个决定是一个 JSON object；全部下列字段必填，只有 reviewer 可省略。不接受额外字段，以防拼写错误或静默解释变化。ID 是非空 TEXT 字符串，不强制 UUID，不改写旧 ID。

| 字段 | 格式/含义 |
|---|---|
| decision_version | 固定 `canonical-identity-review-v1` |
| decision_origin | 人工决定为 `human`；2E-3 未审核草稿允许 `pending_human`，不能伪装成人工结论 |
| paper_question_id / paper_id | 旧记录字符串 ID；本阶段不查数据库验证关联 |
| review_status | READY / NEEDS_REVIEW / INCOMPLETE |
| applicability | formula、options、subquestions、visual、cross_page 五项，值均为 true / false / unknown；由人工确认适用性 |
| review_context | multiple_regions、possible_cross_page，均为 true / false / unknown；后续审核须与实际记录对照，校验器不虚构或查询背景 |
| text_complete | 题干和文字条件是否完整 |
| formula_complete | 适用数学公式、符号和数学条件是否完整 |
| options_complete / subquestions_complete | 适用选项/所有小问是否完整 |
| visual_complete | 身份所需图形、图像、表格等是否完整；有 image_key 不自动说明本项适用 |
| regions_complete | 是否确认全部属于本题的 regions、内容覆盖及顺序 |
| cross_page_complete | 跨页续文及 region 拼接关系是否完整；同页多个 region 不自动表示跨页 |
| source_confirmed | 原试卷/来源可明确追溯并与当前题一致 |
| scope_decision | 见下节；不产生权限或 scope 数据库写入 |
| missing_reasons | 数组 `{code,detail}`；无明确缺失时 `[]` |
| review_notes | 字符串，可以为空；保存人工说明 |
| reviewed_at | human 决定明确填写有效 UTC ISO 时间，如 `2026-10-07T12:00:00Z` 或三位毫秒；pending_human 草稿必须为 null；不自动补时间 |
| reviewer | 可选非空字符串，仅是记录标识，不建立账号、不证明认证 |

八项 completeness 使用严格四态：JSON boolean `true`=人工确认完整；`false`=人工确认缺失；`unknown`=无法确认；`not_applicable`=人工确认本题不适用。字符串 `"true"`、`"false"`、null 和缺字段无效。unknown 永不转换为 false。

text_complete、regions_complete、source_confirmed 对套卷题始终适用，不能使用 not_applicable。其他 completeness 与 applicability 一一对应：适用=true 不得标 not_applicable；不适用=false 必须标 not_applicable；适用未知不能标 not_applicable。READY 时适用性必须明确，所有适用项必须 true。例如普通无图题可以 visual=false、visual_complete=not_applicable；选择题必须 options=true、options_complete=true。

## Scope decision

对象字段均需显式提供：

```json
{
  "status": "unknown",
  "scope_id": null,
  "scope_code": null,
  "scope_type": null,
  "kind": null,
  "ownership_status": null,
  "owner_principal_id": null,
  "decision_basis": "",
  "authorization_evidence": ""
}
```

status 只允许 unknown / confirmed。unknown 可保留候选信息，但不表示权限明确。confirmed 必须指定 scope_id 或 scope_code（可以是后续拟议引用，不保证数据库中存在）、scope_type、kind、ownership_status 和非空 decision_basis。

沿用现有 question_library_scopes：scope_type 为 authorized_public / teacher_private / student_private / legacy_private；authorized_public 必须 kind=shared，其余必须 private；ownership_status 为 known / legacy_unassigned。private+known 必须提供 owner_principal_id。**READY 额外要求私人归属 known 且 owner 明确**；允许暂存 legacy_unassigned 的待审核决定，不绕过现有 schema，不新增认证表。

authorized_public 的 confirmed 决定必须独立填写非空 authorization_evidence，记录人工核对的许可/授权依据；格式校验只能检查字段，不能证明许可真实性或给予发布授权。decision_basis 也不能以文字 hash 相同替代权属依据。

**内容相同 ≠ scope 相同。** 私人上传即使匹配公共题 hash，仍保留私人 scope 决定，不能自动变成公开题、跨私人 scope 合并或授予访问权。READY 是身份完整性决定，不是公开发布动作。校验器不接收 hash 作为权限参数。

## 校验硬规则

1. 严格检查版本、human 来源、ID、枚举、必填字段、额外字段和合法审核时间；不转换任何四态值。
2. READY：题干、regions、source_confirmed 必须 true；所有适用 completeness 必须 true；不得存在 false/unknown；适用性及多区域/跨页背景不得 unknown；scope 必须 confirmed，私人拥有者明确；missing_reasons 必须为空。
3. multiple_regions=true 不导致 INCOMPLETE；READY 必须 regions_complete=true，明确全部片段的归属/覆盖/顺序。同页多片段无需将 cross_page 伪装成适用。
4. possible_cross_page=true 必须 applicability.cross_page=true；READY 必须 cross_page_complete=true。没有跨页时，人工确认 cross_page=false、cross_page_complete=not_applicable。背景 false 仅描述记录，人工若发现实际有跨页，仍可将适用性设为 true。
5. INCOMPLETE：至少一项**内容** completeness=false，或至少一个有效 missing reason。source_confirmed=false、scope 未知或纯 unknown 都不能代替内容缺失证据。缺失原因 detail 必须描述明确事实；代码不能识别自然语言真伪，审核员负责事实真实性。
6. 缺失原因与对应字段 true/not_applicable 不得矛盾；适用性与 completeness 不得矛盾。NEEDS_REVIEW 允许 unknown，不自动升级或降级；仍须满足对象、字段与一致性约束。

missing reason code 固定为 text_missing、conditions_missing、formula_missing、options_missing、subquestions_missing、visual_missing、regions_missing、cross_page_missing、data_unrecoverable。可只用明确 false 支撑 INCOMPLETE，但建议同时记录具体原因；data_unrecoverable 允许其他项 unknown，必须描述无法恢复的事实。

## 示例与测试

`outputs/阶段2E-2-canonical-identity-decisions.example.json` 仅使用 `example:` 合成 ID，example_only=true；不是任何真实题目的审核结果。外层 schema_version / example_only / decisions 是示例文件包装，校验函数校验每个 decisions 元素，不接收整个包装。

```powershell
node --test tests/canonical-identity-decision.test.mjs
```

本阶段停止于规则、格式、示例和校验测试。后续执行前还须人工对照实际来源、适用性、regions 和 scope，决定如何保存与绑定数据版本；本格式通过校验不构成回填授权，也不解决内容修改后的审核失效问题。

## 2E-3 待审材料的最小兼容扩展

2E-2 最初要求每条记录有真实审核时间，与 2E-3「未审核不能伪造 reviewed_at」冲突。因此在同一 validation 内增加受限制的 pending_human 草稿分支，旧 human 格式及 READY / INCOMPLETE 规则保持有效。

草稿只能 NEEDS_REVIEW；reviewed_at 必须显式 null；不得填写 reviewer；八项 completeness 和五项 applicability 必须全部 unknown；scope.status=unknown；missing_reasons=[]。review_context 可保存实际 region 数量/页码的程序事实 true/false，但不能把这些事实当作人工完整性确认。跨页草稿允许 applicability.cross_page=unknown，人工填写后的 human 决定仍要求跨页核对适用且 READY 拼接完整。

材料中的 generated_at 仅记录生成时间，不是审核时间。实际人工决定填写完成后，decision_origin 改为 human，并填写真实审核时间；程序不自动完成这个转换。未审核时禁止自动填写 not_applicable。本扩展不批准任何题目、不保存数据库、不修改现有 scope 数据。
