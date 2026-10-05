"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Crop, ImagePlus, LoaderCircle, RotateCw, ScanText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/image-lightbox";
import { RecognitionStatus } from "@/components/recognition-status";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { chapterName, chaptersForStage, stageFromGrade, taxonomyForStage } from "@/lib/taxonomy";
import { normalizeClassificationTags, questionTypes, subjectForStage, taxonomyVersionForStage, type Classification, type EducationStage } from "@/lib/classification";

type Student = { id: number; name: string; grade: string };
type SimilarQuestion = { id: number; chapterName: string; similarity: number };
type ReasoningEffort = "low" | "medium";
type AnalysisState = "" | "preparing" | "uploading" | "uploaded" | "preprocessing" | "cache_check" | "recognizing" | "validating" | "reviewing";
type StreamEvent =
  | { type: "status"; state: AnalysisState; message: string }
  | { type: "complete"; classification: Classification; mode: "live" | "demo"; metrics: Record<string, number>; cacheHit: boolean }
  | { type: "error"; error: string; analysisId: string; retryable: boolean; clientRequestIdSent?: boolean; providerRequestId?: string; providerReferenceId?: string };

const emptyCrop = { top: 0, right: 0, bottom: 0, left: 0 };
const clock = () => globalThis.performance.now();

function presentAnalysisError(message: string, analysisId = "", providerRequestId = "", providerReferenceId = "", clientRequestIdSent = false, retryable = true) {
  const reference = providerReferenceId || message.match(/internal error;\s*reference\s*=\s*([a-z0-9_-]+)/i)?.[1];
  const supportIds = [reference && `服务错误参考号 ${reference}`, providerRequestId && `供应商请求 ID ${providerRequestId}`, analysisId && `本地系统追踪号 ${analysisId}`].filter(Boolean).join("；");
  const safeMessage = reference ? "AI 识别服务返回了内部错误。" : message;
  const recovery = retryable ? "图片和已填写内容已保留，可以稍后重试。" : "图片和已填写内容已保留；请先检查服务密钥、模型权限或接口配置，也可以人工完成分类。";
  const referenceHelp = reference && !providerRequestId
    ? `服务错误参考号不是用量日志的请求 ID。${clientRequestIdSent ? "本次本地追踪号已通过 X-Client-Request-Id 随请求发送；若代理记录自定义请求头，可尝试按该号查询。" : "本地系统追踪号只用于应用日志，不是供应商请求 ID。"}`
    : "";
  return `${safeMessage}${supportIds ? `（${supportIds}）` : ""}${recovery}${referenceHelp}`;
}

function emptyDraft(stage: EducationStage): Classification {
  const chapter = chaptersForStage(stage)[0];
  return {
    schema_version: "1.0", taxonomy_version: taxonomyVersionForStage(stage), subject: subjectForStage(stage), education_stage: stage,
    extracted_question: "[以原题图片为准]", chapter: { code: chapter[0], name: chapter[1] }, knowledge_points: [], methods: [], question_type: "直接计算",
    difficulty: "基础", confidence: 0, needs_review: true, review_reasons: [], classification_notes: "",
  };
}

async function canvasBlob(canvas: HTMLCanvasElement, quality = 0.92) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("图片处理失败。")), "image/jpeg", quality));
}

