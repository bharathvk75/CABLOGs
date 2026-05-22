import React, { useCallback } from 'react';
import { Upload, FileType, FileWarning } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
  theme?: 'dark' | 'light';
}

export function FileUpload({ onFilesSelected, isProcessing, theme = 'dark' }: FileUploadProps) {
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    
    const files = Array.from(e.dataTransfer.files as unknown as File[]).filter(file => 
      file.type === 'image/jpeg' || 
      file.type === 'image/png' || 
      file.type === 'application/pdf'
    );
    onFilesSelected(files);
  }, [onFilesSelected, isProcessing]);

  return (
    <div 
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn(
        "border-2 border-dashed p-16 transition-all cursor-pointer rounded-2xl flex flex-col items-center justify-center group",
        theme === 'dark' 
          ? "bg-zinc-950 border-zinc-800 hover:border-white hover:bg-zinc-900" 
          : "bg-zinc-50 border-zinc-200 hover:border-zinc-900 hover:bg-white hover:shadow-xl",
        isProcessing && "opacity-50 cursor-not-allowed"
      )}
      onClick={() => {
        if (isProcessing) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*,.pdf';
        input.onchange = (e) => {
          const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
          onFilesSelected(files);
        };
        input.click();
      }}
    >
      <div className="flex flex-col items-center gap-6">
        <div className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center transition-all group-hover:scale-110 shadow-lg border",
          theme === 'dark' 
            ? "bg-zinc-900 border-zinc-800 text-zinc-500 group-hover:text-white group-hover:bg-black" 
            : "bg-white border-zinc-100 text-zinc-400 group-hover:text-zinc-900 shadow-sm"
        )}>
          <Upload className="w-8 h-8" />
        </div>
        <div className="text-center space-y-2">
          <p className={cn(
            "text-2xl font-black uppercase tracking-tighter italic",
            theme === 'dark' ? "text-white" : "text-zinc-900"
          )}>Select Batch Logs</p>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">Drag and drop JPG, PNG or PDF files</p>
        </div>
      </div>
    </div>
  );
}
