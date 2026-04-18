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

    // 1. Verify User
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('unauthorized');

    // 2. Fetch Profile & Handle Daily Reset
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, last_reset_date')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error('profile_error');

    const today = new Date().toISOString().split('T')[0]; // Gets YYYY-MM-DD
    let currentCredits = profile.credits;

    // If their last reset was before today, refill their tank to 3!
    if (!profile.last_reset_date || profile.last_reset_date < today) {
      currentCredits = 3;
      await supabase.from('profiles').update({ 
        credits: 3, 
        last_reset_date: today 
      }).eq('id', user.id);
    }

    // 3. Block if out of credits today
    if (currentCredits <= 0) throw new Error('quota_exceeded');

    // 4. Jargon-Free AI Prompt
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    // Explicit instructions to the AI to talk like a normal human
    const GEMINI_PROMPT = `Analyze this data visualization. Extract 4–10 dominant colors. Return ONLY a JSON object:
    {
    "palette": [{ "hex": "#RRGGBB", "role": "Background|Primary Data|Secondary Data|Accent|Text|Grid", "reasoning": "Explain exactly what this color represents", "prominence": "dominant|supporting|accent" }],
    "overall_style": "Summarize aesthetic",
    "colorblind_notes": "Accessibility advice. Use simple, everyday language. Do NOT use medical terms like 'protanopia' or 'deuteranopia'. Instead, say 'red-green color blindness' or 'people who struggle to distinguish certain shades'."
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ parts: [{ text: GEMINI_PROMPT }, { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }] }],
      config: { responseMimeType: "application/json" }
    });

    // 5. Deduct 1 credit for today
    await supabase.from('profiles').update({ 
      credits: currentCredits - 1 
    }).eq('id', user.id);

    // 6. Return Data
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