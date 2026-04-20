import React, { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  Upload, Copy, Check, Zap, Palette, Table, Layers, AlertCircle, X,
  ChevronRight, Twitter, Facebook, Instagram, Music2, Shield, BarChart3, LogIn, MousePointer2, Clock
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

type ColorblindMode = 'none' | 'red-blind' | 'green-blind' | 'blue-blind' | 'monochrome';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [timeUntilReset, setTimeUntilReset] = useState('');
  
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{text: string, type: 'error' | 'success'} | null>(null);

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

  // --- Logic ---
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

  // FIX 1: Enhanced Timer & Automatic Next-Day Unlock
  useEffect(() => {
    if (credits === 0 && session) {
      const interval = setInterval(() => {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const diff = tomorrow.getTime() - now.getTime();

        // If midnight passes, fetch fresh credits and kill this timer
        if (diff <= 0) {
          fetchCredits(session.user.id);
          clearInterval(interval);
          return;
        }

        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeUntilReset(`${hours}h ${minutes}m ${seconds}s`);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [credits, session]);

  const fetchCredits = async (userId: string) => {
    // We now fetch last_reset_date so the frontend knows if a new day has started
    const { data } = await supabase.from('profiles').select('credits, last_reset_date').eq('id', userId).single();
    if (data) {
      const today = new Date().toISOString().split('T')[0];
      // If the user's last reset was yesterday or older, optimistically unlock the UI to 5 credits
      if (!data.last_reset_date || data.last_reset_date < today) {
        setCredits(5);
      } else {
        setCredits(data.credits);
      }
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true); 
    setAuthMessage(null);

    if (isSignUpMode) {
      const { error } = await supabase.auth.signUp({ 
        email: authEmail, password: authPassword, options: { data: { full_name: authName } }
      });
      if (error) setAuthMessage({ text: error.message, type: 'error' });
      else {
        setAuthMessage({ text: 'Account created successfully! You can now log in.', type: 'success' });
        setIsSignUpMode(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) setAuthMessage({ text: error.message, type: 'error' });
    }
    setIsAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setResult(null); setImage(null);
  };

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
          if (width < 1000) { const ratio = 1500 / width; width = 1500; height = height * ratio; }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) { ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.9)); } 
          else { resolve(e.target?.result as string); }
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
    if (!image || !session || credits === 0) return;
    
    setIsProcessing(true); setError(null); setExpandedSwatch(null);

    try {
      const base64Data = image.split(',')[1];
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ imageBase64: base64Data })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to analyze palette');

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
      case 'red-blind': return 'url(#protanopia)';
      case 'green-blind': return 'url(#deuteranopia)';
      case 'blue-blind': return 'url(#tritanopia)';
      case 'monochrome': return 'grayscale(100%)';
      default: return 'none';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg-light text-text-main font-sans selection:bg-brand-primary/20">
      
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
                <div className={`hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full border ${credits === 0 ? 'bg-red-50 border-red-100 text-red-500' : 'bg-indigo-50 border-indigo-100 text-brand-primary'}`}>
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-bold">{credits !== null ? `${credits}/5 Uses` : '...'}</span>
                </div>
                <button onClick={handleLogout} className="text-sm font-bold text-text-muted hover:text-brand-primary">Logout</button>
              </div>
            ) : (
              <button onClick={() => document.getElementById('tool-dashboard')?.scrollIntoView({ behavior: 'smooth' })} className="px-5 py-2 bg-brand-primary text-white text-sm font-bold rounded-full shadow-lg hover:bg-brand-secondary transition-all">
                Login
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-32">
        <svg className="hidden">
          <filter id="protanopia"><feColorMatrix type="matrix" values="0.567, 0.433, 0, 0, 0, 0.558, 0.442, 0, 0, 0, 0, 0.242, 0.758, 0, 0, 0, 0, 0, 1, 0" /></filter>
          <filter id="deuteranopia"><feColorMatrix type="matrix" values="0.625, 0.375, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0, 0.3, 0.7, 0, 0, 0, 0, 0, 1, 0" /></filter>
          <filter id="tritanopia"><feColorMatrix type="matrix" values="0.95, 0.05, 0, 0, 0, 0, 0.433, 0.567, 0, 0, 0, 0, 0.475, 0.525, 0, 0, 0, 0, 0, 1, 0" /></filter>
        </svg>

        <section className="max-w-7xl mx-auto px-6 text-center mb-16 md:mb-20">
          <motion.a href="https://linktr.ee/AnalystFemi" target="_blank" rel="noopener noreferrer" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 rounded-full border border-brand-primary/20 mb-8 hover:bg-brand-primary/20 transition-colors cursor-pointer">
            <div className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-pulse" />
            <span className="text-[11px] font-bold text-brand-primary uppercase tracking-wider">By AnalystFemi</span>
          </motion.a>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-4xl md:text-7xl font-extrabold tracking-tight text-text-main mb-6 md:mb-8 leading-[1.1]">
            Universal Color Intelligence for <br />
            <span className="gradient-text">Every Data Visualization</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-base md:text-lg text-text-muted max-w-2xl mx-auto mb-8 md:mb-10">
            Extract professional palettes from dashboards, infographics, and charts. The ultimate color intelligence tool for Power BI, Excel, Tableau, Canva, and Figma.
          </motion.p>
        </section>

        <section id="tool-dashboard" className="max-w-6xl mx-auto px-4 md:px-6 mb-32">
          {!session ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto glass-card rounded-[2rem] p-10 text-center shadow-2xl border border-white">
              <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary mx-auto mb-6">
                <LogIn className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{isSignUpMode ? 'Create an Account' : 'Welcome to PaletteIQ'}</h2>
              <p className="text-text-muted text-sm mb-8">{isSignUpMode ? 'Join today and get 5 free AI extractions daily.' : 'Sign in to access your daily AI extractions.'}</p>
              
              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                {isSignUpMode && (
                  <motion.input 
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    type="text" placeholder="Full Name" required value={authName} onChange={(e) => setAuthName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                )}
                <input 
                  type="email" placeholder="Email address" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                />
                <input 
                  type="password" placeholder="Password" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                />
                
                {authMessage && (
                  <p className={`text-xs font-medium text-left ${authMessage.type === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
                    {authMessage.text}
                  </p>
                )}
                
                <button type="submit" disabled={isAuthLoading} className="w-full py-3 bg-brand-primary text-white font-bold rounded-xl hover:bg-brand-secondary disabled:opacity-50 transition-all mt-4">
                  {isAuthLoading ? 'Loading...' : (isSignUpMode ? 'Create Account' : 'Sign In')}
                </button>
              </form>

              <p className="text-sm text-text-muted mt-6">
                {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
                <button onClick={() => { setIsSignUpMode(!isSignUpMode); setAuthMessage(null); }} className="font-bold text-brand-primary hover:underline">
                  {isSignUpMode ? 'Log In' : 'Sign Up'}
                </button>
              </p>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl border border-white">
              <div className="flex flex-col md:flex-row h-auto md:h-[700px] min-h-min md:min-h-[600px]">
                <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-100 bg-white/50 p-6 md:p-8 flex flex-col gap-6 md:gap-8 overflow-y-auto">
                  <div>
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-6">Source Analysis</h3>
                    <div 
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={onDrop}
                      onClick={() => credits !== 0 && fileInputRef.current?.click()}
                      className={`relative aspect-video rounded-2xl border-2 border-dashed transition-all overflow-hidden flex items-center justify-center 
                        ${credits === 0 ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-75' : isDragging ? 'border-brand-primary bg-brand-primary/5 cursor-pointer' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 cursor-pointer'}
                      `}
                    >
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} disabled={credits === 0} />
                      {image ? <img src={image} className="w-full h-full object-cover" /> : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          {credits === 0 ? <Clock className="w-6 h-6 text-red-400" /> : <Upload className="w-6 h-6" />}
                          <span className="text-[10px] font-bold uppercase">{credits === 0 ? 'Limit Reached' : 'Upload Image'}</span>
                        </div>
                      )}
                      {isProcessing && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                          <div className="w-8 h-8 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  {result && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">Accessibility</h3>
                        <div className="flex flex-wrap gap-2">
                          {(['none', 'red-blind', 'green-blind', 'blue-blind', 'monochrome'] as ColorblindMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setColorblindMode(mode)}
                              className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all ${colorblindMode === mode ? 'bg-brand-primary text-white' : 'bg-gray-100 text-text-muted hover:bg-gray-200'}`}
                            >
                              {mode === 'none' ? 'Normal' : mode.replace('-', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-4">
                    {!result && image && !isProcessing && (
                      <button 
                        onClick={analyzePalette} 
                        disabled={credits === 0}
                        className={`w-full py-4 font-bold rounded-2xl shadow-lg transition-all
                          ${credits === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-brand-primary text-white shadow-brand-primary/20 hover:bg-brand-secondary'}
                        `}
                      >
                        {credits === 0 ? '0 Credits Remaining' : 'Analyze (1 Credit)'}
                      </button>
                    )}
                    
                    {result && (
                      <div className="space-y-3">
                        <button onClick={exportPowerBI} className="w-full py-3 bg-yellow-50 text-yellow-600 border border-yellow-200 text-sm font-bold rounded-xl hover:bg-yellow-100 transition-all flex items-center justify-center gap-2"><Table className="w-4 h-4" /> Export Power BI</button>
                        <button onClick={exportFigma} className="w-full py-3 bg-indigo-50 text-indigo-600 border border-indigo-200 text-sm font-bold rounded-xl hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"><Layers className="w-4 h-4" /> Export Figma</button>
                        <button onClick={exportPaletteImage} className="w-full py-3 bg-emerald-50 text-emerald-600 border border-emerald-200 text-sm font-bold rounded-xl hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Export Image</button>
                        <div className="pt-4 border-t border-gray-100 mt-4">
                          <button onClick={() => { setResult(null); setImage(null); setError(null); }} className="w-full py-3 bg-gray-100 text-text-muted text-sm font-bold rounded-xl hover:bg-gray-200 transition-all">
                            Start Over
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </aside>

                <div className="flex-1 bg-white flex flex-col overflow-hidden">
                  {credits === 0 && !result ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-red-50/30">
                      <div className="w-16 h-16 bg-red-100 rounded-3xl flex items-center justify-center text-red-500 mb-6"><Clock className="w-8 h-8" /></div>
                      <h3 className="font-bold text-text-main mb-2">Daily Limit Reached</h3>
                      <p className="text-text-muted text-sm max-w-xs mb-6">You've used all 5 of your free extractions for today. Your credits will automatically reset in:</p>
                      <div className="text-3xl font-black text-red-500 mb-8">{timeUntilReset}</div>
                      <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="px-8 py-4 bg-brand-primary text-white text-sm font-bold rounded-full shadow-lg shadow-brand-primary/20">
                        Upgrade to Pro
                      </button>
                    </div>
                  ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mb-6"><AlertCircle className="w-8 h-8" /></div>
                      <h3 className="font-bold text-text-main mb-2">Analysis Failed</h3>
                      <p className="text-text-muted text-sm max-w-xs">{error}</p>
                    </div>
                  ) : !result ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-20 h-20 bg-brand-primary/5 rounded-3xl flex items-center justify-center text-brand-primary mb-6"><Palette className="w-10 h-10" /></div>
                      <h2 className="text-2xl font-bold mb-4">Ready to extract intelligence?</h2>
                      <p className="text-text-muted max-w-sm">Upload a dashboard or chart to see the AI analyze semantic roles and accessibility.</p>
                    </div>
                  ) : (
                    <div className="flex-1 p-6 md:p-12 overflow-y-auto bg-gray-50/30" style={{ filter: getColorblindFilter() }}>
                       
                       <div className="text-center mb-8">
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">Extracted Palette</h2>
                        <p className="inline-flex items-center gap-1 px-3 py-1 bg-brand-primary/10 text-brand-primary rounded-full text-xs font-bold uppercase tracking-widest mt-2">
                          <Zap className="w-3 h-3" /> {result.palette.length} Colors Identified
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-y-6 gap-x-4">
                        {result.palette.map((color, idx) => (
                          <motion.div key={idx} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }} className="flex flex-col items-center group">
                            <div 
                              onClick={() => handleCopy(color.hex, idx)}
                              className={`w-12 h-12 md:w-16 md:h-16 rounded-full shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-95 relative flex items-center justify-center ${isLightColor(color.hex) ? 'border border-gray-200' : ''}`}
                              style={{ backgroundColor: color.hex }}
                            >
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                {copiedIndex === idx ? <Check className="w-4 h-4 text-white mix-blend-difference" /> : <Copy className="w-4 h-4 text-white mix-blend-difference" />}
                              </div>
                            </div>
                            
                            {/* FIX 2: Restored onClick handler for Mobile text expansion */}
                            <div 
                              className="mt-3 text-center w-full md:cursor-default cursor-pointer" 
                              onClick={() => setExpandedSwatch(expandedSwatch === idx ? null : idx)}
                            >
                              <p className="text-xs font-black tracking-tight text-text-main uppercase">{color.hex}</p>
                              <p className="text-[9px] font-bold text-brand-primary uppercase tracking-widest mt-0.5">{color.role}</p>
                              
                              {/* FIX 2: Dynamic line-clamp based on expandedSwatch state */}
                              <p className={`text-[9px] text-text-muted leading-tight mt-1.5 px-1 transition-all ${expandedSwatch === idx ? 'line-clamp-none' : 'line-clamp-2 md:group-hover:line-clamp-none'}`}>
                                {color.reasoning}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      <div className="mt-10 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2">AI Insights</h4>
                        <p className="text-sm text-text-main leading-relaxed">{result.overall_style}</p>
                        <div className="mt-4 pt-4 border-t border-gray-50 flex items-start gap-2 text-amber-600">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <p className="text-xs font-medium">{result.colorblind_notes}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </section>

        {/* Informational Sections */}
        <section id="how-to-use" className="max-w-7xl mx-auto px-6 mb-32 scroll-mt-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">How to Extract a Professional Palette in 3 Steps</h2>
            <p className="text-text-muted">Learn how to extract and apply professional colors to any visualization with our AI-powered tool.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-0.5 bg-gray-100 -z-10" />
            {[
              { step: '1', title: 'Choose your source', desc: 'Select from pre-built palettes or upload any visualization image to extract a custom color scheme with AI.' },
              { step: '2', title: 'Analyze Intelligence', desc: 'Our AI automatically identifies semantic roles and usage context for every color, ensuring your design is data-driven.' },
              { step: '3', title: 'Export & Apply', desc: 'Download your palette as a Power BI JSON, Figma Tokens, or a professional PNG.' }
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 bg-white border-2 border-brand-primary rounded-full flex items-center justify-center text-2xl font-black text-brand-primary mx-auto mb-6 shadow-lg">{item.step}</div>
                <h3 className="text-xl font-bold mb-4">{item.title}</h3>
                <p className="text-text-muted text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="max-w-7xl mx-auto px-6 mb-32">
          <div className="text-center mb-20">
            <span className="text-brand-primary font-bold text-sm uppercase tracking-widest">Our Features</span>
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">Designed for Data Professionals</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              { icon: <Zap />, title: 'Semantic Extraction', desc: 'Our AI identifies Background, Primary Data, and Accent roles automatically, ensuring your palette is ready for any BI tool.' },
              { icon: <Shield />, title: 'Accessibility First', desc: 'Every palette is analyzed for colorblind accessibility, with simple, jargon-free notes to ensure your dashboards are inclusive.' },
              { icon: <BarChart3 />, title: 'Tool-Ready Exports', desc: 'Export directly to Power BI (JSON), Figma (Tokens), or copy Hex lists for Excel, Tableau, and Canva.' },
              { icon: <MousePointer2 />, title: 'High-Fidelity Analysis', desc: 'We upscale your visualizations before analysis to ensure maximum hex accuracy and detail extraction.' }
            ].map((feature, i) => (
              <div key={i} className="p-10 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
                <div className="w-12 h-12 bg-brand-primary/5 rounded-xl flex items-center justify-center text-brand-primary mb-6">{feature.icon}</div>
                <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                <p className="text-text-muted leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 mb-32">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-extrabold mt-4 mb-6">Simple, Transparent Plans</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="p-10 rounded-3xl border bg-white border-gray-100 shadow-sm relative">
              <h3 className="text-xl font-bold mb-2">Basic</h3>
              <p className="text-text-muted text-sm mb-8">For casual users and students.</p>
              <div className="text-4xl font-black mb-8">$0<span className="text-sm font-normal text-text-muted">/forever</span></div>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-sm text-text-main font-medium"><Check className="w-4 h-4 text-brand-primary" /> 5 AI Extractions Per Day</li>
                <li className="flex items-center gap-3 text-sm text-text-muted"><Check className="w-4 h-4 text-brand-primary" /> All Export Features (Power BI, Figma, Image)</li>
                <li className="flex items-center gap-3 text-sm text-text-muted"><Check className="w-4 h-4 text-brand-primary" /> Full Accessibility Notes</li>
              </ul>
              {!session ? (
                 <button onClick={() => document.getElementById('tool-dashboard')?.scrollIntoView({ behavior: 'smooth' })} className="w-full py-4 rounded-xl font-bold bg-gray-100 text-text-main hover:bg-gray-200 transition-all">Sign Up Free</button>
              ) : (
                 <button disabled className="w-full py-4 rounded-xl font-bold bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200">Current Plan</button>
              )}
            </div>
            <div className="p-10 rounded-3xl border bg-brand-primary/5 border-brand-primary shadow-xl relative">
              <div className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 bg-brand-primary text-white text-[10px] font-bold uppercase tracking-widest rounded-full">Most Popular</div>
              <h3 className="text-xl font-bold mb-2">Pro Analyst</h3>
              <p className="text-text-muted text-sm mb-8">For professionals building daily dashboards.</p>
              <div className="flex items-baseline gap-2 mb-8">
                <div className="text-4xl font-black">$2.99<span className="text-sm font-normal text-text-muted">/mo</span></div>
                <div className="text-sm font-medium text-text-muted">or $29.99/yr</div>
              </div>
              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-3 text-sm text-text-main font-bold"><Check className="w-4 h-4 text-brand-primary" /> Unlimited Daily Extractions</li>
                <li className="flex items-center gap-3 text-sm text-text-main font-bold"><Check className="w-4 h-4 text-brand-primary" /> Priority API Processing</li>
              </ul>
              <button className="w-full py-4 rounded-xl font-bold bg-brand-primary text-white shadow-lg transition-all">Coming Soon</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0F1117] text-white py-20">
         <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <Palette className="text-brand-primary w-6 h-6" />
              <span className="text-xl font-bold">PaletteIQ</span>
            </div>
            <p className="text-gray-400 max-w-sm mb-8">
              The ultimate color intelligence tool for data professionals. Extract, analyze, and export professional palettes in seconds.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}