async function preprocessForRecognition(original: File) {
  const started = performance.now();
  const bitmap = await createImageBitmap(original);
  try {
    const sampleScale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const sample = document.createElement("canvas");
    sample.width = Math.max(1, Math.round(bitmap.width * sampleScale));
    sample.height = Math.max(1, Math.round(bitmap.height * sampleScale));
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    if (!sampleContext) throw new Error("当前浏览器无法处理图片。");
    sampleContext.drawImage(bitmap, 0, 0, sample.width, sample.height);
    const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
    const rowActive = (y: number) => {
      let dark = 0;
      for (let x = 0; x < sample.width; x += 2) {
        const index = (y * sample.width + x) * 4;
        if (pixels[index] < 242 || pixels[index + 1] < 242 || pixels[index + 2] < 242) dark += 1;
      }
      return dark >= Math.max(2, sample.width * 0.004);
    };
    const columnActive = (x: number) => {
      let dark = 0;
      for (let y = 0; y < sample.height; y += 2) {
        const index = (y * sample.width + x) * 4;
        if (pixels[index] < 242 || pixels[index + 1] < 242 || pixels[index + 2] < 242) dark += 1;
      }
      return dark >= Math.max(2, sample.height * 0.004);
    };
    let top = 0; let bottom = sample.height - 1; let left = 0; let right = sample.width - 1;
    while (top < bottom && !rowActive(top)) top += 1;
    while (bottom > top && !rowActive(bottom)) bottom -= 1;
    while (left < right && !columnActive(left)) left += 1;
    while (right > left && !columnActive(right)) right -= 1;
    const margin = Math.max(8, Math.round(Math.min(sample.width, sample.height) * 0.02));
    top = Math.max(0, top - margin); bottom = Math.min(sample.height - 1, bottom + margin);
    left = Math.max(0, left - margin); right = Math.min(sample.width - 1, right + margin);
    const croppedRatio = 1 - ((right - left + 1) * (bottom - top + 1)) / (sample.width * sample.height);
    const shouldCrop = croppedRatio >= 0.04 && right > left && bottom > top;
    const sourceX = shouldCrop ? Math.round(left / sampleScale) : 0;
    const sourceY = shouldCrop ? Math.round(top / sampleScale) : 0;
    const sourceWidth = shouldCrop ? Math.min(bitmap.width - sourceX, Math.round((right - left + 1) / sampleScale)) : bitmap.width;
    const sourceHeight = shouldCrop ? Math.min(bitmap.height - sourceY, Math.round((bottom - top + 1) / sampleScale)) : bitmap.height;
    const aspect = Math.max(sourceWidth, sourceHeight) / Math.max(1, Math.min(sourceWidth, sourceHeight));
    const targetLong = aspect > 2.5 ? 3600 : 2600;
    const resizeScale = original.size > 3 * 1024 * 1024 || Math.max(sourceWidth, sourceHeight) > targetLong
      ? Math.min(1, targetLong / Math.max(sourceWidth, sourceHeight)) : 1;
    const needsConversion = !["image/jpeg", "image/png"].includes(original.type);
    if (!shouldCrop && resizeScale === 1 && !needsConversion) {
      return { file: original, milliseconds: performance.now() - started, changed: false, summary: `${bitmap.width}×${bitmap.height}，保留原质量` };
    }
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(sourceWidth * resizeScale));
    output.height = Math.max(1, Math.round(sourceHeight * resizeScale));
    const context = output.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片。");
    context.fillStyle = "white"; context.fillRect(0, 0, output.width, output.height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, output.width, output.height);
    const blob = await canvasBlob(output, 0.92);
    return {
      file: new File([blob], original.name.replace(/\.[^.]+$/, "") + "-analysis.jpg", { type: "image/jpeg" }),
      milliseconds: performance.now() - started,
      changed: true,
      summary: `${bitmap.width}×${bitmap.height} → ${output.width}×${output.height}${shouldCrop ? "，已裁除空白边缘" : ""}`,
    };
  } finally { bitmap.close(); }
}

