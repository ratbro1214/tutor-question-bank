export type StemTerm = {
  id: string; word: string; pattern: string; category: string;
  meaning: string; confusion: string; strategy: string;
};

// These explanations describe exam instructions, not the words being tested inside quotes.
export const stemTerms: StemTerm[] = [
  { id: 'suggest-inference', word: 'suggest', pattern: 'suggest(?:s|ed|ing)?', category: '推断', meaning: '暗示；表明', confusion: '看到 suggest 不要一律译为“建议”。段落、事实或研究作主语时，常是在问它说明什么。', strategy: '结合指定段落的事实，找有依据的含义；不要凭空联想。' },
  { id: 'suggest-advice', word: 'suggest', pattern: 'suggest(?:s|ed|ing)?', category: '建议', meaning: '建议；提议', confusion: '人物提出做法时仍可表示“建议”，不能把题干中的 suggest 全部记成“暗示”。', strategy: '找出这个人建议采取的行动，核对动作及对象。' },
  { id: 'infer', word: 'infer', pattern: 'infer(?:red|ring|s)?', category: '推断', meaning: '推断；推知', confusion: 'infer 是读者根据线索推断；imply 是作者或文字暗示。', strategy: '先找事实，再作有限推断；答案必须有文本依据。' },
  { id: 'imply', word: 'imply', pattern: '(?:imply|implies|implied|implying)', category: '推断', meaning: '暗示；言外之意是', confusion: '作者没有直说，也可能通过语气、对比或事例表达。', strategy: '读懂前后关系，判断作者间接表达的意思。' },
  { id: 'indicate', word: 'indicate', pattern: 'indicat(?:e|es|ed|ing)', category: '推断', meaning: '表明；显示', confusion: '这里通常不是“指路”，而是证据显示的结果。', strategy: '把数据、现象与其说明的结论对应。' },
  { id: 'conclude', word: 'conclude', pattern: 'conclud(?:e|es|ed|ing)', category: '推断', meaning: '得出结论', confusion: 'be concluded about 是“关于……能得出什么结论”，不是“结束”。', strategy: '综合相关信息，选择证据能支持的结论。' },
  { id: 'purpose', word: 'purpose', pattern: 'purpose', category: '意图', meaning: '目的；意图', confusion: '问“为什么写/提到”，不能只回答“写了什么”。', strategy: '检查事例或段落在论述中的作用：说明、举例、对比等。' },
  { id: 'mention', word: 'mention', pattern: 'mention(?:s|ed|ing)?', category: '意图', meaning: '提到；提及', confusion: 'Why mention / purpose in mentioning 问提及某事的作用；people mentioned 则问被提到的人。', strategy: '先看疑问词：Why 问作用，Who/What 通常定位具体信息。' },
  { id: 'attitude', word: 'attitude', pattern: 'attitude', category: '态度', meaning: '态度；看法', confusion: '作者态度不等于文中引用人物的态度。', strategy: '找到作者自己的评价词和语气，再判断支持、质疑或中立。' },
  { id: 'mainly', word: 'mainly', pattern: 'mainly', category: '主旨', meaning: '主要地；主要关于', confusion: '不能用一个局部细节代替整段或全文中心。', strategy: '注意题干范围是 paragraph 还是 text，概括对应范围。' },
  { id: 'title', word: 'title', pattern: 'title', category: '主旨', meaning: '标题', confusion: '标题要覆盖主题，不能只贴合一个例子。', strategy: '比较标题与全文话题、核心观点和范围是否一致。' },
  { id: 'suitable', word: 'suitable', pattern: 'suitable', category: '主旨', meaning: '合适的；恰当的', confusion: 'suitable title 表示“合适的标题”。', strategy: '兼顾准确、范围适当与概括性。' },
  { id: 'best-describes', word: 'best describe', pattern: 'best\\s+describ(?:e|es)', category: '描述', meaning: '最恰当地描述', confusion: 'best 强调比较选项，部分符合不一定最恰当。', strategy: '综合对象的特征，避免以偏概全。' },
  { id: 'describe', word: 'describe', pattern: 'describ(?:e|es|ed|ing)', category: '描述', meaning: '描述；刻画', confusion: '描述题关注题干指定对象的特征。', strategy: '定位对象，核对选项描述与文章是否一致。' },
  { id: 'refer-to', word: 'refer to', pattern: 'refer(?:s|red|ring)?\\s+to', category: '词义与指代', meaning: '指的是；指代', confusion: '在代词题里不是“参考”，而是问该词对应什么。', strategy: '回到原句和前文寻找指代对象，代入核对语义。' },
  { id: 'mean', word: 'mean', pattern: 'mean(?:s)?', category: '词义与指代', meaning: '意思是；意为', confusion: '问指定词句在本文中的含义，而非所有字典义。', strategy: '利用上下文、转折、解释或例子推测，再代入检验。' },
  { id: 'underlined', word: 'underlined', pattern: 'underlined', category: '定位', meaning: '画下划线的', confusion: '用于指定被考查的词或短语，不是词义提示。', strategy: '先定位题干指定词，再读它所在句的上下文。' },
  { id: 'phrase', word: 'phrase', pattern: 'phrase', category: '词义与指代', meaning: '短语；词组', confusion: '短语含义未必是逐词翻译的总和。', strategy: '把整个词组作为单位，结合语境理解。' },
  { id: 'according-to', word: 'according to', pattern: 'according\\s+to', category: '定位', meaning: '根据；按照', confusion: '指定信息来源，不能用自己的常识替代。', strategy: '只根据指定人物、段落或全文提供的信息判断。' },
  { id: 'following', word: 'the following', pattern: 'the\\s+following', category: '读题', meaning: '下列（选项）', confusion: '不是“接下来的故事”，而是指下面列出的内容。', strategy: '逐项核对选项，并留意 best、not、except 等限制。' },
  { id: 'paragraph', word: 'paragraph', pattern: 'paragraph(?:s)?', category: '定位', meaning: '段落', confusion: 'paragraph 2 与 the last paragraph 指定不同的证据范围。', strategy: '先定位指定段，再根据题型判断是否需联系上下文。' },
  { id: 'probably', word: 'probably', pattern: 'probably', category: '推断', meaning: '很可能；大概', confusion: '允许合理推测，但不等于随意猜测。', strategy: '比较文本支持程度，避免超出原文的绝对结论。' },
  { id: 'concern', word: 'concerning', pattern: 'concerning', category: '读题', meaning: '关于；涉及', confusion: '题干中的 concerning 可用作介词，不一定表示“令人担忧的”。', strategy: '把 concerning 后面的内容视为题目限定的话题。' },
  { id: 'except', word: 'except / NOT', pattern: '(?:except|not)', category: '读题', meaning: '除……之外／不', confusion: '否定或排除题要求选择不符合条件的项。', strategy: '先标记否定范围，再分别核对选项。' },
];

