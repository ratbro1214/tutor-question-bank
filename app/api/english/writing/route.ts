import corpus from '@/data/english/writing-practice.json';
export async function GET() {
  const papers = [...corpus].sort((a,b) => b.year-a.year || a.volume.localeCompare(b.volume)).map(p => ({
    paperId: p.paperId, year: p.year, volume: p.volume, title: p.title, status: p.status,
    tasks: p.tasks.map(t => ({ id: t.id, type: t.type, label: t.label, title: t.title, score: t.score, wordCount: t.wordCount })),
  }));
  return Response.json({ papers });
}
