import type { EducationStage } from "@/lib/classification";
import { seniorChapters, seniorTaxonomy } from "@/lib/senior-taxonomy";

export const juniorChapters = [
  ["NUM-RATIONAL", "有理数"], ["ALG-EXPRESSION", "整式与因式分解"], ["ALG-FRACTION", "分式"], ["ALG-RADICAL", "二次根式"],
  ["EQ-LINEAR", "一元一次方程"], ["EQ-SYSTEM", "二元一次方程组"], ["INEQ", "不等式与不等式组"], ["EQ-QUADRATIC", "一元二次方程"],
  ["COORDINATE", "平面直角坐标系"], ["FUNC-CONCEPT", "函数基础"], ["FUNC-LINEAR", "一次函数"], ["FUNC-INVERSE", "反比例函数"],
  ["FUNC-QUADRATIC", "二次函数"], ["GEO-BASIC", "几何图形基础"], ["GEO-TRIANGLE", "三角形"], ["GEO-QUADRILATERAL", "四边形"],
  ["GEO-SIMILARITY", "图形相似"], ["GEO-CIRCLE", "圆"], ["GEO-TRANSFORM", "图形变换"], ["GEO-TRIG", "锐角三角函数"],
  ["GEO-PROJECTION", "投影与视图"], ["STAT-DATA", "数据的收集与整理"], ["STAT-DESCRIPTIVE", "数据分析"], ["PROBABILITY", "概率"],
] as const;

