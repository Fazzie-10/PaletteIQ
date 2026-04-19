import { GoogleGenAI } from "@google/genai";
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

    // NOTE: Server-side env vars must NOT have the VITE_ prefix.
    // In your Vercel dashboard, add these without VITE_:
    //   SUPABASE_URL  (same value as VITE_SUPABASE_URL)
    //   SUPABASE_ANON_KEY  (same value as VITE_SUPABASE_ANON_KEY)
    //   GEMINI_API_KEY
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the user's session token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    // --- Credit Logic ---
    // Fetch the user's current profile
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

    // If it's a new day, reset credits to 5
    if (!profile.last_reset_date || profile.last_reset_date < today) {
      currentCredits = 5;
      const { error: resetError } = await supabase
        .from("profiles")
        .update({ credits: 5, last_reset_date: today })
        .eq("id", user.id);

      if (resetError) {
        console.error("Credit reset error:", resetError);
        // Non-fatal: continue with the reset credits value
      }
    }

    if (currentCredits <= 0) {
      return res.status(403).json({
        error: "0 Daily Credits Remaining. Your credits reset at midnight. Upgrade to Pro for unlimited access.",
      });
    }

    // --- Gemini API Call ---
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const GEMINI_PROMPT = `You are an expert data visualization designer and color theorist. 
Analyze this dashboard or infographic image with absolute precision.

Your task:
1. Extract EVERY visually distinct and intentional color — including background, text, grid lines, chart bars/lines, accents, and highlights.
2. Assign each color a semantic role from this list: Background | Primary Data | Secondary Data | Accent | Text | Grid
3. Explain precisely WHY this color was used in a data visualization context.
4. Assess colorblind accessibility in plain everyday language.

Rules:
- Extract between 5 and 12 colors. Capture all meaningful colors, do not skip any.
- Do not extract near-identical shades as separate colors.
- Hex codes must be exact (6 characters, uppercase after #).
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

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview", // Best vision + reasoning for dashboard color analysis
      contents: [
        {
          parts: [
            { text: GEMINI_PROMPT },
            {
              inlineData: {
                data: imageBase64,
                mimeType: "image/jpeg",
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    // Parse and validate the response
    let result;
    try {
      const rawText = response.text ?? "";
      // Strip any accidental markdown fences just in case
      const clean = rawText.replace(/```json|```/g, "").trim();
      result = JSON.parse(clean);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Raw:", response.text);
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
      // Log but don't fail — user already got their result
      console.error("Credit deduction error:", deductError);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Unhandled API error:", error.message, error);

    if (error.message?.includes("quota") || error.message?.includes("429")) {
      return res.status(429).json({
        error: "AI service is busy right now. Please try again in a moment.",
      });
    }

    if (error.message?.includes("API_KEY") || error.message?.includes("invalid")) {
      return res.status(500).json({
        error: "Server configuration error. Please contact support.",
      });
    }

    return res.status(500).json({
      error: "Analysis failed. Please try a clearer image or a different file.",
    });
  }
}