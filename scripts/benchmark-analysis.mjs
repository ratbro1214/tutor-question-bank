import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const baseUrl = process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:3000";
const effort = process.argv.includes("--medium") ? "medium" : "low";
const outputArg = process.argv.indexOf("--output");
const outputPath = outputArg >= 0 ? process.argv[outputArg + 1] : "";

const cases = [
  { id: "ordinary-text", stage: "初中", width: 1400, height: 900, expectedChapter: "EQ-LINEAR", expectedPoints: ["EQ-LINEAR-SOLVE"], lines: ["普通文字题", "解方程：3(x - 2) + 5 = 2x + 9。"] },
  { id: "complex-formula", stage: "高中", width: 1500, height: 1050, expectedChapter: "HS-DERIVATIVE", expectedPoints: ["HS-DERIVATIVE-CALC"], lines: ["复杂公式题", "已知 f(x) = (x² + 1) / √(x + 2)，", "求 f′(x)，并写出函数的定义域。"] },
  { id: "wide-screenshot", stage: "初中", width: 3200, height: 720, expectedChapter: "FUNC-QUADRATIC", expectedPoints: ["FUNC-QUADRATIC-EXTREMUM"], lines: ["横向长截图    已知抛物线 y = -x² + 4x + 5，求其顶点坐标及最大值。"] },
  { id: "phone-photo", stage: "初中", width: 1500, height: 2000, expectedChapter: "GEO-TRIANGLE", expectedPoints: ["GEO-PYTHAGOREAN"], photo: true, lines: ["手机拍摄题", "在 Rt△ABC 中，∠C = 90°，", "AC = 6，BC = 8，求 AB 的长。"] },
  { id: "multi-knowledge", stage: "高中", width: 1700, height: 1200, expectedChapter: "HS-DERIVATIVE", expectedPoints: ["HS-DERIVATIVE-MONOTONICITY", "HS-DERIVATIVE-EXTREMUM"], lines: ["多知识点综合题", "已知函数 f(x)=x³-3x²+ax。", "(1) 求 f(x) 的单调区间；", "(2) 若 f(x) 在 [0,2] 上的最大值为 2，求 a。"] },
  { id: "cropped-abnormal", stage: "高中", width: 1400, height: 700, expectedReview: true, lines: ["异常裁切样本", "已知函数 f(x)=sin(ωx+φ) 的部分图像如下，", "根据图中信息求…… [右侧图形与条件已被裁掉]"] },
];

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function fixtureSvg(item) {
  const lineHeight = item.height > 1500 ? 190 : item.height < 800 ? 120 : 155;
  const fontSize = item.width > 2500 ? 72 : item.height > 1500 ? 76 : 68;
  const text = item.lines.map((line, index) => `<text x="${Math.round(item.width * 0.08)}" y="${Math.round(item.height * 0.2) + index * lineHeight}" font-size="${fontSize}" font-family="Microsoft YaHei, SimSun, Arial" fill="#111827">${escapeXml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${item.width}" height="${item.height}"><rect width="100%" height="100%" fill="#ffffff"/><rect x="35" y="35" width="${item.width - 70}" height="${item.height - 70}" rx="20" fill="none" stroke="#e5e7eb" stroke-width="4"/>${text}</svg>`;
}

async function makeFixture(item, directory) {
  const target = join(directory, `${item.id}.jpg`);
  let pipeline = sharp(Buffer.from(fixtureSvg(item))).jpeg({ quality: 94, chromaSubsampling: "4:4:4" });
  if (item.photo) pipeline = pipeline.rotate(-1.8, { background: "#d1d5db" }).modulate({ brightness: 0.96, saturation: 0.85 }).sharpen();
  await pipeline.toFile(target);
  return target;
}

async function analyze(item, path) {
  const bytes = await sharp(path).toBuffer();
  const form = new FormData();
  form.append("image", new File([bytes], `${item.id}.jpg`, { type: "image/jpeg" }));
  form.append("educationStage", item.stage);
  form.append("reasoningEffort", effort);
  form.append("clientPreprocessMs", "0");
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST", body: form });
  if (!response.ok || !response.body) throw new Error(`${item.id}: HTTP ${response.status}`);
  const text = await response.text();
  const events = text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const failure = events.find(event => event.type === "error");
  if (failure) return {
    id: item.id, elapsed_ms: Math.round((performance.now() - started) * 10) / 10,
    server_metrics_ms: null, cache_hit: false, model_calls: 0, usage: null,
    actual: { error: failure.error, needs_review: true },
    expected: { chapter: item.expectedChapter, knowledge_points: item.expectedPoints, needs_review: item.expectedReview },
    correct: false,
  };
  const complete = events.find(event => event.type === "complete");
  if (!complete) throw new Error(`${item.id}: missing complete event`);
  const result = complete.classification;
  const pointCodes = result.knowledge_points.map(point => point.code);
  const chapterCorrect = item.expectedChapter ? result.chapter.code === item.expectedChapter : true;
  const pointsCorrect = item.expectedPoints ? item.expectedPoints.every(code => pointCodes.includes(code)) : true;
  const reviewCorrect = item.expectedReview ? result.needs_review === true : true;
  return {
    id: item.id,
    elapsed_ms: Math.round((performance.now() - started) * 10) / 10,
    server_metrics_ms: complete.metrics,
    cache_hit: complete.cacheHit,
    model_calls: result.analysis_trace?.classification_attempts.length || 0,
    usage: result.analysis_trace?.usage,
    actual: { chapter: result.chapter.code, knowledge_points: pointCodes, needs_review: result.needs_review },
    expected: { chapter: item.expectedChapter, knowledge_points: item.expectedPoints, needs_review: item.expectedReview },
    correct: chapterCorrect && pointsCorrect && reviewCorrect,
  };
}

function percentile(values, percent) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(percent * sorted.length) - 1)] || 0;
}

