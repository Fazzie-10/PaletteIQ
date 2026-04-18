import React, { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  Upload, Copy, Check, Zap, Palette, Table, Layers, AlertCircle, X,
  MousePointer2, ChevronRight, Twitter, Facebook, Instagram, Music2, Shield, BarChart3, LogIn
} from 'lucide-react';
import { motion } from 'motion/react';

// --- Types ---
interface ColorInfo {
  hex: string;
  role: 'Background' | 'Primary Data' | 'Secondary Data' | 'Accent' | 'Text' | 'Grid';
  reasoning: string;
  prominence: 'dominant' | 'supporting' | 'accent';
}

interface PaletteResult {
  palette: ColorInfo[];
  overall_style: string;
  colorblind_notes: string;
}

type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export default function App() {
  // Auth & Credit State
  const [session, setSession] = useState<any>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // App State
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PaletteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedSwatch, setExpandedSwatch] = useState<number | null>(null);
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>('none');
  const [isDragging, setIsDragging] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Auth Logic ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchCredits(session.user.id);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchCredits(session.user.id);
      else setCredits(null);
    });
  }, []);

  const fetchCredits = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('credits').eq('id', userId).single();
    if (data) setCredits(data.credits);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true); setAuthError(null);
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else setAuthError('Success! Please log in.');
    setIsAuthLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true); setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    setIsAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setResult(null); setImage(null);
  };

  // --- App Logic ---
  const handleCopy = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  const preprocessImage = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width; let height = img.height;
          if (width < 1000) {
            const ratio = 1500 / width; width = 1500; height = height * ratio;
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    setError(null); setResult(null); setExpandedSwatch(null);
    const processedDataUrl = await preprocessImage(file);
    setImage(processedDataUrl);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  const isLightColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16);
    return ((r * 299 + g * 587 + b * 114) / 1000) > 220;
  };

  const analyzePalette = async () => {
    if (!image || !session) return;
    setIsProcessing(true); setError(null); setExpandedSwatch(null);

    try {
      const base64Data = image.split(',')[1];

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ imageBase64: base64Data })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze palette');
      }

      setResult(data);
      fetchCredits(session.user.id);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportPowerBI = () => {
    if (!result) return;
    const theme = {
      name: "PaletteIQ Theme",
      dataColors: result.palette.filter(c => c.role.includes('Data')).map(c => c.hex),
      background: result.palette.find(c => c.role === 'Background')?.hex || "#FFFFFF",
      foreground: result.palette.find(c => c.role === 'Text')?.hex || "#000000",
      tableAccent: result.palette.find(c => c.role === 'Accent')?.hex || result.palette[0].hex
    };
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'paletteiq-powerbi.json'; a.click();
  };

  const exportFigma = () => {
    if (!result) return;
    const tokens = result.palette.reduce((acc: any, color) => {
      acc[color.role.toLowerCase().replace(' ', '-')] = { value: color.hex, type: "color", description: color.reasoning };
      return acc;
    }, {});
    const blob = new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'paletteiq-figma.json'; a.click();
  };

  const exportPaletteImage = () => {
    if (!result) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const swatchSize = 140;
    const padding = 60;
    const columns = 4;
    const rows = Math.ceil(result.palette.length / columns);
    const rowHeight = swatchSize + 180;
    
    canvas.width = columns * (swatchSize + padding * 2) + padding;
    canvas.height = rows * rowHeight + padding + 150;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F1117';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PaletteIQ Color Intelligence', canvas.width / 2, 80);

    result.palette.forEach((color, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = padding + col * (swatchSize + padding * 2) + (swatchSize + padding * 2) / 2;
      const y = padding + 150 + row * rowHeight + swatchSize / 2;

      ctx.beginPath();
      ctx.arc(x, y, swatchSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color.hex;
      ctx.fill();

      if (isLightColor(color.hex)) {
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(color.hex.toUpperCase(), x, y + swatchSize / 2 + 35);
      
      ctx.fillStyle = '#4F46E5';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(color.role.toUpperCase(), x, y + swatchSize / 2 + 60);

      ctx.fillStyle = '#6B7280';
      ctx.font = '12px sans-serif';
      const words = color.reasoning.split(' ');
      let line = '';
      let lineCount = 0;
      const maxWidth = swatchSize + 40;
      
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, y + swatchSize / 2 + 85 + (lineCount * 18));
          line = words[n] + ' ';
          lineCount++;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y + swatchSize / 2 + 85 + (lineCount * 18));
    });

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paletteiq-export.png';
    a.click();
  };

  const getColorblindFilter = () => {
    switch (colorblindMode) {
      case 'protanopia': return 'url(#protanopia)';
      case 'deuteranopia': return 'url(#deuteranopia)';
      case 'tritanopia': return 'url(#tritanopia)';
      case 'achromatopsia': return 'grayscale(100%)';
      default: return 'none';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-text-main font-sans selection:bg-brand-primary/20">
      
      {/* Navbar with Auth & Credits */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center shadow-lg shadow-brand-primary/20">
              <Palette className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-text-main">PaletteIQ</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            {['How it works', 'Features', 'Pricing'].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`} className="text-sm font-medium text-text-muted hover:text-brand-primary transition-colors">
                {item}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {session ? (
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-indigo-50 text-brand-primary rounded-full border border-indigo-100">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-bold">{credits !== null ? `${credits} Daily Uses` : '...'}</span>
                </div>
                <button onClick={handleLogout} className="text-sm font-bold text-text-muted hover:text-brand-primary">Logout</button>
              </div>
            ) : (
              <button onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })} className="px-5 py-2 bg-brand-primary text-white text-sm font-bold rounded-full shadow-lg hover:bg-brand-secondary transition-all">
                Login
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main App Container */}
      <main className="flex-1 pt-32">
        
        {/* Auth Gate Screen */}
        {!session ? (
          <section id="auth-section" className="max-w-md mx-auto px-6 mb-32 mt-10">
            <div className="glass-card rounded-[2rem] p-10 text-center shadow-2xl border border-white">
              <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary mx-auto mb-6">
                <LogIn className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Welcome to PaletteIQ</h2>
              <p className="text-text-muted text-sm mb-8">Sign in or create an account to get 3 free AI extractions every day.</p>
              
              <form className="space-y-4" onSubmit={handleLogin}>
                <input 
                  type="email" placeholder="Email address" required
                  value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                />
                <input 
                  type="password" placeholder="Password" required
                  value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                />
                {authError && <p className="text-xs text-red-500 font-medium text-left">{authError}</p>}
                
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={isAuthLoading} className="flex-1 py-3 bg-brand-primary text-white font-bold rounded-xl hover:bg-brand-secondary disabled:opacity-50 transition-all">
                    {isAuthLoading ? 'Loading...' : 'Sign In'}
                  </button>
                  <button type="button" onClick={handleSignUp} disabled={isAuthLoading} className="flex-1 py-3 bg-white border border-gray-200 text-text-main font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all">
                    Create Account
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : (
          /* Tool Dashboard (Only visible when logged in) */
          <section id="tool-dashboard" className="max-w-6xl mx-auto px-4 md:px-6 mb-32">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl border border-white">
              <div className="flex flex-col md:flex-row h-auto md:h-[700px] min-h-min md:min-h-[600px]">
                
                {/* Sidebar */}
                <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-100 bg-white/50 p-6 md:p-8 flex flex-col gap-6 md:gap-8">
                  <div>
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-6">Source Analysis</h3>
                    <div 
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={onDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative aspect-video rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden flex items-center justify-center ${isDragging ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}
                    >
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                      {image ? <img src={image} className="w-full h-full object-cover" /> : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Upload className="w-6 h-6" />
                          <span className="text-[10px] font-bold uppercase">Upload Image</span>
                        </div>
                      )}
                      {isProcessing && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                          <div className="w-8 h-8 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto">
                    {!result && image && !isProcessing && (
                      <button onClick={analyzePalette} className="w-full py-4 bg-brand-primary text-white font-bold rounded-2xl shadow-lg shadow-brand-primary/20 hover:bg-brand-secondary transition-all">
                        Analyze (1 Credit)
                      </button>
                    )}
                    {result && (
                      <div className="space-y-3">
                        <button onClick={exportPaletteImage} className="w-full py-3 bg-white border border-gray-200 text-text-main text-sm font-bold rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                          <Copy className="w-4 h-4" /> Export Image
                        </button>
                        <button onClick={() => { setResult(null); setImage(null); setError(null); }} className="w-full py-3 bg-gray-100 text-text-muted text-sm font-bold rounded-xl hover:bg-gray-200 transition-all">
                          Start Over
                        </button>
                      </div>
                    )}
                  </div>
                </aside>

                {/* Main Results Area */}
                <div className="flex-1 bg-white flex flex-col overflow-hidden">
                  {error ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mb-6">
                        <AlertCircle className="w-8 h-8" />
                      </div>
                      <h3 className="font-bold text-text-main mb-2">Analysis Failed</h3>
                      <p className="text-text-muted text-sm max-w-xs">{error}</p>
                      {error.includes('Credits') && (
                        <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="mt-6 px-6 py-3 bg-brand-primary text-white text-sm font-bold rounded-full">
                          Upgrade to Pro
                        </button>
                      )}
                    </div>
                  ) : !result ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-20 h-20 bg-brand-primary/5 rounded-3xl flex items-center justify-center text-brand-primary mb-6"><Palette className="w-10 h-10" /></div>
                      <h2 className="text-2xl font-bold mb-4">Ready to extract intelligence?</h2>
                      <p className="text-text-muted max-w-sm">Upload a dashboard or chart to see the AI analyze semantic roles and accessibility.</p>
                    </div>
                  ) : (
                    <div className="flex-1 p-6 md:p-12 overflow-y-auto bg-gray-50/30" style={{ filter: getColorblindFilter() }}>
                       <div className="text-center mb-8 md:mb-12">
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">Extracted Palette</h2>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-y-8 md:gap-y-12 gap-x-4 md:gap-x-8">
                        {result.palette.map((color, idx) => (
                          <motion.div key={idx} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }} className="flex flex-col items-center group">
                            <div 
                              onClick={() => handleCopy(color.hex, idx)}
                              className={`w-16 h-16 md:w-24 md:h-24 rounded-full shadow-lg cursor-pointer transition-transform hover:scale-110 active:scale-95 relative flex items-center justify-center ${isLightColor(color.hex) ? 'border border-gray-200' : ''}`}
                              style={{ backgroundColor: color.hex }}
                            >
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                {copiedIndex === idx ? <Check className="w-5 h-5 text-white mix-blend-difference" /> : <Copy className="w-5 h-5 text-white mix-blend-difference" />}
                              </div>
                            </div>
                            <div className="mt-3 md:mt-4 text-center px-1 w-full md:cursor-default cursor-pointer" onClick={() => setExpandedSwatch(expandedSwatch === idx ? null : idx)}>
                              <p className="text-xs md:text-sm font-black tracking-tight text-text-main uppercase">{color.hex}</p>
                              <p className="text-[9px] md:text-[10px] font-bold text-brand-primary uppercase tracking-widest mt-1">{color.role}</p>
                              <p className={`text-[8px] md:text-[9px] text-text-muted leading-tight mt-2 max-w-[120px] mx-auto transition-all ${expandedSwatch === idx ? 'line-clamp-none' : 'line-clamp-2 md:line-clamp-3 md:group-hover:line-clamp-none'}`}>
                                {color.reasoning}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      <div className="mt-12 md:mt-16 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">AI Insights</h4>
                        <p className="text-xs md:text-sm text-text-main leading-relaxed">{result.overall_style}</p>
                        <div className="mt-4 pt-4 border-t border-gray-50 flex items-start gap-2 text-amber-600">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <p className="text-[10px] md:text-xs font-medium">{result.colorblind_notes}</p>
                        </div>
                      </div>

                      <div className="mt-8 flex flex-wrap justify-center gap-4">
                         <button onClick={exportPowerBI} className="px-4 py-2 bg-yellow-500 text-white text-xs font-bold rounded-lg shadow-md hover:bg-yellow-600 transition-colors flex items-center gap-2"><Table className="w-4 h-4" /> Export Power BI</button>
                         <button onClick={exportFigma} className="px-4 py-2 bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-md hover:bg-indigo-600 transition-colors flex items-center gap-2"><Layers className="w-4 h-4" /> Export Figma</button>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </section>
        )}

        {/* Pricing Section - UPDATED TO SHOW DAILY LIMITS */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 mb-32">
          <div className="text-center mb-20">
            <span className="text-brand-primary font-bold text-sm uppercase tracking-widest">Pricing</span>
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">Simple, Transparent Plans</h2>
            <p className="text-text-muted">Start for free, upgrade when you need unlimited power.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <div className="p-10 rounded-3xl border bg-white border-gray-100 shadow-sm relative">
              <h3 className="text-xl font-bold mb-2">Basic</h3>
              <p className="text-text-muted text-sm mb-8">For casual users and students.</p>
              <div className="text-4xl font-black mb-8">$0<span className="text-sm font-normal text-text-muted">/forever</span></div>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-sm text-text-main font-medium">
                  <Check className="w-4 h-4 text-brand-primary" /> 3 AI Extractions Per Day
                </li>
                <li className="flex items-center gap-3 text-sm text-text-muted">
                  <Check className="w-4 h-4 text-brand-primary" /> Jargon-Free Accessibility Notes
                </li>
                <li className="flex items-center gap-3 text-sm text-text-muted">
                  <Check className="w-4 h-4 text-brand-primary" /> Basic Image Export
                </li>
              </ul>
              {!session ? (
                 <button onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })} className="w-full py-4 rounded-xl font-bold bg-gray-100 text-text-main hover:bg-gray-200 transition-all">Sign Up Free</button>
              ) : (
                 <button disabled className="w-full py-4 rounded-xl font-bold bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200">Current Plan</button>
              )}
            </div>

            {/* Pro Tier */}
            <div className="p-10 rounded-3xl border bg-brand-primary/5 border-brand-primary shadow-xl shadow-brand-primary/10 relative">
              <div className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 bg-brand-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-full">Most Popular</div>
              <h3 className="text-xl font-bold mb-2">Pro Analyst</h3>
              <p className="text-text-muted text-sm mb-8">For professionals building daily dashboards.</p>
              <div className="text-4xl font-black mb-8">$9<span className="text-sm font-normal text-text-muted">/month</span></div>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-sm text-text-main font-bold">
                  <Check className="w-4 h-4 text-brand-primary" /> Unlimited Daily Extractions
                </li>
                <li className="flex items-center gap-3 text-sm text-text-main font-bold">
                  <Check className="w-4 h-4 text-brand-primary" /> Power BI (.json) Export
                </li>
                <li className="flex items-center gap-3 text-sm text-text-main font-bold">
                  <Check className="w-4 h-4 text-brand-primary" /> Figma Tokens Export
                </li>
              </ul>
              <button className="w-full py-4 rounded-xl font-bold bg-brand-primary text-white shadow-lg shadow-brand-primary/20 hover:bg-brand-secondary transition-all">
                Coming Soon
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* Footer remains the same... */}
      <footer className="bg-white border-t border-gray-100 py-12">
         {/* Standard footer content */}
      </footer>
    </div>
  );
}