import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPaperCanonicalPreview } from './preview-paper-canonical-mapping.mjs';

export const runPaperCanonicalReview = options => runPaperCanonicalPreview({ ...options, reportKind: 'human-review' });

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (const argument of process.argv.slice(2)) {
      const match = argument.match(/^--(db|project-root|output-dir)=(.+)$/);
      if (!match) throw Error('Usage: node scripts/report-paper-canonical-review.mjs [--db=<file>] [--project-root=<directory>] [--output-dir=<new directory>]');
      options[{ db: 'database', 'project-root': 'root', 'output-dir': 'outputDirectory' }[match[1]]] = match[2];
    }
    const { report, jsonFile, markdownFile } = await runPaperCanonicalReview(options);
    console.log(JSON.stringify({ summary: report.summary, zero_write: report.zero_write_verification.passed, jsonFile, markdownFile }, null, 2));
  } catch (error) { console.error('Review report FAILED: ' + error.message); process.exitCode = 1; }
}
