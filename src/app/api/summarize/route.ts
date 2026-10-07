import { NextRequest, NextResponse } from "next/server";
import validator from "validator";

interface RecordValue {
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "An unexpected error occurred.";

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const url = isRecord(body) && typeof body.url === "string" ? body.url.trim() : "";

    if (!validator.isURL(url, {
      protocols: ["http", "https"],
      require_tld: true,
      require_protocol: true,
    })) {
      return NextResponse.json(
        { error: "A valid HTTP or HTTPS public URL is required." },
        { status: 400 }
      );
    }

    const jinaApiKey = process.env.JINA_API_KEY?.trim();
    const featherlessApiKey = process.env.FEATHERLESS_API_KEY?.trim();

    if (!jinaApiKey || !featherlessApiKey) {
      const missingKeys = [
        !jinaApiKey ? "JINA_API_KEY" : null,
        !featherlessApiKey ? "FEATHERLESS_API_KEY" : null,
      ].filter((key): key is string => key !== null);

      console.error(`Missing required environment variable(s): ${missingKeys.join(", ")}`);
      return NextResponse.json(
        { error: "Server AI credentials are not configured." },
        { status: 500 }
      );
    }

    let jinaResponse;
    const targetJinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    try {
      // 1. Fetch clean markdown content via Jina AI Reader (bypasses CORS & scraping blocks)
      jinaResponse = await fetch(targetJinaUrl, {
        headers: {
          "Accept": "text/plain",
          "Authorization": `Bearer ${jinaApiKey}`,
        },
        signal: AbortSignal.timeout(35000),
      });
      if (!jinaResponse.ok) throw new Error("Key failed or rate-limited");
    } catch {
      // Fallback to a completely unauthenticated request
      jinaResponse = await fetch(targetJinaUrl, {
        headers: {
          "Accept": "text/plain"
        }
      });
    }

    if (!jinaResponse.ok) {
      return NextResponse.json(
        { error: "Failed to scrape the target web page after fallback options." },
        { status: 502 }
      );
    }

    const rawContent = await jinaResponse.text();

    // 2. Truncate text for context window safety (~8000 characters)
    const truncatedContent = rawContent.slice(0, 8000);

    // 3. Prepare Featherless AI payload
    const systemPrompt = `You are an expert content summarizer for a developer/student dashboard.
Analyze the provided web text and return a valid, strictly formatted JSON object.

The JSON object MUST follow this exact schema:
{
  "title": "A clear, concise title of the article or page",
  "summary": [
    "First main key point or takeaway",
    "Second key point or takeaway",
    "Third key point or takeaway"
  ],
  "tags": ["Tag1", "Tag2", "Tag3"]
}

Important Rules:
- Return ONLY the JSON object. Do NOT wrap it in markdown code fences (\`\`\`json).
- Do NOT include any conversational introduction, explanation, or closing words.
- Provide exactly 3 bullet points in the summary array.
- Provide 2 to 4 relevant tags in the tags array.`;

    const featherlessResponse = await fetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${featherlessApiKey}`,
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `URL: ${url}\n\nContent:\n${truncatedContent}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!featherlessResponse.ok) {
      const errText = await featherlessResponse.text();
      console.error("Featherless API Error:", errText);
      return NextResponse.json(
        { error: "Featherless AI call failed." },
        { status: 502 }
      );
    }

    const aiResult: unknown = await featherlessResponse.json();
    const choices = isRecord(aiResult) && Array.isArray(aiResult.choices)
      ? aiResult.choices
      : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice) && isRecord(firstChoice.message)
      ? firstChoice.message
      : null;
    const rawAiOutput = message && typeof message.content === "string"
      ? message.content
      : "";

    // 4. Robust JSON Extraction Guard (handles accidental markdown wrappers or extra prose)
    const jsonMatch = rawAiOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Malformed AI Output:", rawAiOutput);
      return NextResponse.json(
        { error: "Failed to parse structured response from AI." },
        { status: 500 }
      );
    }

    const parsedData: unknown = JSON.parse(jsonMatch[0]);
    const parsedRecord = isRecord(parsedData) ? parsedData : {};
    const summary = Array.isArray(parsedRecord.summary)
      ? parsedRecord.summary.filter((point): point is string => typeof point === "string")
      : [];
    const tags = Array.isArray(parsedRecord.tags)
      ? parsedRecord.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

    // Return sanitized note payload to client
    return NextResponse.json({
      id: Date.now().toString(),
      url,
      title: typeof parsedRecord.title === "string" ? parsedRecord.title : "Untitled Document",
      summary: summary.length > 0 ? summary : [rawAiOutput.slice(0, 150)],
      tags: tags.length > 0 ? tags : ["General"],
      createdAt: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });

  } catch (error: unknown) {
    console.error("API Summarize Error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}