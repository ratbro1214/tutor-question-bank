import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { quadraticEvaluationPack, quadraticCases, topicReference } from '../lib/quadratic-topic';

const output = fileURLToPath(new URL('../../outputs/quadratic-topic/', import.meta.url));
await mkdir(output, { recursive: true });
const pack = quadraticEvaluationPack();
await writeFile(resolve(output, 'development-pack.json'), JSON.stringify(pack, null, 2) + '\n');
await writeFile(resolve(output, '教师核对材料.md'), `# 二次函数参数专题：研发题集核对材料\n\n16道题均为研发自编，尚无独立教师标签，不用于宣称准确率或教学收益。方法评测时请只把盲评题目交给标注者；本文件含程序计算参考，不应作为盲评材料。\n\n关注：端点与严格性、全称与存在、顶点与区间、次数退化。全部分组留在开发集。\n\n${quadraticCases.map(row => `## ${row.id} ${row.title}\n\n${row.question}\n\n方法：${row.method}\n\n追问：${row.prompt}\n\n程序参考：${topicReference(row).summary}\n`).join('\n')}\n## 教师审阅建议\n\n逐题独立求解，检查题干、范围、端点开闭与适用方法，并记录审阅者和理由。有争议的题先复核；另收集有来源的题建立测试集，同源变式不能跨集。\n`);
console.log(JSON.stringify({ output, cases: pack.cases.length, independentLabels: false }));
