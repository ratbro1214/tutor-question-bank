import { env } from "cloudflare:workers";
import { classificationSchema, isClassification, type Classification } from "@/lib/classification";
import { taxonomyPrompt } from "@/lib/taxonomy";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function demoClassification(filename: string): Classification {
  return {
    schema_version: "1.0", taxonomy_version: "cn-junior-math-1.0", subject: "初中数学", education_stage: "初中",
    extracted_question: `演示模式：已收到图片“${filename}”，配置视觉模型密钥后将自动识别题目原文。`,
    chapter: { code: "FUNC-LINEAR", name: "一次函数" },
    knowledge_points: [{ code: "FUNC-LINEAR-EXPR", name: "一次函数解析式" }, { code: "FUNC-COEFF-METHOD", name: "待定系数法" }],
    question_type: "已知条件求解析式", difficulty: "基础", confidence: 0.35, needs_review: true,
    review_reasons: ["OTHER"], classification_notes: "当前未配置 OPENAI_API_KEY，请教师核对并修改演示分类。",
  };
}

function outputText(payload: any) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) for (const content of item.content ?? []) if (content.type === "output_text" && content.text) return content.text;
  return "";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) return Response.json({ error: "请选择题目图片。" }, { status: 400 });
    if (!image.type.startsWith("image/")) return Response.json({ error: "只支持图片文件。" }, { status: 400 });
    if (image.size > MAX_IMAGE_BYTES) return Response.json({ error: "图片不能超过 8 MB。" }, { status: 400 });
    if (!env.OPENAI_API_KEY) return Response.json({ classification: demoClassification(image.name), mode: "demo" });

    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const instructions = `你是家教题库的数学题分类器。忠实抄录图片中的题目，不可猜测缺失内容。只能从给定知识点表选择代码与名称；选择一个主章节和 1-4 个真正参与解题的知识点。学生上传题目不等于不会。图片模糊、裁切或分类不确定时 needs_review 必须为 true。\n\n知识点表（知识点代码|名称|章节代码）：\n${taxonomyPrompt}`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_VISION_MODEL || "gpt-4o-mini", instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: "识别并分类这道初中数学题。" }, { type: "input_image", image_url: `data:${image.type};base64,${base64}`, detail: "high" }] }],
        text: { format: { type: "json_schema", name: "tutor_math_classification", strict: true, schema: classificationSchema } },
        store: false,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI response error", response.status, detail.slice(0, 500));
      return Response.json({ error: "视觉识别暂时失败，请稍后重试。" }, { status: 502 });
    }
    const payload = await response.json();
    const classification = JSON.parse(outputText(payload));
    if (!isClassification(classification)) throw new Error("模型返回的分类结构无效。");
    return Response.json({ classification, mode: "live" });
  } catch (error) {
    console.error("Analyze error", error);
    return Response.json({ error: error instanceof Error ? error.message : "识别失败。" }, { status: 500 });
  }
}
