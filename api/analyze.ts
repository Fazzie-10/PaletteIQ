import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image data provided." });
    }

    // --- Auth ---
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Please log in to use this tool." });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    // --- Credit Logic ---
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("credits, last_reset_date")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("Profile fetch error:", profileError);
      return res.status(500).json({ error: "Could not load your profile. Please try logging out and back in." });
    }

    const today = new Date().toISOString().split("T")[0];
    let currentCredits = profile.credits;

    if (!profile.last_reset_date || profile.last_reset_date < today) {
      currentCredits = 5;
      await supabase
        .from("profiles")
        .update({ credits: 5, last_reset_date: today })
        .eq("id", user.id);
    }

    if (currentCredits <= 0) {
      return res.status(403).json({
        error: "0 Daily Credits Remaining. Your credits reset at midnight. Upgrade to Pro for unlimited access.",
      });
    }

    // --- Gemini API Call (direct fetch) ---
    const GEMINI_PROMPT = `You are an expert data visualization designer and color theorist.
Analyze this dashboard or infographic image with absolute precision.

Your task:
1. Extract EVERY visually distinct and intentional color including background, text, grid lines, chart bars/lines, accents, and highlights.
2. Assign each color a semantic role from this list: Background | Primary Data | Secondary Data | Accent | Text | Grid
3. Explain precisely WHY this color was used in a data visualization context.
4. Assess colorblind accessibility in plain everyday language.

Rules:
- Extract between 5 and 12 colors. Capture all meaningful colors, do not skip any.
- Do not extract near-identical shades as separate colors.
- Hex codes must be exact 6 characters uppercase after #.
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.

Return this exact structure:
{
  "palette": [
    {
      "hex": "#RRGGBB",
      "role": "Background",
      "reasoning": "One to two sentences explaining the design intent behind this color in this specific visualization.",
      "prominence": "dominant"
    }
  ],
  "overall_style": "Two to three sentences summarizing the overall color strategy, aesthetic, and design philosophy of this dashboard or infographic.",
  "colorblind_notes": "Plain language assessment. State whether the palette is safe for people with red-green color blindness or blue-yellow color blindness. Give one concrete suggestion if there is a problem."
}`;

    // FIX 1: Reverted to gemini-3.1-flash-lite-preview (500 RPD Quota)
    // FIX 2: Used camelCase (inlineData and mimeType) for the Google REST payload
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: GEMINI_PROMPT },
                { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return res.status(502).json({ error: "AI service error. Please try again in a moment." });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse and validate
    let result;
    try {
      const clean = rawText.replace(/```json|```/g, "").trim();
      result = JSON.parse(clean);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Raw text:", rawText);
      return res.status(500).json({
        error: "AI returned an unexpected format. Please try again with a clearer image.",
      });
    }

    if (!result.palette || !Array.isArray(result.palette) || result.palette.length === 0) {
      return res.status(500).json({
        error: "Could not extract colors from this image. Try a higher quality screenshot.",
      });
    }

    // --- Deduct credit ONLY after successful analysis ---
    const { error: deductError } = await supabase
      .from("profiles")
      .update({ credits: currentCredits - 1 })
      .eq("id", user.id);

    if (deductError) {
      console.error("Credit deduction error:", deductError);
    }

    return res.status(200).json(result);

  } catch (error: any) {
    console.error("Unhandled API error:", error.message, error);

    if (error.message?.includes("quota") || error.message?.includes("429")) {
      return res.status(429).json({ error: "AI service is busy right now. Please try again in a moment." });
    }

    return res.status(500).json({ error: "Analysis failed. Please try a clearer image or a different file." });
  }
}