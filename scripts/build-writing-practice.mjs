import { readFile, writeFile, mkdir } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('data/english/manifest.json', 'utf8'));
const pageRanges = {
  gaokao_en_2020_I: [9, 10], gaokao_en_2020_II: [10, 11, 12],
  gaokao_en_2021_I: [16, 17, 18], gaokao_en_2021_II: [10, 11],
  gaokao_en_2022_I: [8, 9], gaokao_en_2022_II: [5, 6],
  gaokao_en_2023_I: [6, 7], gaokao_en_2023_II: [9, 10],
  gaokao_en_2024_II: [8, 9], gaokao_en_2025_I: [7, 8], gaokao_en_2025_II: [9, 10, 11],
};
const topics = {
  2020: ['越野赛跑活动报道', '帮助 Bernard 卖爆米花'],
  2021: ['Youth 校报十周年投稿', '母亲节的早餐惊喜'],
  2022: ['邀请外教参加广播访谈', '鼓励 David 参加越野跑'],
  2023: ['就口语练习分组提出建议', '参加写作比赛的经历'],
  2024: ['分享公园美术课经历', '出租车司机 Gunter 的帮助'],
};
function clean(text) {
  return text.replace(/\r\n/g, '\n').replace(/<!--[^]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\/(?:p|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s*/gm, '').replace(/```(?:txt|text)?/g, '')
    .replace(/\*+/g, '').replace(/\\([_$])/g, '$1')
    .replace(/^.*(?:第\s*\d+\s*页\s*[/／（(]|英语试题第|高考直通车|海量高清试题|App生成|英语试题参考答案第).*$/gm, '')
    .replace(/^.*学科网.*$/gm, '')
    .replace(/^\s*\d{1,2}\s*$/gm, '').replace(/^\s*\|\s*[-:| ]+\s*$/gm, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/gm, '')
    .replace(/^[_＿\s]{4,}$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
const corrections = [
  { paperId: 'gaokao_en_2023_II', ocr: '假你为这样伴侣。外教？Ryan 准备将学生一样包件，两人包括，让大家课后练习口语，假你认为这样伴侣。外教？', transcription: '假定你是李华，外教 Ryan 准备将学生随机分为两人一组，让大家课后练习口语。你认为这样分组存在问题。请你给外教写一封邮件，内容包括：', artifactId: 'gaokao_en_2023_II_8dbfdcd5f2992dce' },
  { paperId: 'gaokao_en_2025_II', ocr: '46. 假足你是内容包括魏鹏李华，外教 Chris 上个月曾应写一篇介绍加拿大体育运动的文章。请洽 Chris 下一邮件，英文包括:', transcription: '46. 假定你是校英文报编辑李华，外教 Chris 上个月答应写一篇介绍加拿大体育运动的文章。请给 Chris 写一封邮件，内容包括:', artifactId: 'gaokao_en_2025_II_ea25f73e3961f03d' },
  { paperId: 'gaokao_en_2025_II', ocr: '(3) $\\because {AD} = 2\\left( {\\overrightarrow{AB} + {BD}}\\right)  = 1$', transcription: '', artifactId: 'gaokao_en_2025_II_ea25f73e3961f03d' },
  { paperId: 'gaokao_en_2025_II', ocr: '"What is your name?" in a question', transcription: '"What is your name?" is a question', artifactId: 'gaokao_en_2025_II_f1525be0cb35a6ba' },
  { paperId: 'gaokao_en_2025_II', ocr: 'Qianyu', transcription: 'Qiuyu', artifactId: 'gaokao_en_2025_II_f1525be0cb35a6ba' },
];
await mkdir('../work/english-writing', { recursive: true });
await mkdir('../outputs/english-exams/writing', { recursive: true });
const papers = [];
for (const p of manifest.papers) {
  const direct = p.artifacts.find(a => a.kind === 'paper' && /\.docx?$/.test(a.filename)) || (['gaokao_en_2021_I', 'gaokao_en_2024_I'].includes(p.id) ? p.artifacts.find(a => a.mime === 'application/pdf') : null);
  const images = p.artifacts.filter(a => a.kind === 'paper' && a.mime?.startsWith('image/'));
  let raw;
  if (direct) raw = await readFile(`../work/${p.year}-${p.volume}.md`, 'utf8');
  else raw = (await Promise.all(images.map(a => readFile(`../work/english-reading/${a.id}.md`, 'utf8')))).join('\n\n');
  let text = clean(raw);
  const applied = [];
  for (const c of corrections.filter(c => c.paperId === p.id)) {
    if (!text.includes(c.ocr)) throw Error(`Correction missing: ${c.ocr}`);
    text = text.replaceAll(c.ocr, c.transcription); applied.push({ ...c, method: 'original-image-transcription' });
  }
  // The original page for 2023 II has a prompt which the cached OCR omitted entirely.
  if (p.id === 'gaokao_en_2023_II' && !/第[三四]部分\s*写作/.test(text)) {
    const at = text.indexOf('Dear Ryan,');
    if (at < 0) throw Error('2023 II writing template missing');
    const prefix = '第四部分 写作（共两节，满分40分）\n\n第一节（满分15分）\n\n假定你是李华，外教 Ryan 准备将学生随机分为两人一组，让大家课后练习口语。你认为这样分组存在问题。请你给外教写一封邮件，内容包括：\n\n1. 说明问题；\n2. 提出建议。\n\n注意：\n1. 写作词数应为80个左右；\n2. 请按如下格式在答题卡的相应位置作答。\n\n';
    text = text.slice(0, at) + prefix + text.slice(at);
    applied.push({ paperId: p.id, artifactId: 'gaokao_en_2023_II_8dbfdcd5f2992dce', transcription: prefix, method: 'original-image-transcription', note: '恢复原图第9页漏识别的应用文题目' });
  }
  const start = text.search(/第[三四]部分\s*写作/);
  if (start < 0) throw Error(`Writing heading missing: ${p.id}`);
  let writing = text.slice(start);
  const end = writing.search(/参考答案|英语听力|202\d\s*年普通高等学校招生全国统一考试/);
  if (end >= 0) writing = writing.slice(0, end);
  const first = writing.search(/第一节/), second = writing.search(/第二节/);
  if (first < 0 || second < 0) throw Error(`Writing sections missing: ${p.id}`);
  let application = writing.slice(first, second).replace(/^第一节\s*[（(]满分\s*15\s*分[）)]/, '').trim();
  let continuation = writing.slice(second).replace(/^第二节\s*[（(]满分\s*25\s*分[）)]/, '').trim();
  if(p.id==='gaokao_en_2023_II' && !application.includes('Dear Ryan')) {
    application+='\n\nDear Ryan,\nI’m Li Hua from Class 3.\n\nYours sincerely,\nLi Hua';
    applied.push({artifactId:'gaokao_en_2023_II_8dbfdcd5f2992dce',method:'original-image-transcription',note:'恢复被OCR提前放到写作标题之前的邮件格式'});
  }
  if(p.id==='gaokao_en_2025_I' && !application.includes('Yours')) {
    application+='\n\nYours,\nLi Hua';
    applied.push({artifactId:'gaokao_en_2025_I_671f2f3ffdbbd93e',method:'original-image-transcription',note:'对照原图补回邮件结尾'});
  }
  if(p.id==='gaokao_en_2023_I') {
    const misplaced="A few weeks later, when I almost forgot the contest, there came the mews. I went to my teacher' office after the award presentation.";
    if(!continuation.includes(misplaced))throw Error('Misplaced 2023 I starters missing');
    continuation=continuation.replace(misplaced,'')+'\n\nA few weeks later, when I almost forgot the contest, there came the news.\nI went to my teacher’s office after the award presentation.';
    applied.push({artifactId:'gaokao_en_2023_I_08755c570737243d',method:'original-image-layout-recovery',note:'恢复被提前提取的两段开头语；原件mews规范为news，原件teacher’s保留所有格'});
  }
  const instruction = continuation.match(/阅读下面材料[\s\S]*?完整的短文[。.]?/);
  const notesAt = continuation.lastIndexOf('注意');
  if (!instruction || notesAt < 0) throw Error(`Continuation body missing: ${p.id}`);
  const material = continuation.slice(instruction.index + instruction[0].length, notesAt).trim();
  const notes = continuation.slice(notesAt);
  const format = notes.match(/相应位置作答[。.,，]?/);
  if (!format) throw Error(`Continuation format missing: ${p.id}`);
  const requirements = notes.slice(0, format.index + format[0].length).trim();
  const openingLines = notes.slice(format.index + format[0].length).replace(/(?<=appeared\.)\s*(?=The twins)/, '\n').split('\n').map(s => s.trim()).filter(Boolean).slice(0,2);
  if(openingLines.length!==2 || openingLines.some(line=>line.length<25))throw Error(`Two continuation starters required: ${p.id}`);
  const sourceArtifacts = direct?.mime === 'application/pdf' && p.id === 'gaokao_en_2024_I'
    ? [{ ...direct, page: 11 }]
    : pageRanges[p.id].map(n => ({ ...images[n - 1], page: n }));
  if (sourceArtifacts.some(a => !a.id)) throw Error(`Source pages missing: ${p.id}`);
  const titles = p.year === 2025 ? p.volume === 'I' ? ['选择英语报新栏目', '家庭聚会与哥哥的狗 Toby'] : ['询问加拿大体育稿件进展', '分享中文名字的文化含义'] : topics[p.year];
  papers.push({ paperId: p.id, year: p.year, volume: p.volume, title: p.title, status: 'EXTRACTED_PENDING_REVIEW',
    tasks: [{ id: `${p.id}_writing_application`, type: 'APPLICATION', label: '应用文写作', title: titles[0], score: 15, wordCount: 80, text: application },
      { id: `${p.id}_writing_continuation`, type: 'CONTINUATION', label: '读后续写', title: titles[1], score: 25, wordCount: 150, instruction: instruction[0], material, requirements, openingLines }],
    sources: sourceArtifacts.map(a => ({ artifactId: a.id, publicPath: a.publicPath, mime: a.mime, sourceUrl: a.sourceUrl, sourcePage: a.sourcePage, sourceName: a.sourceName, sha256: a.sha256, page: a.page })),
    corrections: applied,
  });
  await writeFile(`../work/english-writing/${p.paperId ?? p.id}.txt`, application + '\n\n' + continuation);
  console.log(p.id, application.length, material.length, JSON.stringify(openingLines));
}
await writeFile('../work/english-writing/writing-draft.json', JSON.stringify(papers, null, 2));
await writeFile('data/english/writing-practice.json', JSON.stringify(papers, null, 2));
await writeFile('../outputs/english-exams/writing/writing-practice.json', JSON.stringify(papers, null, 2));
