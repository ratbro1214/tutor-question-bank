import catalog from '../data/open-math/catalog.json';
import type { MethodContent } from './knowledge-graph';
export type OpenMathSource = { repository: string; url: string; license: string; commit: string; path: string; note: string; section?: string; line?: number };
export type OpenMathTopic = { id: string; name: string; stage: string; chapter: string; description: string; goals: string[]; assessment: string; gradeStart: number; gradeEnd: number; source: OpenMathSource };
export type OpenMathMethod = { id: string; topicIds: string[]; stage: string; chapter: string; content: MethodContent; source: OpenMathSource };
export type OpenMathCatalog = { version: string; notice: string; topics: OpenMathTopic[]; methods: OpenMathMethod[]; edges: { from: string; to: string; reason: string; strength: string; sourceUrl: string }[]; sources: { id: string; repo: string; url: string; commit: string; license: string; fetchedOn: string; fileCount: number }[]; omittedEdges: number };
// Local teaching annotations; the upstream snapshot and its attribution stay intact.
const thinking: Record<string, Partial<MethodContent>> = {
  '求根公式法': {
    signals: ['一元二次方程已经整理为一般式。', '不易直接因式分解，或需要统一求解程序。'],
    motivation: '二次项系数非零时，可用求根公式统一求解；在实数范围先判断判别式，再决定是否有实根。',
    formulas: ['\\[ax^2+bx+c=0,\\quad a\\ne0\\]', '\\[\\Delta=b^2-4ac,\\quad x=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}\\quad(\\Delta\\ge0)\\]'],
    knowledgePoints: ['一元二次方程', '判别式'], strategies: ['化归与转化'], problemTypes: ['一元二次方程求解'],
    efficiency: '步骤固定，适用面广；易分解的方程使用因式分解通常更快。', teachingValue: '体现从配方推导通用公式、再用通用程序求解的过程。',
  },
  '配方法解一元二次方程': {
    signals: ['需要将二次式化为完全平方。', '需要理解求根公式来源，或观察平方项与常数的关系。'],
    motivation: '把一次项吸收到完全平方中，便能将二次方程转化为平方等于常数的形式。',
    knowledgePoints: ['完全平方公式', '一元二次方程'], strategies: ['化归与转化'], problemTypes: ['一元二次方程求解'],
    efficiency: '通用但可能引入分数；一次项系数便于配方时较简洁。', teachingValue: '建立方程求解、求根公式与二次函数顶点式之间的联系。',
  },
  '提公因式与公式分解法': {
    signals: ['各项含有公因式。', '出现平方差或完全平方结构。', '方程能等价化为几个因式的乘积等于零。'],
    motivation: '先观察代数结构，把和差化为乘积；若用于解方程，再利用零乘积性质分别求解，并核对原方程。',
    knowledgePoints: ['因式分解', '零乘积性质'], strategies: ['化归与转化'], problemTypes: ['多项式分解', '可因式分解的方程求解'],
    efficiency: '结构清晰时计算简便；无法方便分解时可考虑其他方法。', teachingValue: '培养代数结构观察能力，理解等价转化与零乘积性质。',
  },
  '对数换底法': {
    signals: ['出现不同底数的对数，需要统一底数。', '对数乘积、商或比较问题存在可化简的结构。'],
    motivation: '底数不统一时，直接运算较困难。换成共同底数后，可利用分式约分和对数性质化简；比较大小时还需判断分母符号。',
    formulas: ['\\[\\log_a b=\\frac{\\ln b}{\\ln a}\\]', '\\(a>0,\\ a\\ne1,\\ b>0\\)'],
    knowledgePoints: ['对数的运算性质'], strategies: ['化归与转化'], problemTypes: ['对数表达式化简', '对数方程求解'],
    efficiency: '适合不同底数之间的转化；底数已经相同时，应先检查直接运用对数性质是否更简洁。',
    teachingValue: '引导学生从“底数不同”的障碍出发，理解统一运算基础的转化思路。',
  },
};
export const openMathCatalog: OpenMathCatalog = { ...catalog, methods: catalog.methods.map(m => ({ ...m, content: { ...m.content, ...thinking[m.content.name] } })) };