export const juniorTaxonomy = [
  ["NUM-RATIONAL-CONCEPT", "有理数的概念与分类", "NUM-RATIONAL"], ["NUM-NUMBER-LINE", "数轴、相反数与绝对值", "NUM-RATIONAL"], ["NUM-RATIONAL-OPS", "有理数运算", "NUM-RATIONAL"], ["NUM-SCI-NOTATION", "科学记数法与近似数", "NUM-RATIONAL"],
  ["ALG-MONOMIAL-POLYNOMIAL", "单项式与多项式", "ALG-EXPRESSION"], ["ALG-EXPR-OPS", "整式加减", "ALG-EXPRESSION"], ["ALG-MULTIPLY", "整式乘法", "ALG-EXPRESSION"], ["ALG-FORMULA", "乘法公式", "ALG-EXPRESSION"], ["ALG-FACTOR", "因式分解", "ALG-EXPRESSION"],
  ["ALG-FRACTION-CONCEPT", "分式的概念与基本性质", "ALG-FRACTION"], ["ALG-FRACTION-OPS", "分式运算", "ALG-FRACTION"], ["ALG-FRACTION-EQ", "分式方程", "ALG-FRACTION"],
  ["ALG-RADICAL-CONCEPT", "二次根式的概念与性质", "ALG-RADICAL"], ["ALG-RADICAL-SIMPLIFY", "二次根式化简与运算", "ALG-RADICAL"],
  ["EQ-LINEAR-SOLVE", "解一元一次方程", "EQ-LINEAR"], ["EQ-LINEAR-APPLICATION", "一元一次方程应用", "EQ-LINEAR"], ["EQ-SYSTEM-SOLVE", "解二元一次方程组", "EQ-SYSTEM"], ["EQ-SYSTEM-APPLICATION", "二元一次方程组应用", "EQ-SYSTEM"],
  ["INEQ-PROPERTY", "不等式的性质", "INEQ"], ["INEQ-LINEAR-SOLVE", "解一元一次不等式", "INEQ"], ["INEQ-SYSTEM-SOLVE", "解一元一次不等式组", "INEQ"], ["INEQ-APPLICATION", "不等式应用", "INEQ"],
  ["EQ-QUADRATIC-SOLVE", "一元二次方程的解法", "EQ-QUADRATIC"], ["EQ-QUADRATIC-DISCRIMINANT", "根的判别式", "EQ-QUADRATIC"], ["EQ-QUADRATIC-VIETA", "根与系数的关系", "EQ-QUADRATIC"], ["EQ-QUADRATIC-APPLICATION", "一元二次方程应用", "EQ-QUADRATIC"],
  ["COORDINATE-POINT", "点的坐标与象限", "COORDINATE"], ["COORDINATE-TRANSFORM", "坐标与图形变换", "COORDINATE"], ["COORDINATE-DISTANCE", "坐标中的距离与面积", "COORDINATE"],
  ["FUNC-VARIABLE", "变量与函数", "FUNC-CONCEPT"], ["FUNC-DOMAIN", "自变量取值范围", "FUNC-CONCEPT"], ["FUNC-REPRESENTATION", "函数的表示方法", "FUNC-CONCEPT"],
  ["FUNC-PROPORTIONAL", "正比例函数", "FUNC-LINEAR"], ["FUNC-LINEAR-EXPR", "一次函数解析式", "FUNC-LINEAR"], ["FUNC-LINEAR-GRAPH", "一次函数图像与性质", "FUNC-LINEAR"], ["FUNC-LINEAR-APPLICATION", "一次函数应用", "FUNC-LINEAR"], ["FUNC-LINEAR-EQ-RELATION", "一次函数与方程、不等式", "FUNC-LINEAR"],
  ["FUNC-INVERSE-EXPR", "反比例函数解析式", "FUNC-INVERSE"], ["FUNC-INVERSE-GRAPH", "反比例函数图像与性质", "FUNC-INVERSE"], ["FUNC-INVERSE-APPLICATION", "反比例函数应用", "FUNC-INVERSE"],
  ["FUNC-QUADRATIC-EXPR", "二次函数解析式", "FUNC-QUADRATIC"], ["FUNC-QUADRATIC-GRAPH", "二次函数图像与性质", "FUNC-QUADRATIC"], ["FUNC-QUADRATIC-TRANSFORM", "二次函数图像变换", "FUNC-QUADRATIC"], ["FUNC-QUADRATIC-ROOTS", "二次函数与一元二次方程", "FUNC-QUADRATIC"], ["FUNC-QUADRATIC-EXTREMUM", "二次函数最值", "FUNC-QUADRATIC"], ["FUNC-QUADRATIC-APPLICATION", "二次函数应用", "FUNC-QUADRATIC"],
  ["GEO-LINE-RAY-SEGMENT", "直线、射线与线段", "GEO-BASIC"], ["GEO-ANGLE", "角及角的计算", "GEO-BASIC"], ["GEO-PARALLEL", "平行线的性质与判定", "GEO-BASIC"], ["GEO-PROPOSITION", "命题、定理与证明", "GEO-BASIC"],
  ["GEO-TRIANGLE-PROPERTY", "三角形边角关系", "GEO-TRIANGLE"], ["GEO-CONGRUENCE", "全等三角形", "GEO-TRIANGLE"], ["GEO-ISOSCELES", "等腰三角形", "GEO-TRIANGLE"], ["GEO-RIGHT-TRIANGLE", "直角三角形", "GEO-TRIANGLE"], ["GEO-PYTHAGOREAN", "勾股定理", "GEO-TRIANGLE"], ["GEO-MIDLINE", "三角形中位线", "GEO-TRIANGLE"],
  ["GEO-PARALLELOGRAM", "平行四边形", "GEO-QUADRILATERAL"], ["GEO-RECTANGLE", "矩形", "GEO-QUADRILATERAL"], ["GEO-RHOMBUS", "菱形", "GEO-QUADRILATERAL"], ["GEO-SQUARE", "正方形", "GEO-QUADRILATERAL"], ["GEO-QUAD-COMPREHENSIVE", "特殊四边形综合", "GEO-QUADRILATERAL"],
  ["GEO-RATIO-SEGMENT", "成比例线段", "GEO-SIMILARITY"], ["GEO-SIMILAR-TRIANGLE", "相似三角形的判定与性质", "GEO-SIMILARITY"], ["GEO-SIMILAR-APPLICATION", "相似三角形应用", "GEO-SIMILARITY"], ["GEO-SCALE", "位似", "GEO-SIMILARITY"],
  ["GEO-CIRCLE-CONCEPT", "圆的基本概念与性质", "GEO-CIRCLE"], ["GEO-CIRCLE-ANGLE", "圆心角与圆周角", "GEO-CIRCLE"], ["GEO-CIRCLE-POSITION", "点、直线与圆的位置关系", "GEO-CIRCLE"], ["GEO-CIRCLE-TANGENT", "切线的性质与判定", "GEO-CIRCLE"], ["GEO-CIRCLE-LENGTH-AREA", "弧长、扇形与圆锥计算", "GEO-CIRCLE"],
  ["GEO-AXIAL-SYMMETRY", "轴对称", "GEO-TRANSFORM"], ["GEO-TRANSLATION", "平移", "GEO-TRANSFORM"], ["GEO-ROTATION", "旋转与中心对称", "GEO-TRANSFORM"], ["GEO-TRANSFORM-COMPREHENSIVE", "图形变换综合", "GEO-TRANSFORM"],
  ["GEO-TRIG-CONCEPT", "锐角三角函数", "GEO-TRIG"], ["GEO-TRIG-SPECIAL", "特殊角三角函数值", "GEO-TRIG"], ["GEO-TRIG-SOLVE", "解直角三角形", "GEO-TRIG"], ["GEO-TRIG-APPLICATION", "锐角三角函数应用", "GEO-TRIG"], ["GEO-THREE-VIEWS", "三视图", "GEO-PROJECTION"], ["GEO-PROJECTION-BASIC", "投影基础", "GEO-PROJECTION"],
  ["STAT-SURVEY", "调查方式与抽样", "STAT-DATA"], ["STAT-TABLE", "频数分布表", "STAT-DATA"], ["STAT-CHART", "统计图的选择与分析", "STAT-DATA"], ["STAT-CENTER", "平均数、中位数与众数", "STAT-DESCRIPTIVE"], ["STAT-VARIATION", "方差与数据波动", "STAT-DESCRIPTIVE"], ["STAT-ESTIMATION", "用样本估计总体", "STAT-DESCRIPTIVE"],
  ["PROB-EVENT", "随机事件与概率", "PROBABILITY"], ["PROB-ENUMERATION", "列举法求概率", "PROBABILITY"], ["PROB-TREE", "列表法与树状图法", "PROBABILITY"], ["PROB-FREQUENCY", "用频率估计概率", "PROBABILITY"],
] as const;