export type StemMatch = StemTerm & { start: number; end: number; matched: string; needsContext: boolean };

export function extractStemTerms(stem: string): StemMatch[] {
  // Quoted words are the object of a vocabulary question, not instruction words.
  const quoted: [number, number][] = [];
  for (const match of stem.matchAll(/[“"][^”"]*[”"]|(?<![a-zA-Z])['‘][^'’]*['’](?![a-zA-Z])/g)) quoted.push([match.index!, match.index! + match[0].length]);
  const matches: StemMatch[] = [];
  const suggestion = /\bsuggest(?:s|ed|ing)?\b/i.test(stem);
  const textualSubject = /\b(?:paragraph|text|passage|evidence|result|results|study|studies|finding|findings|data)\b[^?]*\bsuggest/i.test(stem);
  const actionRequest = /\bsuggest(?:s|ed)?\s+(?:\w+\s+){0,3}do\b/i.test(stem);
  // Where a stem alone is ambiguous, keep both senses for the student to compare.
  const sense = !suggestion ? null : textualSubject ? 'inference' : actionRequest ? 'advice' : 'both';
  for (const term of stemTerms) {
    if (term.id.startsWith('suggest-') && sense !== 'both' && term.id !== `suggest-${sense}`) continue;
    for (const match of stem.matchAll(new RegExp(`\\b(?:${term.pattern})\\b`, 'gi'))) {
      const start = match.index!, end = start + match[0].length;
      if (quoted.some(([a, b]) => start >= a && end <= b)) continue;
      if (term.id === 'describe' && matches.some(m => m.id === 'best-describes' && start >= m.start && end <= m.end)) continue;
      matches.push({ ...term, start, end, matched: match[0], needsContext: term.id.startsWith('suggest-') && sense === 'both' });
    }
  }
  return matches.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export type StemExample = {
  paperId: string; year: number; volume: string; title: string; passage: string;
  questionId: string; number: number; stem: string; artifactId: string; sourceLocators: string[];
  matches: StemMatch[];
};
