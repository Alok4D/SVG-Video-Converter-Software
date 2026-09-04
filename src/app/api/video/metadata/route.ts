import { NextRequest, NextResponse } from "next/server";

function extractSvgMetadata(presetName: string, svgCode: string) {
  const isPreset = presetName && presetName !== "Custom SVG";
  
  // 1. Extract <title> content
  const titleMatch = svgCode.match(/<title[^>]*>(.*?)<\/title>/i);
  const embeddedTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

  // 2. Extract text words from <text> elements
  const textMatches = Array.from(svgCode.matchAll(/<text[^>]*>(.*?)<\/text>/gi));
  const rawTexts = textMatches.map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  
  // Filter out pure numbers for title text description
  const nonNumericTexts = rawTexts.filter(t => !/^\d+(?:\s*\d+)*$/.test(t));
  const textWords = Array.from(new Set(rawTexts.join(" ").split(/[\s,._\-]+/))).filter(w => w.length > 2);

  // 3. Extract id and class words
  const idClassMatches = Array.from(svgCode.matchAll(/(?:id|class)=["']([^"']+)["']/gi));
  const idClassWords = idClassMatches.flatMap(m => m[1].split(/[\s,._\-]+/)).filter(w => w.length > 2 && !["svg", "viz", "url", "meet", "box", "width", "height", "fill", "stroke", "type", "name", "defs", "style", "viewbox"].includes(w.toLowerCase()));

  const allDetectedWords = Array.from(new Set([...textWords, ...idClassWords])).map(w => w.toLowerCase());
  const lowerCode = svgCode.toLowerCase();

  // Category Detection logic
  let category = "Vector Motion Graphic";
  let specificTitle = "";
  const keywordsSet = new Set<string>();

  // Check 1: Chart / Infographic / Performance / Comparison / Good Better Best
  if (
    allDetectedWords.some(w => ["good", "better", "best", "chart", "bar", "growth", "step", "infographic", "kpi", "sales", "analytics", "level", "performance"].includes(w)) ||
    lowerCode.includes("bar-group") || lowerCode.includes("risebar") || lowerCode.includes("grow") || lowerCode.includes("good")
  ) {
    category = "Infographic Chart & Performance";
    const textDesc = nonNumericTexts.length > 0 ? nonNumericTexts.slice(0, 3).join(" ") : "Performance Growth Chart";
    specificTitle = `${textDesc} Infographic Comparison Vector Motion Loop`;
    
    ["infographic", "performance curve", "growth chart", "comparison", "step by step", "business analytics", "data visualization", "vector motion", "corporate presentation", "progress tracking", "good better best", "visual overlay", "seamless loop", "chart animation", "kpi report", "financial growth"].forEach(k => keywordsSet.add(k));
  }
  // Check 2: World Map / Global Network / Data Arcs
  else if (
    allDetectedWords.some(w => ["world", "map", "globe", "land", "arc", "network", "connect", "global", "node", "satellite"].includes(w)) ||
    lowerCode.includes("world-land") || lowerCode.includes("flowarc")
  ) {
    category = "World Map & Global Connectivity";
    specificTitle = "Global Network World Map Data Transmission Vector Animation Loop";
    
    ["world map", "global network", "data transmission", "connectivity", "internet nodes", "technology grid", "global communications", "digital network", "telecommunication", "international data", "world map loop", "glowing arcs", "vector motion"].forEach(k => keywordsSet.add(k));
  }
  // Check 3: Cyberpunk / HUD / Sci-Fi Portal
  else if (
    allDetectedWords.some(w => ["cyber", "hud", "sci-fi", "portal", "matrix", "tech", "futuristic"].includes(w)) ||
    lowerCode.includes("cyber") || lowerCode.includes("hud")
  ) {
    category = "Cyberpunk HUD Portal";
    specificTitle = "Cyberpunk HUD Interface Portal Neon Sci-Fi Core Motion Loop";
    
    ["cyberpunk", "hud interface", "sci-fi portal", "tech grid", "neon core", "futuristic ui", "virtual reality", "cyberspace", "digital portal", "neon glow", "technology background"].forEach(k => keywordsSet.add(k));
  }
  // Check 4: Loading Spinner / Progress Bar
  else if (
    allDetectedWords.some(w => ["spinner", "loader", "loading", "progress", "wait"].includes(w)) ||
    lowerCode.includes("spinner")
  ) {
    category = "Loading Spinner";
    specificTitle = "Futuristic Neon Loading Spinner Progress Indicator Motion Loop";
    
    ["loading spinner", "progress bar", "ui loader", "waiting screen", "rotating circle", "glowing loader", "user interface", "loading animation", "seamless loop", "green screen loader"].forEach(k => keywordsSet.add(k));
  }
  // Check 5: Signal Wave / Audio Frequency
  else if (
    allDetectedWords.some(w => ["signal", "wave", "frequency", "audio", "pulse", "beacon"].includes(w)) ||
    lowerCode.includes("signal")
  ) {
    category = "Signal Wave";
    specificTitle = "Signal Wave Animated Frequency Neon Pulse Vector Motion Loop";
    
    ["signal wave", "frequency", "pulse animation", "soundwave", "digital signal", "vector wave", "glowing pulse", "neon wave", "audio visualizer", "telecom signal"].forEach(k => keywordsSet.add(k));
  }

  // Base fallback title if not matched above
  if (!specificTitle) {
    const mainSubject = embeddedTitle || (isPreset ? presetName : "Abstract Vector Graphic");
    specificTitle = `${mainSubject} Loop, Modern Stock Vector Motion Graphic`;
  }

  // Add words found in SVG text tags directly to keywords!
  rawTexts.forEach(t => {
    if (t.length >= 2 && t.length <= 25) {
      keywordsSet.add(t.toLowerCase());
    }
  });

  // Always add general stock video keywords
  ["svg animation", "vector motion", "motion graphics", "stock footage", "abstract loop", "seamless loop", "background overlay", "graphic design", "digital art", "video animation", "web design", "modern aesthetic", "clean vector"].forEach(k => keywordsSet.add(k));

  const finalTitle = specificTitle.slice(0, 70);
  const finalKeywords = Array.from(keywordsSet).slice(0, 35).join(", ");

  return {
    title: finalTitle,
    keywords: finalKeywords
  };
}

