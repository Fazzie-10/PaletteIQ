import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64 } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ error: 'Please log in to use this tool.' });

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('unauthorized');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, last_reset_date')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error('profile_error');

    const today = new Date().toISOString().split('T')[0];
    let currentCredits = profile.credits;

    // INCREASED TO 5 CREDITS
    if (!profile.last_reset_date || profile.last_reset_date < today) {
      currentCredits = 5;
      await supabase.from('profiles').update({ 
        credits: 5, 
        last_reset_date: today 
      }).eq('id', user.id);
    }

    // STRICT CUTOFF
    if (currentCredits <= 0) throw new Error('quota_exceeded');

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    // UPDATED PROMPT FOR MAXIMUM DETAIL
    const GEMINI_PROMPT = `Analyze this data visualization with high precision. Extract 4–10 dominant colors. Return ONLY a JSON object:
    {
    "palette": [{ "hex": "#RRGGBB", "role": "Background|Primary Data|Secondary Data|Accent|Text|Grid", "reasoning": "Provide a detailed, highly accurate explanation of exactly what this color represents in the visual hierarchy.", "prominence": "dominant|supporting|accent" }],
    "overall_style": "Provide a detailed summary of the aesthetic and color theory.",
    "colorblind_notes": "Provide specific accessibility advice. Use simple, everyday language (e.g., 'red-green color blindness')."
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ parts: [{ text: GEMINI_PROMPT }, { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }] }],
      config: { responseMimeType: "application/json" }
    });

    await supabase.from('profiles').update({ 
      credits: currentCredits - 1 
    }).eq('id', user.id);

    const result = JSON.parse(response.text!);
    return res.status(200).json(result);

  } catch (error: any) {
    console.error("API Error:", error.message);
    if (error.message === 'quota_exceeded') {
       return res.status(403).json({ error: '0 Daily Credits Remaining. Please upgrade to Pro or come back tomorrow.' });
    }
    if (error.message === 'unauthorized') {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(500).json({ error: 'Analysis failed. Please try a clearer image.' });
  }
}