export function UploadWorkflow() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]); const [studentId, setStudentId] = useState("");
  const [file, setFile] = useState<File | null>(null); const [analysisFile, setAnalysisFile] = useState<File | null>(null); const [preview, setPreview] = useState("");
  const [preprocessMs, setPreprocessMs] = useState(0); const [preprocessSummary, setPreprocessSummary] = useState("");
  const [ai, setAi] = useState<Classification | null>(null); const [confirmed, setConfirmed] = useState<Classification | null>(null);
  const [pointChapter, setPointChapter] = useState(""); const [effort, setEffort] = useState<ReasoningEffort>("low");
  const [analyzing, setAnalyzing] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [errorRetryable, setErrorRetryable] = useState(true); const [mode, setMode] = useState<"live" | "demo" | "">("");
  const [analysisState, setAnalysisState] = useState<AnalysisState>(""); const [statusMessage, setStatusMessage] = useState(""); const [analysisSeconds, setAnalysisSeconds] = useState(0);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null); const [cacheHit, setCacheHit] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false); const [processingImage, setProcessingImage] = useState(false);
  const [rotation, setRotation] = useState(0); const [crop, setCrop] = useState(emptyCrop);
  const analysisController = useRef<AbortController | null>(null); const requestVersion = useRef(0); const previewUrl = useRef("");
  const analysisReader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const activeAnalysisId = useRef("");
  const dirtyFields = useRef(new Set<keyof Classification>());

  useEffect(() => { fetch("/api/students", { cache: "no-store" }).then(r => r.json() as Promise<{ students?: Student[] }>).then(data => { setStudents(data.students || []); if (data.students?.length) setStudentId(String(data.students[0].id)); }).catch(() => setError("无法读取学生列表。")); }, []);
  useEffect(() => () => {
    requestVersion.current += 1;
    const analysisId = activeAnalysisId.current;
    if (analysisId) void fetch("/api/analyze/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId }), keepalive: true });
    void analysisReader.current?.cancel(); analysisController.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);
  useEffect(() => { if (!analyzing) return; const timer = window.setInterval(() => setAnalysisSeconds(value => value + 1), 1000); return () => window.clearInterval(timer); }, [analyzing]);

  const selectedStudent = students.find(student => String(student.id) === studentId);
  const selectedStage = stageFromGrade(selectedStudent?.grade);
  const stageChapters = chaptersForStage(confirmed?.education_stage || selectedStage);
  const stageTaxonomy = taxonomyForStage(confirmed?.education_stage || selectedStage);
  const activePointChapter = pointChapter || confirmed?.chapter.code || "";
  const availablePoints = useMemo(() => stageTaxonomy.filter(([code, , chapter]) => chapter !== "METHOD" && (chapter === activePointChapter || confirmed?.knowledge_points.some(point => point.code === code))), [activePointChapter, confirmed?.knowledge_points, stageTaxonomy]);
  const availableMethods = useMemo(() => stageTaxonomy.filter(([, , chapter]) => chapter === "METHOD"), [stageTaxonomy]);

  function requestServerCancellation() {
    const analysisId = activeAnalysisId.current;
    activeAnalysisId.current = "";
    if (analysisId) void fetch("/api/analyze/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId }), keepalive: true });
  }

  function cancelStaleRequest() {
    requestVersion.current += 1;
    requestServerCancellation();
    void analysisReader.current?.cancel(); analysisReader.current = null;
    analysisController.current?.abort();
    analysisController.current = null;
    setAnalyzing(false); setAnalysisState(""); setStatusMessage("");
  }

  function cancelActiveAnalysis() {
    requestVersion.current += 1;
    requestServerCancellation();
    void analysisReader.current?.cancel(); analysisReader.current = null;
    analysisController.current?.abort(); analysisController.current = null;
    setAnalyzing(false); setAnalysisState(""); setStatusMessage("");
    setErrorRetryable(false);
    setError("已取消本次识别，已填写内容和图片均已保留。");
  }

  async function chooseFile(next: File | null) {
    if (next && !["image/jpeg", "image/png", "image/webp"].includes(next.type)) { setError("请选择 JPG、PNG 或 WebP 图片；整卷 PDF 请使用套卷复习。"); return; }
    submissionId.current = crypto.randomUUID(); setDuplicates([]); setSimilarQuestions([]);
    cancelStaleRequest(); setSaving(false); setError(""); setAi(null); setMode(""); setMetrics(null); setCacheHit(false); dirtyFields.current.clear();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    if (!next) { previewUrl.current = ""; setPreview(""); setFile(null); setAnalysisFile(null); setConfirmed(null); return; }
    previewUrl.current = URL.createObjectURL(next); setPreview(previewUrl.current); setFile(next); setAnalysisFile(next);
    setConfirmed(emptyDraft(selectedStage)); setPointChapter(chaptersForStage(selectedStage)[0][0]);
    const version = requestVersion.current;
    setProcessingImage(true); setAnalysisState("preparing"); setStatusMessage("正在生成清晰的识别副本");
    try {
      const processed = await preprocessForRecognition(next);
      if (version !== requestVersion.current) return;
      setAnalysisFile(processed.file); setPreprocessMs(processed.milliseconds); setPreprocessSummary(processed.summary);
    } catch (reason) {
      if (version !== requestVersion.current) return;
      setAnalysisFile(next); setPreprocessMs(0); setPreprocessSummary("自动预处理不可用，将使用原图识别");
      setError(reason instanceof Error ? reason.message : "自动图片处理失败，将使用原图识别。");
    } finally { if (version === requestVersion.current) { setProcessingImage(false); setAnalysisState(""); setStatusMessage(""); } }
  }

  function changeStudent(nextId: string) {
    submissionId.current = crypto.randomUUID(); setDuplicates([]); setSimilarQuestions([]);
    cancelStaleRequest(); setProcessingImage(false); setSaving(false); setStudentId(nextId); setAi(null); setMode(""); setMetrics(null); dirtyFields.current.clear();
    const student = students.find(item => String(item.id) === nextId);
    const stage = stageFromGrade(student?.grade);
    if (file) { setConfirmed(emptyDraft(stage)); setPointChapter(chaptersForStage(stage)[0][0]); }
  }

  async function applyImageAdjustments() {
    if (!file) return;
    if (crop.left + crop.right >= 90 || crop.top + crop.bottom >= 90) { setError("裁剪范围过大，请保留题目主体。"); return; }
    cancelStaleRequest(); setProcessingImage(true); setError("");
    const version = requestVersion.current;
    const started = clock();
    try {
      const bitmap = await createImageBitmap(file);
      const sourceX = Math.round(bitmap.width * crop.left / 100); const sourceY = Math.round(bitmap.height * crop.top / 100);
      const sourceWidth = Math.max(1, Math.round(bitmap.width * (100 - crop.left - crop.right) / 100)); const sourceHeight = Math.max(1, Math.round(bitmap.height * (100 - crop.top - crop.bottom) / 100));
      const turns = ((rotation % 360) + 360) % 360; const sideways = turns === 90 || turns === 270;
      const canvas = document.createElement("canvas"); canvas.width = sideways ? sourceHeight : sourceWidth; canvas.height = sideways ? sourceWidth : sourceHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error("当前浏览器无法处理图片。");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(turns * Math.PI / 180);
      context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight); bitmap.close();
      const blob = await canvasBlob(canvas);
      if (version !== requestVersion.current) return;
      setAnalysisFile(new File([blob], file.name.replace(/\.[^.]+$/, "") + "-analysis.jpg", { type: "image/jpeg" }));
      setPreprocessMs(clock() - started); setPreprocessSummary(`${sourceWidth}×${sourceHeight} → ${canvas.width}×${canvas.height}，教师手动调整`);
      setAi(null); setMode(""); setMetrics(null); setRotation(0); setCrop(emptyCrop); setEditorOpen(false);
    } catch (reason) { if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "图片处理失败。"); }
    finally { if (version === requestVersion.current) setProcessingImage(false); }
  }

  function mergeAiResult(result: Classification) {
    result = normalizeClassificationTags(result);
    const fields: Array<keyof Classification> = ["extracted_question", "chapter", "knowledge_points", "methods", "question_type", "difficulty", "classification_notes"];
    setConfirmed(current => {
      const next = current ? { ...current } : emptyDraft(result.education_stage);
      for (const field of fields) if (!dirtyFields.current.has(field)) (next as unknown as Record<string, unknown>)[field] = structuredClone(result[field]);
      next.schema_version = result.schema_version; next.taxonomy_version = result.taxonomy_version; next.subject = result.subject; next.education_stage = result.education_stage;
      next.confidence = result.confidence; next.needs_review = result.needs_review; next.review_reasons = result.review_reasons; next.analysis_trace = result.analysis_trace;
      return next;
    });
    if (!dirtyFields.current.has("chapter")) setPointChapter(result.chapter.code);
  }

  async function analyze(useOriginal = false) {
    const upload = useOriginal ? file : analysisFile;
    if (!upload || !file || !studentId) { setError("请先选择学生和题目图片。"); return; }
    const version = requestVersion.current + 1; requestVersion.current = version;
    setAnalyzing(true); setAnalysisSeconds(0); setAnalysisState("uploading"); setStatusMessage("正在上传识别副本"); setError(""); setErrorRetryable(true); setAi(null); setMetrics(null); setCacheHit(false);
    const controller = new AbortController(); analysisController.current = controller;
    let failureAnalysisId = "";
    let failureProviderRequestId = "";
    let failureProviderReferenceId = "";
    let failureClientRequestIdSent = false;
    let failureRetryable = true;
    const clientStarted = clock();
    try {
      const form = new FormData(); form.append("image", upload); form.append("educationStage", selectedStage); form.append("reasoningEffort", effort); form.append("clientPreprocessMs", String(useOriginal ? 0 : preprocessMs));
      const response = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal });
      if (!response.ok || !response.body) { const data = await response.json() as { error?: string; retryable?: boolean; duplicates?: {id:number;chapterName:string}[] }; failureRetryable = data.retryable ?? false; throw new Error(data.error || "识别失败。"); }
      activeAnalysisId.current = response.headers.get("X-Analysis-Id") || "";
      const reader = response.body.getReader(); analysisReader.current = reader; const decoder = new TextDecoder(); let buffered = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n"); buffered = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim() || version !== requestVersion.current) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "status") { setAnalysisState(event.state); setStatusMessage(event.message); }
          else if (event.type === "error") { failureAnalysisId = event.analysisId; failureProviderRequestId = event.providerRequestId || ""; failureProviderReferenceId = event.providerReferenceId || ""; failureClientRequestIdSent = event.clientRequestIdSent === true; failureRetryable = event.retryable; throw new Error(event.error); }
          else {
            const finalMetrics = { ...event.metrics, client_total_to_editable: Math.round((clock() - clientStarted) * 10) / 10 };
            const normalized = normalizeClassificationTags(event.classification);
            setAi(normalized); mergeAiResult(normalized); setMode(event.mode); setMetrics(finalMetrics); setCacheHit(event.cacheHit);
          }
        }
      }
    } catch (reason) {
      if (version === requestVersion.current) {
        const cancelled = reason instanceof DOMException && reason.name === "AbortError";
        setErrorRetryable(cancelled ? false : failureRetryable);
        setError(cancelled ? "已取消本次识别，已填写内容和图片均已保留。" : presentAnalysisError(reason instanceof Error ? reason.message : "识别请求未能完成，请检查网络后重试。", failureAnalysisId, failureProviderRequestId, failureProviderReferenceId, failureClientRequestIdSent, failureRetryable));
      }
    } finally {
      if (version === requestVersion.current) { activeAnalysisId.current = ""; analysisReader.current = null; analysisController.current = null; setAnalyzing(false); setAnalysisState(""); setStatusMessage(""); }
    }
  }

  function patch(values: Partial<Classification>) {
    for (const key of Object.keys(values) as Array<keyof Classification>) dirtyFields.current.add(key);
    setConfirmed(current => current ? { ...current, ...values } : current);
  }
  function changeChapter(code: string) { if (!confirmed) return; setPointChapter(code); patch({ chapter: { code, name: chapterName(code) } }); }
  function togglePoint(code: string, checked: boolean) {
    if (!confirmed) return; const item = stageTaxonomy.find(([pointCode]) => pointCode === code); if (!item) return;
    const next = checked ? [...confirmed.knowledge_points.filter(point => point.code !== code), { code: item[0], name: item[1] }] : confirmed.knowledge_points.filter(point => point.code !== code);
    if (next.length > 4) { setError("一道题最多选择 4 个核心知识点。"); return; } patch({ knowledge_points: next });
  }
  function toggleMethod(code: string) {
    if (!confirmed) return;
    const item = stageTaxonomy.find(([pointCode, , owner]) => pointCode === code && owner === "METHOD");
    if (!item) return;
    const checked = confirmed.methods.some(method => method.code === code);
    const next = checked ? confirmed.methods.filter(method => method.code !== code) : [...confirmed.methods, { code: item[0], name: item[1] }];
    if (next.length > 2) { setError("一道题最多选择 2 个数学思想或解题方法。"); return; }
    setError(""); patch({ methods: next });
  }

  const submissionId = useRef(crypto.randomUUID());
  const [duplicates, setDuplicates] = useState<{id:number;chapterName:string}[]>([]);
  const [similarQuestions, setSimilarQuestions] = useState<SimilarQuestion[]>([]);
  const [relationKind, setRelationKind] = useState("同类题");
  async function save(duplicateDecision = "", linkedQuestionId?: number, relatedKind?: string) {
    const version = requestVersion.current;
    if (!file || !confirmed || !studentId) return;
    if (!confirmed.knowledge_points.length) { setError("请至少选择一个知识点。"); return; }
    setSaving(true); setError("");
    try {
      const teacherFields = structuredClone(confirmed); delete teacherFields.analysis_trace;
      const form = new FormData(); form.append("image", file); form.append("studentId", studentId); if (ai) form.append("aiClassification", JSON.stringify(ai)); form.append("classificationSource", ai ? mode : "manual"); form.append("teacherConfirmedClassification", JSON.stringify({ ...teacherFields, needs_review: false, review_reasons: [] }));
      form.append("submissionId", submissionId.current); form.append("duplicateDecision", duplicateDecision); if (duplicateDecision === "link" && linkedQuestionId) form.append("linkedQuestionId", String(linkedQuestionId)); if (duplicateDecision === "similar" && linkedQuestionId) { form.append("relatedQuestionId", String(linkedQuestionId)); form.append("relationKind", relatedKind || relationKind); }
      const response = await fetch("/api/questions", { method: "POST", body: form }); const data = await response.json() as { error?: string; duplicates?: {id:number;chapterName:string}[]; similarQuestions?: SimilarQuestion[] };
      if (version !== requestVersion.current) return;
      if (data.duplicates) { setDuplicates(data.duplicates); setSimilarQuestions([]); setSaving(false); return; }
      if (data.similarQuestions) { setDuplicates([]); setSimilarQuestions(data.similarQuestions); setSaving(false); return; }
      if (!response.ok) throw new Error(data.error || "保存失败");
      router.push(`/students/${studentId}`); router.refresh();
    } catch (reason) { if (version === requestVersion.current) { setError(reason instanceof Error ? reason.message : "保存失败。"); setSaving(false); } }
  }

  const modelCalls = ai?.analysis_trace?.classification_attempts.length || 0;
  const currentStep = analyzing || processingImage ? 2 : ai ? 3 : 1;
  const steps = ["选择学生与图片", "AI 识别中", "教师确认分类"];
  return <div className="mx-auto max-w-[1480px] space-y-8">
    <div><p className="mb-2 text-xs font-semibold tracking-wider text-[var(--color-brand-primary)]">AI 结构化工作区</p><h1 className="font-semibold leading-[1.2] tracking-tight text-[var(--color-text-primary)] text-[32px]">上传、识别，再由教师确认</h1><p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">选择学生并上传题目图片，AI 会先给出分类建议，再由你完成最终确认。</p></div>

    <ol className="mx-auto grid max-w-5xl grid-cols-3" aria-label="题目录入进度">
      {steps.map((step, index) => { const number = index + 1; const done = currentStep > number; const active = currentStep === number; return <li key={step} className="relative flex flex-col items-center text-center before:absolute before:top-4 before:right-1/2 before:-z-0 before:h-px before:w-full before:bg-[var(--color-border-subtle)] first:before:hidden"><span className={cn("relative z-10 grid size-8 place-items-center rounded-full border text-sm font-bold transition-all duration-200", done ? "border-[var(--color-state-success)] bg-[var(--color-state-success)] text-white" : active ? "border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)] text-white shadow-[0_0_0_4px_rgb(25_93_122_/_0.12)]" : "border-[var(--color-border-subtle)] bg-white text-slate-500")}>{done ? <Check className="size-4" /> : number}</span><span className={cn("mt-2 text-xs sm:text-sm", active ? "font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]")}>{number}. {step}</span></li>; })}
    </ol>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="surface-card p-5 sm:p-8" style={{ animationDelay: "50ms" }}>
        <div className="mb-6"><h2 className="text-xl font-semibold text-[var(--color-text-primary)]">选择学生与图片</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">原图供教师查看，清晰副本用于识别</p></div>
        <div className="grid gap-5">
          <div className="grid gap-2"><Label htmlFor="student">归档到</Label><NativeSelect id="student" value={studentId} onChange={event => changeStudent(event.target.value)} className="w-full"><NativeSelectOption value="">请选择学生</NativeSelectOption>{students.map(student => <NativeSelectOption key={student.id} value={student.id}>{student.name} · {student.grade}</NativeSelectOption>)}</NativeSelect>{selectedStudent && <p className="text-sm text-slate-500">将使用{selectedStage}数学知识点目录</p>}</div>
          <label tabIndex={0} aria-label="上传题目图片：点击、拖放或粘贴截图" onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.querySelector<HTMLInputElement>('input[type="file"]')?.click(); } }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={event => { event.preventDefault(); void chooseFile(event.dataTransfer.files[0] || null); }} onPaste={event => { const image = Array.from(event.clipboardData.files).find(item => item.type.startsWith("image/")); if (image) { event.preventDefault(); void chooseFile(image); } }} className="upload-dot-grid group relative grid min-h-80 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--color-border-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 hover:border-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-soft)]">
            {preview ? <img src={preview} alt="待识别题目原图预览" className="h-full max-h-[480px] w-full bg-white/80 object-contain p-3" /> : <span className="px-6 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-[var(--color-brand-primary)] shadow-sm ring-1 ring-slate-900/5"><ImagePlus className="size-6" /></span><b className="mt-4 block font-semibold text-[var(--color-text-primary)]">点击选择或拖入题目图片</b><span className="mt-1 block text-sm text-[var(--color-text-secondary)]">支持 JPG、PNG 格式，选择后立即预览</span></span>}
            <Input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => void chooseFile(event.target.files?.[0] || null)} />
          </label>
          <p className="text-center text-xs text-slate-500">点击选择 · 拖入图片 · 聚焦上传区后 Ctrl / ⌘ + V 粘贴截图</p>
          {file && <div className="text-sm text-slate-500"><p className="truncate">原图：{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>{preprocessSummary && <p className="mt-1 text-terracotta-700">识别副本：{preprocessSummary}</p>}</div>}
          {file && <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogTrigger asChild><Button type="button" variant="outline"><Crop />旋转与裁剪识别副本</Button></DialogTrigger><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>调整识别副本</DialogTitle><DialogDescription>调整只影响 AI 输入，教师查看和最终存档仍保留原图。</DialogDescription></DialogHeader><div className="my-4 space-y-5"><div className="grid min-h-48 place-items-center overflow-hidden rounded-xl bg-slate-950 p-3">{preview && <img src={preview} alt="图片调整预览" className="max-h-72 max-w-full object-contain" style={{ transform: `rotate(${rotation}deg)` }} />}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setRotation(value => value - 90)}><RotateCw className="-scale-x-100" />向左旋转</Button><Button type="button" variant="outline" onClick={() => setRotation(value => value + 90)}><RotateCw />向右旋转</Button></div><div className="grid gap-4 sm:grid-cols-2">{([['top','上边'],['bottom','下边'],['left','左边'],['right','右边']] as const).map(([side, label]) => <label key={side} className="grid gap-2 text-sm text-slate-700"><span className="flex justify-between"><b>裁掉{label}</b><span>{crop[side]}%</span></span><input type="range" min="0" max="40" value={crop[side]} onChange={event => setCrop(current => ({ ...current, [side]: Number(event.target.value) }))} /></label>)}</div></div><DialogFooter><Button type="button" variant="outline" onClick={() => { setCrop(emptyCrop); setRotation(0); }}>重置</Button><Button type="button" onClick={() => void applyImageAdjustments()} disabled={processingImage}>{processingImage ? <><LoaderCircle className="animate-spin" />处理中…</> : "应用调整"}</Button></DialogFooter></DialogContent></Dialog>}
          <div className="grid gap-2"><Label htmlFor="effort">识别模式</Label><NativeSelect id="effort" value={effort} onChange={event => setEffort(event.target.value as ReasoningEffort)}><NativeSelectOption value="low">快速识别（默认）</NativeSelectOption><NativeSelectOption value="medium">深度识别（复杂题）</NativeSelectOption></NativeSelect></div>
          {(processingImage || analyzing) && <RecognitionStatus state={analysisState} message={statusMessage} seconds={analysisSeconds} analyzing={analyzing} onCancel={cancelActiveAnalysis} />}
          <Button size="lg" onClick={() => void analyze()} disabled={!analysisFile || !studentId || analyzing || processingImage}>{analyzing ? <><LoaderCircle className="animate-spin" />后台识别中…</> : <><ScanText />开始 AI 识别</>}</Button>
          {file && <Button type="button" variant="ghost" disabled={analyzing || processingImage} onClick={() => void analyze(true)}>识别不清时使用原图重新分析</Button>}
        </div>
      </section>

      <section className="surface-card p-5 sm:p-8" style={{ animationDelay: "100ms" }}>
        <div className="mb-6"><h2 className="text-xl font-semibold text-[var(--color-text-primary)]">教师确认分类</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">AI 只回填尚未被教师修改的字段</p></div>
        {error && <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span className="flex gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</span>{file && errorRetryable && <Button size="sm" variant="outline" onClick={() => void analyze()}>重试</Button>}</div>}
        {file && !ai && !analyzing && <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">AI 识别不可用时，可直接参照原图手动完成分类，再由教师确认归档。</p>}
        {!confirmed ? <div className="grid min-h-80 place-items-center rounded-2xl bg-slate-50/80 p-8 text-center ring-1 ring-inset ring-slate-900/[0.04]"><div><ImageLightbox src="/example-question.svg" alt="示例题目图片"><button type="button" className="mx-auto block w-fit rounded-lg bg-white p-2 ring-1 ring-slate-200 transition-colors hover:ring-terracotta-300" aria-label="预览示例题目图片"><img src="/example-question.svg" alt="示例题目缩略图" className="h-20 w-28 rounded-md object-cover" /></button></ImageLightbox><h3 className="mt-5 font-semibold text-[var(--color-text-primary)]">等待题目图片</h3><p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">上传一张题目图片，AI 将自动为您识别并分类。支持 JPG、PNG 与 WebP 格式。</p><div className="mt-6 grid grid-cols-2 gap-3 text-left">{["题干与题型", "章节与知识点", "难度与置信度", "可编辑分类建议"].map(label => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><div className="mt-2 h-1.5 w-2/3 rounded-full bg-slate-100" /></div>)}</div><ImageLightbox src="/example-question.svg" alt="示例题目图片"><button type="button" className="mt-3 text-sm font-semibold text-[var(--color-brand-primary)] hover:underline">查看示例图片</button></ImageLightbox></div></div> : <div className="space-y-7">
          <div className="flex flex-wrap items-center gap-2">{ai ? <><Badge className={mode === "live" ? "bg-terracotta-100 text-terracotta-800" : "bg-amber-100 text-amber-800"}>{cacheHit ? "缓存结果" : mode === "live" ? `AI 已分析 · ${modelCalls} 次调用` : "演示结果"}</Badge><span className="text-sm text-slate-500">置信度 {Math.round(ai.confidence * 100)}%</span></> : <Badge variant="outline">等待 AI，可先填写</Badge>}<Badge variant="outline">{confirmed.education_stage}数学</Badge>{ai?.needs_review && <Badge variant="outline" className="border-amber-300 text-amber-700">需要教师复核</Badge>}</div>
          {metrics && <div className="rounded-xl bg-terracotta-50 px-4 py-3 text-xs text-terracotta-900">可编辑结果用时 {(metrics.client_total_to_editable / 1000).toFixed(1)} 秒 · 模型完整响应 {metrics.model_complete ? (metrics.model_complete / 1000).toFixed(1) + " 秒" : "缓存命中"}{ai?.analysis_trace && ` · Token ${ai.analysis_trace.usage.total_tokens}`}</div>}
          {preview && <ImageLightbox src={preview} alt="题目原图"><button type="button" className="group block w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><img src={preview} alt="题目原图，点击放大" className="max-h-64 w-full object-contain transition group-hover:scale-[1.01]" /><span className="block border-t border-slate-200 bg-white px-4 py-2 text-center text-sm font-medium text-terracotta-600">点击放大查看原图</span></button></ImageLightbox>}
          <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>主章节</Label><NativeSelect value={confirmed.chapter.code} onChange={event => changeChapter(event.target.value)} className="w-full">{stageChapters.map(([code, name]) => <NativeSelectOption key={code} value={code}>{name}</NativeSelectOption>)}</NativeSelect></div><div className="grid gap-2"><Label>难度</Label><NativeSelect value={confirmed.difficulty} onChange={event => patch({ difficulty: event.target.value as Classification["difficulty"] })} className="w-full">{["基础", "中等", "较难"].map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div></div>
          <div className="grid gap-2"><Label>题型</Label><NativeSelect value={confirmed.question_type} onChange={event => patch({ question_type: event.target.value })} className="w-full">{questionTypes.map(item => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div>
          <div><div className="mb-2 flex items-center justify-between"><div><Label>知识点</Label><p className="mt-1 text-xs text-gray-500">作为题库统计与筛选的主要维度</p></div><span className="text-xs text-gray-400">已选 {confirmed.knowledge_points.length}/4</span></div><NativeSelect value={activePointChapter} onChange={event => setPointChapter(event.target.value)} className="mb-3 w-full">{stageChapters.map(([code, name]) => <NativeSelectOption key={code} value={code}>{name}</NativeSelectOption>)}</NativeSelect><div className="flex max-h-48 flex-wrap content-start gap-2 overflow-auto rounded-2xl bg-slate-50/80 p-3 ring-1 ring-inset ring-slate-900/[0.04]">{availablePoints.map(([code, name]) => { const checked = confirmed.knowledge_points.some(point => point.code === code); return <button type="button" aria-pressed={checked} key={code} onClick={() => togglePoint(code, !checked)} className={cn("rounded-full border px-3 py-2 text-sm transition-all duration-200", checked ? "border-terracotta-200 bg-terracotta-50 font-medium text-terracotta-600 shadow-sm" : "border-slate-200 bg-white text-gray-500 hover:border-terracotta-200 hover:text-terracotta-600")}>{name}</button>; })}</div></div>
          <div><div className="mb-2 flex items-center justify-between"><div><Label>数学思想与方法（可选）</Label><p className="mt-1 text-xs text-gray-500">与知识点平行保存，不参与知识点统计；可在题目详情中查看</p></div><span className="text-xs text-gray-400">已选 {confirmed.methods.length}/2</span></div><div className="flex max-h-40 flex-wrap content-start gap-2 overflow-auto rounded-2xl bg-violet-50/50 p-3 ring-1 ring-inset ring-violet-900/[0.06]">{availableMethods.map(([code, name]) => { const checked = confirmed.methods.some(method => method.code === code); return <button type="button" aria-pressed={checked} key={code} onClick={() => toggleMethod(code)} className={cn("rounded-full border px-3 py-2 text-sm transition-all duration-200", checked ? "border-violet-200 bg-white font-medium text-violet-700 shadow-sm" : "border-slate-200 bg-white text-gray-500 hover:border-violet-200 hover:text-violet-700")}>{name}</button>; })}</div></div>
          <div className="rounded-xl bg-slate-50 p-4"><Label>分类依据或教师备注</Label><Input value={confirmed.classification_notes} onChange={event => patch({ classification_notes: event.target.value })} className="mt-2 bg-white" /></div>
          {duplicates.length > 0 && <div className="rounded-xl border border-amber-200 p-3 text-sm"><p className="font-medium">发现相同原图，请教师确认是否为再次提问。</p><div className="mt-2 flex flex-wrap gap-2">{duplicates.map(q => <Button key={q.id} disabled={saving} variant="outline" onClick={() => void save("link", q.id)}>关联题目 #{q.id} · {q.chapterName}</Button>)}<Button disabled={saving} variant="outline" onClick={() => void save("new")}>作为新题保存</Button><Button disabled={saving} variant="outline" onClick={() => void save("later")}>暂不关联并归档</Button></div></div>}
          {similarQuestions.length > 0 && <div className="space-y-3 rounded-xl border border-terracotta-200 bg-terracotta-50/60 p-4 text-sm"><div><p className="font-medium text-terracotta-950">发现题干相近的候选题</p><p className="mt-1 text-terracotta-800">候选依据题干文本相似度及章节、知识点线索生成；相似不代表同一道题，只有你确认后才会建立关联。</p></div><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><NativeSelect aria-label="相似题关联类型" value={relationKind} onChange={event => setRelationKind(event.target.value)}><NativeSelectOption value="同类题">同类题</NativeSelectOption><NativeSelectOption value="变式题">变式题</NativeSelectOption><NativeSelectOption value="相似错误原因">相似错误原因</NativeSelectOption></NativeSelect><Button variant="outline" disabled={saving} onClick={() => void save("new")}>不关联，独立保存</Button></div><div className="space-y-2">{similarQuestions.map(q => <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-terracotta-100 bg-white p-3"><span>题目 #{q.id} · {q.chapterName} · 候选匹配分 {q.similarity}/100</span><Button disabled={saving} variant="outline" onClick={() => void save("similar", q.id, relationKind)}>保存新题并建立关联</Button></div>)}</div></div>}
          <Button size="lg" onClick={() => void save()} disabled={saving || analyzing || !confirmed.knowledge_points.length} className="w-full">{saving ? <><LoaderCircle className="animate-spin" />正在保存…</> : <><Check />{ai ? "确认并存入题库" : "人工确认并存入题库"}</>}</Button>
        </div>}
      </section>
    </div>
  </div>;
}
