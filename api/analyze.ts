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

    // Using VITE_ prefixes to ensure it matches the environment variables we set up earlier
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
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

    // --- Gemini API Call (Official SDK) ---
    const GEMINI_PROMPT = `You are an expert color extraction algorithm and data visualization analyst.
Your task is to analyze the provided image and extract the EXACT hex codes for every meaningful color present. 

CRITICAL INSTRUCTIONS:
1. EXTRACT EXACT HEX CODES: Do not guess or approximate. Extract the literal hex codes used for the background, text, grid lines, data points (bars, lines, bubbles), and highlights. 
2. EXHAUSTIVE EXTRACTION: Find EVERY distinct color. Do not stop at 5. If there are 12 colors, extract 12. If there are 15, extract 15. Do not skip any prominent colors.
3. HIGHLY DETAILED REASONING: For EVERY color, write a comprehensive, highly detailed 2 to 3 sentence explanation. Explain exactly what data point, category, or UI element this color represents, why it was chosen, and how it functions in the visual hierarchy.
4. NO HALLUCINATIONS: Ensure the hex codes represent the actual pixels in the image.

Return ONLY valid JSON.
{
  "palette": [
    {
      "hex": "#RRGGBB",
      "role": "Background|Primary Data|Secondary Data|Accent|Text|Grid",
      "reasoning": "Detailed 2-3 sentence analysis of this specific color's role, usage, and impact in the chart.",
      "prominence": "dominant|supporting|accent"
    }
  ],
  "overall_style": "Detailed 2-3 sentence summary of the aesthetic and color theory.",
  "colorblind_notes": "Plain language accessibility assessment."
}`;

    // Initialize the official SDK
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{
        role: "user",
        parts: [
          { text: GEMINI_PROMPT },
          { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
        ]
      }],
      config: { 
        responseMimeType: "application/json" 
      }
    });

    const rawText = response.text || "";

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