const fixturesOnly = process.argv.includes("--fixtures-only");
const fixtureDirectoryArg = process.argv.indexOf("--fixtures-dir");
const requestedFixtureDirectory = fixtureDirectoryArg >= 0 ? process.argv[fixtureDirectoryArg + 1] : "";
const directory = requestedFixtureDirectory ? join(process.cwd(), requestedFixtureDirectory) : await mkdtemp(join(tmpdir(), "tutor-math-benchmark-"));
if (requestedFixtureDirectory) await mkdir(directory, { recursive: true });
try {
  if (fixturesOnly) {
    for (const item of cases) await makeFixture(item, directory);
    process.stdout.write(JSON.stringify({ fixtures: directory, count: cases.length }) + "\n");
    process.exitCode = 0;
  } else {
  const results = [];
  for (const item of cases) results.push(await analyze(item, await makeFixture(item, directory)));
  const times = results.map(item => item.elapsed_ms);
  const report = {
    generated_at: new Date().toISOString(),
    dataset: "synthetic-reproducible-v1",
    effort,
    sample_count: results.length,
    summary: {
      average_ms: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length * 10) / 10,
      p50_ms: percentile(times, 0.5), p95_ms: percentile(times, 0.95),
      model_calls: results.reduce((sum, item) => sum + item.model_calls, 0),
      input_tokens: results.reduce((sum, item) => sum + (item.usage?.input_tokens || 0), 0),
      output_tokens: results.reduce((sum, item) => sum + (item.usage?.output_tokens || 0), 0),
      cached_tokens: results.reduce((sum, item) => sum + (item.usage?.cached_tokens || 0), 0),
      classification_pass_rate: results.filter(item => item.correct).length / results.length,
      teacher_review_rate: results.filter(item => item.actual.needs_review || !item.correct).length / results.length,
    },
    results,
  };
  const json = JSON.stringify(report, null, 2);
  if (outputPath) await writeFile(outputPath, json + "\n", "utf8");
  process.stdout.write(json + "\n");
  }
} finally {
  if (!requestedFixtureDirectory) await rm(directory, { recursive: true, force: true });
}
