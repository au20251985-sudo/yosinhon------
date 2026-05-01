import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, Crosshair } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface GameObject extends Point {
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface Enemy extends GameObject {
  health: number;
  maxHealth: number;
  type: 'basic' | 'fast' | 'tank';
}

interface Particle extends GameObject {
  life: number;
  alpha: number;
}

interface Skin {
  id: string;
  name: string;
  color: string;
  cost: number;
  shape: 'triangle' | 'square' | 'circle' | 'diamond' | 'star';
}

const SKINS: Skin[] = [
  { id: 'default', name: 'CYAN NEON', color: '#00ffff', cost: 0, shape: 'triangle' },
  { id: 'lava', name: 'LAVA BLAZE', color: '#ff4500', cost: 25, shape: 'triangle' },
  { id: 'gold', name: 'GOLD STRIKE', color: '#ffd700', cost: 5, shape: 'diamond' },
  { id: 'matrix', name: 'GHOST GREEN', color: '#00ff41', cost: 10, shape: 'square' },
  { id: 'pulse', name: 'VIOLET PULSE', color: '#d400ff', cost: 15, shape: 'circle' },
  { id: 'ruby', name: 'RUBY STAR', color: '#ff0033', cost: 20, shape: 'star' },
];

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // High-frequency values moved to Refs to avoid re-renders
  const scoreRef = useRef(0);
  const coinsRef = useRef(() => {
    const saved = localStorage.getItem('neon-strike-coins');
    return saved ? parseInt(saved, 10) : 0;
  });
  const levelRef = useRef(1);

  // Still use state for UI that doesn't update every frame (menus, etc.)
  const [scoreUI, setScoreUI] = useState(0);
  const [levelUI, setLevelUI] = useState(1);
  const [coinsUI, setCoinsUI] = useState(() => {
    const saved = localStorage.getItem('neon-strike-coins');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('neon-strike-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });
  
  const [purchasedSkins, setPurchasedSkins] = useState<string[]>(() => {
    const saved = localStorage.getItem('neon-strike-skins');
    return saved ? JSON.parse(saved) : ['default'];
  });

  const [activeSkinId, setActiveSkinId] = useState(() => {
    return localStorage.getItem('neon-strike-active-skin') || 'default';
  });

  const activeSkin = SKINS.find(s => s.id === activeSkinId) || SKINS[0];

  const [isGameOver, setIsGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showStore, setShowStore] = useState(false);

  // Sync refs to state for HUD display periodically (less often than every frame)
  useEffect(() => {
    if (!gameStarted || isGameOver) return;
    
    const interval = setInterval(() => {
      setScoreUI(scoreRef.current);
      setLevelUI(levelRef.current);
      setCoinsUI(coinsRef.current instanceof Function ? coinsRef.current() : coinsRef.current);
    }, 100); // 10 times per second is enough for HUD
    
    return () => clearInterval(interval);
  }, [gameStarted, isGameOver]);

  // Game state refs (to avoid re-renders)
  const player = useRef<GameObject>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 15,
    color: activeSkin.color
  });

  const mouse = useRef<Point>({ x: 0, y: 0 });
  const keys = useRef<Record<string, boolean>>({});
  const bullets = useRef<GameObject[]>([]);
  const enemies = useRef<Enemy[]>([]);
  const gameCoins = useRef<GameObject[]>([]);
  const particles = useRef<Particle[]>([]);
  const frameId = useRef<number>(0);
  const lastSpawnTime = useRef<number>(0);
  const lastCoinSpawnTime = useRef<number>(0);
  const spawnRate = useRef<number>(2000); // ms

  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    player.current = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: 0,
      vy: 0,
      radius: 15,
      color: activeSkin.color
    };

    bullets.current = [];
    enemies.current = [];
    gameCoins.current = [];
    particles.current = [];
    scoreRef.current = 0;
    levelRef.current = 1;
    setScoreUI(0);
    setLevelUI(1);
    setIsGameOver(false);
    spawnRate.current = 2000;
  }, [activeSkin.color]);

  const spawnCoin = useCallback((width: number, height: number) => {
    gameCoins.current.push({
      x: Math.random() * (width - 60) + 30,
      y: Math.random() * (height - 60) + 30,
      vx: 0,
      vy: 0,
      radius: 8,
      color: '#ffd700'
    });
  }, []);

  const spawnEnemy = useCallback((width: number, height: number) => {
    const side = Math.floor(Math.random() * 4);
    let x, y;

    if (side === 0) { x = Math.random() * width; y = -50; }
    else if (side === 1) { x = width + 50; y = Math.random() * height; }
    else if (side === 2) { x = Math.random() * width; y = height + 50; }
    else { x = -50; y = Math.random() * height; }

    const speedMultiplier = 1.8 + levelRef.current * 0.2; // Even higher base speed
    const typeRoll = Math.random();
    let type: Enemy['type'] = 'basic';
    let health = 1;
    let radius = 15;
    let color = '#ff00ff';
    let speed = (2.5 + Math.random() * 2.0) * speedMultiplier;

    if (typeRoll > 0.85) {
      type = 'tank';
      health = 3;
      radius = 25;
      color = '#ff0000';
      speed = 1.5 * speedMultiplier;
    } else if (typeRoll > 0.65) {
      type = 'fast';
      health = 1;
      radius = 12;
      color = '#ffff00';
      speed = 4.5 * speedMultiplier;
    }

    const angle = Math.atan2(player.current.y - y, player.current.x - x);

    enemies.current.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      color,
      health,
      maxHealth: health,
      type
    });
  }, []);

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      particles.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 1,
        color,
        life: 1,
        alpha: 1
      });
    }
  };

  const update = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas || isGameOver || !gameStarted) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Movement - Handled directly in mousemove for maximum responsiveness
    // But we still pulse the color here
    player.current.color = activeSkin.color;

    // Bounds check
    if (player.current.x < player.current.radius) player.current.x = player.current.radius;
    if (player.current.x > canvas.width - player.current.radius) player.current.x = canvas.width - player.current.radius;
    if (player.current.y < player.current.radius) player.current.y = player.current.radius;
    if (player.current.y > canvas.height - player.current.radius) player.current.y = canvas.height - player.current.radius;

    // Survival Score
    scoreRef.current += 1;
    if (scoreRef.current % 1000 === 0) {
      levelRef.current += 1;
    }

    // Spawn enemies - Faster rate for more chaos
    if (time - lastSpawnTime.current > spawnRate.current) {
      spawnEnemy(canvas.width, canvas.height);
      lastSpawnTime.current = time;
      spawnRate.current = Math.max(400, 2000 - levelRef.current * 150);
    }

    // Spawn coins
    if (time - lastCoinSpawnTime.current > 3000) {
      spawnCoin(canvas.width, canvas.height);
      lastCoinSpawnTime.current = time;
    }

    // Update particles
    particles.current = particles.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      p.alpha = Math.max(0, p.life);
      return p.life > 0;
    });

    // Update enemies and collisions
    enemies.current = enemies.current.filter(e => {
      const angle = Math.atan2(player.current.y - e.y, player.current.x - e.x); 
      const currentSpeed = Math.sqrt(e.vx * e.vx + e.vy * e.vy); 
      e.vx = Math.cos(angle) * currentSpeed;
      e.vy = Math.sin(angle) * currentSpeed;

      e.x += e.vx;
      e.y += e.vy;

      const pdx = e.x - player.current.x;
      const pdy = e.y - player.current.y;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pDist < e.radius + player.current.radius) {
        setScoreUI(scoreRef.current); // Final sync
        setIsGameOver(true);
        createExplosion(player.current.x, player.current.y, player.current.color);
      }

      const buffer = 100;
      if (e.x < -buffer || e.x > canvas.width + buffer || e.y < -buffer || e.y > canvas.height + buffer) {
        return false;
      }

      return true;
    });

    // Update coins
    gameCoins.current = gameCoins.current.filter(c => {
      const dx = c.x - player.current.x;
      const dy = c.y - player.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < c.radius + player.current.radius) {
        const val = typeof coinsRef.current === 'function' ? coinsRef.current() : coinsRef.current;
        const nextCoins = val + 1;
        coinsRef.current = nextCoins;
        localStorage.setItem('neon-strike-coins', nextCoins.toString());
        createExplosion(c.x, c.y, c.color);
        return false;
      }
      return true;
    });

    // Render
    ctx.fillStyle = 'rgba(10, 10, 15, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid Background
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw Particles
    particles.current.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Draw Enemies
    enemies.current.forEach(e => {
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 15;
      ctx.shadowColor = e.color;
      
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = e.color;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      
      ctx.shadowBlur = 0;
    });

    // Draw Coins
    gameCoins.current.forEach(c => {
      ctx.fillStyle = c.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = c.color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', c.x, c.y);
      
      ctx.shadowBlur = 0;
    });

    // Draw Player
    const playerAngle = Math.atan2(mouse.current.y - player.current.y, mouse.current.x - player.current.x);
    ctx.save();
    ctx.translate(player.current.x, player.current.y);
    ctx.rotate(playerAngle);
    ctx.strokeStyle = player.current.color;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 20;
    ctx.shadowColor = player.current.color;
    ctx.beginPath();
    
    const r = player.current.radius;
    if (activeSkin.shape === 'square') { ctx.strokeRect(-r, -r, r * 2, r * 2); }
    else if (activeSkin.shape === 'circle') { ctx.arc(0, 0, r, 0, Math.PI * 2); }
    else if (activeSkin.shape === 'diamond') {
      ctx.moveTo(r * 1.5, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r); ctx.closePath();
    } else if (activeSkin.shape === 'star') {
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(Math.cos((i * 72 * Math.PI) / 180) * r * 1.5, Math.sin((i * 72 * Math.PI) / 180) * r * 1.5);
        ctx.lineTo(Math.cos(((i * 72 + 36) * Math.PI) / 180) * r * 0.5, Math.sin(((i * 72 + 36) * Math.PI) / 180) * r * 0.5);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(r, 0); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r); ctx.closePath();
    }
    
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;

    frameId.current = requestAnimationFrame(update);
  };

  const shoot = () => {};

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const handleKeyDown = (e: KeyboardEvent) => keys.current[e.key] = true;
    const handleKeyUp = (e: KeyboardEvent) => keys.current[e.key] = false;
    const handleMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      // Instant movement response
      if (gameStarted && !isGameOver) {
        player.current.x = e.clientX;
        player.current.y = e.clientY;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    frameId.current = requestAnimationFrame(update);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(frameId.current);
    };
  }, [isGameOver, gameStarted]);

  useEffect(() => {
    if (isGameOver && scoreRef.current > highScore) {
      setHighScore(scoreRef.current);
      localStorage.setItem('neon-strike-highscore', scoreRef.current.toString());
    }
  }, [isGameOver, highScore]);

  const buySkin = (id: string, cost: number) => {
    const currentCoins = typeof coinsRef.current === 'function' ? coinsRef.current() : coinsRef.current;
    if (currentCoins >= cost && !purchasedSkins.includes(id)) {
      const nextCoins = currentCoins - cost;
      const nextSkins = [...purchasedSkins, id];
      coinsRef.current = nextCoins;
      setCoinsUI(nextCoins);
      setPurchasedSkins(nextSkins);
      setActiveSkinId(id);
      localStorage.setItem('neon-strike-coins', nextCoins.toString());
      localStorage.setItem('neon-strike-skins', JSON.stringify(nextSkins));
      localStorage.setItem('neon-strike-active-skin', id);
    } else if (purchasedSkins.includes(id)) {
      setActiveSkinId(id);
      localStorage.setItem('neon-strike-active-skin', id);
    }
  };

  const startGame = () => {
    initGame();
    setGameStarted(true);
  };

  return (
    <div className="relative w-full h-screen bg-[#0a0a0f] overflow-hidden font-sans selection:bg-cyan-500/30">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block cursor-none"
      />

      {/* HUD */}
      {gameStarted && !isGameOver && (
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start pointer-events-none z-10">
          <div className="space-y-1">
            <div className="text-4xl font-black text-white tracking-tighter uppercase italic">
              {scoreUI.toLocaleString()}
            </div>
            <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Level {levelUI}
            </div>
          </div>
          
          <div className="text-right flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
              <span className="text-yellow-400 font-black text-lg">
                {coinsUI.toLocaleString()}
              </span>
              <div className="w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] text-black font-bold">
                $
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">High Score</div>
              <div className="text-xl font-bold text-white tracking-tight italic">
                {highScore.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Cursor */}
      {!isGameOver && gameStarted && (
        <motion.div
          className="fixed pointer-events-none z-50 mix-blend-screen"
          animate={{ x: mouse.current.x - 20, y: mouse.current.y - 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 400, mass: 0.1 }}
        >
          <div className="relative w-10 h-10 flex items-center justify-center">
            <div className="absolute w-full h-full border-2 border-cyan-400/50 rounded-full animate-ping opacity-20" />
            <Crosshair className="text-cyan-400 w-6 h-6" />
          </div>
        </motion.div>
      )}

      {/* Menus */}
      <AnimatePresence>
        {!gameStarted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 overflow-y-auto pt-40 pb-20"
          >
            <div className="text-center space-y-10 max-w-2xl px-6 w-full">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="bg-yellow-400 text-black px-4 py-1 rounded-full font-black text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(250,204,21,0.3)]">
                    <div className="w-3 h-3 bg-black rounded-full flex items-center justify-center text-[8px] text-yellow-400 font-bold">
                      $
                    </div>
                    {coinsUI}
                  </div>
                </div>
                <h1 className="text-8xl font-black text-white italic uppercase tracking-tighter leading-none mb-4">
                  NEON<br />
                  <span className="text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]">STRIKE</span>
                </h1>
                <p className="text-white/40 uppercase tracking-[0.3em] font-bold text-[10px]">
                  Experimental Survival Protocol • v2.0
                </p>
              </motion.div>

              <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] backdrop-blur space-y-8">
                <div className="text-xs font-black text-cyan-400 uppercase tracking-widest text-left mb-2 px-2">Vessel configuration</div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {SKINS.map((skin) => (
                    <motion.button
                      key={skin.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => buySkin(skin.id, skin.cost)}
                      className={`relative aspect-square rounded-2xl flex items-center justify-center transition-all ${
                        activeSkinId === skin.id 
                          ? 'bg-white/20 ring-2 ring-white/50' 
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div 
                        className="w-1/2 h-1/2 opacity-80"
                        style={{ 
                          backgroundColor: skin.id === 'default' ? 'transparent' : skin.color,
                          border: `2px solid ${skin.color}`,
                          boxShadow: `0 0 10px ${skin.color}40`,
                          borderRadius: skin.shape === 'circle' ? '50%' : skin.shape === 'square' ? '4px' : '0'
                        }}
                      />
                      {!purchasedSkins.includes(skin.id) && (
                        <div className="absolute inset-0 bg-black/60 rounded-2xl flex flex-col items-center justify-center p-1">
                          <div className="text-[10px] font-black text-yellow-400">${skin.cost}</div>
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>
                
                <div className="flex flex-col gap-4 items-center pt-4">
                  <motion.button
                    whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(34,211,238,0.5)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={startGame}
                    className="w-full bg-cyan-400 text-black font-black py-5 px-12 rounded-3xl uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all text-xl"
                  >
                    <Play className="fill-current w-6 h-6" />
                    Engage Mission
                  </motion.button>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="space-y-2 opacity-40 uppercase tracking-[0.2em] font-bold text-[9px] text-white"
              >
                <div>Hold Mouse to Steer • Dodge All Spheres</div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {isGameOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-xl z-30"
          >
            <div className="text-center space-y-8">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="space-y-2"
              >
                <h2 className="text-6xl font-black text-red-500 uppercase tracking-tighter italic">Mission Failed</h2>
                <p className="text-white/50 uppercase tracking-[0.2em] font-bold text-xs">System Overload Detected</p>
              </motion.div>

              <div className="bg-white/5 rounded-3xl p-10 backdrop-blur border border-white/10 space-y-6">
                <div className="flex justify-between gap-12 items-center">
                  <div className="text-left">
                    <div className="text-xs font-bold text-white/30 uppercase tracking-widest mb-1">Final Score</div>
                    <div className="text-5xl font-black text-white italic">{scoreUI.toLocaleString()}</div>
                  </div>
                  <Trophy className="text-yellow-400 w-12 h-12" />
                </div>
                
                {scoreUI >= highScore && scoreUI > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-yellow-400/10 text-yellow-400 py-2 px-4 rounded-full text-xs font-black uppercase tracking-widest border border-yellow-400/20"
                  >
                    New Personal Best!
                  </motion.div>
                )}

                <div className="flex flex-col gap-3 pt-4">
                  <button
                    onClick={startGame}
                    className="bg-white text-black font-black py-4 px-10 rounded-2xl uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-cyan-400 transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Reboot Neural Link
                  </button>
                  <button
                    onClick={() => setGameStarted(false)}
                    className="text-white/50 font-bold py-2 hover:text-white transition-colors uppercase tracking-widest text-[10px]"
                  >
                    Return to Hub
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000_100%)]" />
    </div>
  );
}