/**
 * 思想方法与内容知识点平行存储，但不参与知识点频次统计。
 * 保留 FUNC-COEFF-METHOD 这个历史代码，以兼容已经归档的题目。
 */
export const methodTaxonomy = [
  ["METHOD-CLASSIFICATION", "分类讨论思想", "METHOD"],
  ["METHOD-NUMBER-SHAPE", "数形结合思想", "METHOD"],
  ["METHOD-EQUATION", "方程思想", "METHOD"],
  ["METHOD-FUNCTION", "函数思想", "METHOD"],
  ["METHOD-TRANSFORMATION", "转化与化归思想", "METHOD"],
  ["METHOD-MODELING", "数学建模思想", "METHOD"],
  ["METHOD-FROM-SPECIAL", "特殊与一般思想", "METHOD"],
  ["METHOD-WHOLE", "整体思想", "METHOD"],
  ["METHOD-FINITE-INFINITE", "有限与无限思想", "METHOD"],
  ["METHOD-CONSTRUCTION", "构造法与辅助构造", "METHOD"],
  ["METHOD-SUBSTITUTION", "换元法", "METHOD"],
  ["FUNC-COEFF-METHOD", "待定系数法", "METHOD"],
  ["METHOD-COMPLETING-SQUARE", "配方法", "METHOD"],
  ["METHOD-ELIMINATION", "消元法", "METHOD"],
  ["METHOD-PARAMETER-SEPARATION", "分离参数法", "METHOD"],
  ["METHOD-CONTRADICTION", "反证法", "METHOD"],
  ["METHOD-INDUCTION", "数学归纳法", "METHOD"],
  ["METHOD-ENUMERATION", "枚举、列表与树状图法", "METHOD"],
] as const;

export const chapters = [...juniorChapters, ...seniorChapters] as const;
export const taxonomy = [...juniorTaxonomy, ...seniorTaxonomy] as const;

export function chaptersForStage(stage: EducationStage) {
  return stage === "高中" ? seniorChapters : juniorChapters;
}

export function taxonomyForStage(stage: EducationStage) {
  return stage === "高中" ? [...seniorTaxonomy, ...methodTaxonomy] : [...juniorTaxonomy, ...methodTaxonomy];
}

export function isMethodCode(stage: EducationStage, code: string) {
  return taxonomyForStage(stage).some(([itemCode, , owner]) => itemCode === code && owner === "METHOD");
}

export function chapterName(code: string) {
  return chapters.find(([itemCode]) => itemCode === code)?.[1] ?? code;
}

export function taxonomyPromptForStage(stage: EducationStage) {
  return taxonomyForStage(stage).map(([code, name, chapter]) => `${code}|${name}|${chapter}`).join("\n");
}

export function taxonomyHierarchyPromptForStage(stage: EducationStage) {
  const taxonomy = taxonomyForStage(stage);
  const content = chaptersForStage(stage).map(([chapterCode, chapterName]) => {
    const points = taxonomy
      .filter(([, , owner]) => owner === chapterCode)
      .map(([code, name]) => `  - ${code}|${name}`)
      .join("\n");
    return `${chapterCode}|${chapterName}\n${points}`;
  }).join("\n\n");
  const methods = taxonomy
    .filter(([, , owner]) => owner === "METHOD")
    .map(([code, name]) => `- ${code}|${name}`)
    .join("\n");
  return `主章节及其内容知识点：\n${content}\n\n通用解题方法（只能放入 method_codes）：\n${methods}`;
}

export function stageFromGrade(grade?: string): EducationStage {
  return grade?.includes("高") ? "高中" : "初中";
}
