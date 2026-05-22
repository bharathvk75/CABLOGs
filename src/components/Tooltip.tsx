import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  theme?: 'dark' | 'light';
}

export function Tooltip({ content, children, theme = 'dark' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            className={cn(
              "absolute z-50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-xl border whitespace-nowrap -bottom-10 left-1/2 -translate-x-1/2 pointer-events-none",
              theme === 'dark' 
                ? "bg-white text-black border-white" 
                : "bg-zinc-900 text-white border-zinc-800"
            )}
          >
            {content}
            <div className={cn(
              "absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-l border-t",
              theme === 'dark' ? "bg-white border-white" : "bg-zinc-900 border-zinc-800"
            )} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
