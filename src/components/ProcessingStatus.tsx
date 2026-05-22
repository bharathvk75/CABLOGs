import { motion } from 'motion/react';

interface ProcessingStatusProps {
  progress: number;
  total: number;
  current: number;
  message?: string;
}

export function ProcessingStatus({ progress, total, current, message }: ProcessingStatusProps) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-8 shadow-2xl">
        <h2 className="text-2xl font-bold uppercase tracking-tighter mb-2 italic">Processing Batch</h2>
        <div className="flex justify-between text-xs font-mono text-zinc-500 mb-4 font-bold uppercase tracking-widest">
          <span>ITEM {current} OF {total}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        
        <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden mb-6">
          <motion.div 
            className="h-full bg-white"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        
        <p className="text-[11px] font-mono font-black uppercase tracking-widest text-zinc-400 animate-pulse">{message || "Extracting handwriting with AI..."}</p>
      </div>
    </div>
  );
}