import fs from "fs";
import path from "path";

function getEnvKey(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (match) return match[1].trim();
    }
  } catch (e) {}
  return "";
}

export async function POST(request: NextRequest) {
  let presetName = "Custom SVG";
  let svgCode = "";

  try {
    const body = await request.json();
    presetName = body.presetName || "Custom SVG";
    svgCode = body.svgCode || "";
  } catch (e) {}

  try {
    const grokKey = getEnvKey("GROK_API_KEY");
    const openaiKey = getEnvKey("OPENAI_API_KEY");
    const geminiKey = getEnvKey("GEMINI_API_KEY");

    const systemPrompt = `You are a Senior Adobe Stock Video SEO Specialist and Keywording Expert.
Analyze the following SVG animation code and preset name to generate 100% compliant, high-ranking Adobe Stock metadata.

INPUT DETAILS:
Preset Name: ${presetName}
SVG Code:
${svgCode.slice(0, 3000)}

ADOBE STOCK TITLE RULES:
1. Concise, factual, and buyer-targeted title (Strictly 50 - 70 characters).
2. Start directly with the main visual subject (e.g. "Good Better Best Infographic Chart Loop", "World Map Global Network Data Transmission").
3. Include visual motion, primary colors, and commercial theme.
4. NO subjective quality buzzwords ("amazing", "stunning", "beautiful", "high quality", "best seller").
5. NO brand names or trademarked terms.
6. NEVER start the title with standalone numbers or raw data values (e.g. "100 75 50"). Describe the visual subject instead (e.g. "Bar Chart Comparison Infographic").

ADOBE STOCK KEYWORD RULES:
1. Return exactly 35 to 40 unique, comma-separated keywords ordered strictly by relevance.
2. The FIRST 10 KEYWORDS are the most important for Adobe Stock search algorithm ranking:
   - Keywords 1-5: Exact visual subjects & text words found in the SVG (e.g. "good", "better", "best", "infographic", "performance curve").
   - Keywords 6-10: Motion type & visual style (e.g. "vector motion", "animated chart", "seamless loop").
   - Keywords 11-20: Colors, lighting, objects (e.g. "neon glow", "cyan", "magenta", "dark background").
   - Keywords 21-35: Commercial use-cases & industry categories (e.g. "business analytics", "data presentation", "motion graphics", "stock footage").

RESPONSE FORMAT:
You MUST return ONLY a raw JSON object with no markdown formatting:
{
  "title": "Exact Adobe Stock Title Here (50-70 chars)",
  "keywords": "keyword1, keyword2, keyword3, keyword4..."
}`;

    let generatedText = "";

    if (grokKey) {
      const grokModel = getEnvKey("TEXT_MODEL_ADVANCED") || getEnvKey("TEXT_MODEL_BASIC") || "grok-3";
      console.log(`[Metadata API] Generating using Grok API (${grokModel})...`);
      try {
        let response = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${grokKey}`,
          },
          body: JSON.stringify({
            model: grokModel,
            messages: [{ role: "user", content: systemPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        });

        if (!response.ok && grokModel !== "grok-3-mini") {
          console.warn(`[Metadata API] Grok ${grokModel} failed, trying grok-3-mini...`);
          response = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${grokKey}`,
            },
            body: JSON.stringify({
              model: "grok-3-mini",
              messages: [{ role: "user", content: systemPrompt }],
              response_format: { type: "json_object" },
              temperature: 0.2,
            }),
          });
        }

        if (response.ok) {
          const data = await response.json();
          generatedText = data.choices?.[0]?.message?.content || "";
        } else {
          console.warn("[Metadata API] Grok API call error:", await response.text());
        }
      } catch (err) {
        console.warn("[Metadata API] Grok fetch error:", err);
      }
    }

    if (!generatedText && openaiKey) {
      console.log("[Metadata API] Generating using OpenAI API...");
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: systemPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          generatedText = data.choices?.[0]?.message?.content || "";
        } else {
          console.warn("[Metadata API] OpenAI API call error:", await response.text());
        }
      } catch (err) {
        console.warn("[Metadata API] OpenAI fetch error:", err);
      }
    }

    if (!generatedText && geminiKey && !geminiKey.includes("placeholder")) {
      console.log("[Metadata API] Generating using Gemini API...");
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } catch (geminiErr) {
        console.warn("[Metadata API] Gemini request failed, using intelligent SVG analyzer:", geminiErr);
      }
    }

    if (generatedText) {
      let cleanText = generatedText.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }
      const result = JSON.parse(cleanText);
      if (result.title && result.keywords) {
        return NextResponse.json(result);
      }
    }
  } catch (error: any) {
    console.warn("[Metadata API] AI generation error, using intelligent SVG analyzer:", error.message);
  }

  // Intelligent SVG Code Analyzer (Parses exact text tags, titles, classes, and subjects)
  console.log("[Metadata API] Returning intelligent SVG code analyzer metadata...");
  const analyzerResult = extractSvgMetadata(presetName, svgCode);
  return NextResponse.json(analyzerResult);
}
