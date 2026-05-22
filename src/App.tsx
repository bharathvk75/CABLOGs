/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  FileText,
  Settings,
  Download,
  Trash2,
  ChevronRight,
  Search,
  Database,
  Cpu,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileCode,
  LayoutGrid,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUpload } from './components/FileUpload';
import { ProcessingStatus } from './components/ProcessingStatus';
import { ReviewForm } from './components/ReviewForm';
import { Tooltip } from './components/Tooltip';
import { TripRecord } from './types';
import { pdfToImages } from './lib/pdfProcessor';
import { processWithGemini, processWithLMStudio } from './lib/ai';
import { exportToExcel, exportToCSV } from './lib/excelExport';
import { DEFAULT_API_BASE_URL, DEFAULT_MINIMUM_KMS, DEFAULT_BASIC_PKG_AMT } from './constants';
import { cn } from './lib/utils';
import { getDBRecords, syncDBRecords, getImageHash } from './lib/db';

async function resizeAndCompressImage(base64Str: string, maxDim = 1600): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% JPEG quality
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
    img.src = base64Str;
  });
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<TripRecord[]>([]);
  const [processing, setProcessing] = useState({ active: false, total: 0, current: 0, message: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [useGemini, setUseGemini] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [lmStudioToken, setLmStudioToken] = useState(import.meta.env.VITE_LM_STUDIO_API_TOKEN || '');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [imageRotation, setImageRotation] = useState(0);
  const [imageScale, setImageScale] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [extractionQueue, setExtractionQueue] = useState<string[]>([]);
  const [isExtractionPaused, setIsExtractionPaused] = useState(false);
  const [currentlyExtracting, setCurrentlyExtracting] = useState<string[]>([]);

  // Load records from DB on mount and sync to physical disk
  useEffect(() => {
    getDBRecords().then(async loadedRecords => {
      if (loadedRecords && loadedRecords.length > 0) {
        setRecords(loadedRecords);

        // Detect and sync any processing records to the physical imagere folder silently
        const processingRecords = loadedRecords.filter(r => r.status === 'processing');
        if (processingRecords.length > 0) {
          console.log(`[Vite Middleware] Syncing ${processingRecords.length} active logs to /imagere...`);
          
          // Hydrate the active queue and trigger extraction automatically
          setExtractionQueue(processingRecords.map(r => r.id));
          setProcessing({
            active: true,
            total: processingRecords.length,
            current: 0,
            message: 'Resuming extraction...'
          });

          // Sync asynchronously to not block UI
          (async () => {
            for (const record of processingRecords) {
              if (!record.image_url) continue;
              
              let fileName = `${record.id}.jpg`;
              if (record["BOOKING ID"] && record["BOOKING ID"].trim()) {
                fileName = `${record["BOOKING ID"].trim().replace('#', '')}.jpg`;
              }
              
              try {
                await fetch('/api/save-image', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fileName, base64: record.image_url })
                });
                console.log(`[Vite] Synced existing image ${fileName} to disk`);
              } catch (err) {
                console.error(`[Vite] Failed to sync ${fileName} to disk`, err);
              }
            }
            console.log(`[Vite Middleware] Done syncing existing files to /imagere/`);
          })();
        }
      }
      setIsLoaded(true);
    });
  }, []);

  // Sync state to DB on updates
  useEffect(() => {
    if (isLoaded) {
      syncDBRecords(records);
    }
  }, [records, isLoaded]);

  useEffect(() => {
    setImageRotation(0);
    setImageScale(1);
  }, [selectedId]);

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'total_amt' | 'log_sheet_no'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterCabType, setFilterCabType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredAndSortedRecords = useMemo(() => {
    let result = records.filter(r => {
      const matchesSearch =
        r["Driver name"]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r["Cab No."]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r["BOOKING ID"]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r["Drop Address"]?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCabType = filterCabType === 'all' || r.Category?.toLowerCase() === filterCabType.toLowerCase();
      const matchesStatus = filterStatus === 'all' || r.status === filterStatus;

      return matchesSearch && matchesCabType && matchesStatus;
    });

    return result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        const dateA = a.DATE ? new Date(a.DATE.split('-').reverse().join('-')).getTime() : 0;
        const dateB = b.DATE ? new Date(b.DATE.split('-').reverse().join('-')).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortBy === 'total_amt') {
        comparison = (parseFloat(a["Total Amt"]) || 0) - (parseFloat(b["Total Amt"]) || 0);
      } else if (sortBy === 'log_sheet_no') {
        comparison = (a["BOOKING ID"] || "").localeCompare(b["BOOKING ID"] || "");
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [records, searchQuery, sortBy, sortOrder, filterCabType, filterStatus]);

  // Grouped by Month for UI Display
  const groupedRecords = useMemo(() => {
    const groups: Record<string, TripRecord[]> = {};
    filteredAndSortedRecords.forEach(r => {
      let key = 'Pending / Unknown';

      if (r.status === 'processing') {
        key = 'Extracting Logs';
      } else if (r.status === 'error') {
        key = 'Failed Logs';
      } else if (!r.isReviewed) {
        key = 'UNchecked Logs';
      } else if (r.DATE) {
        const parts = r.DATE.split('-');
        if (parts.length === 3) {
          const month = parseInt(parts[1]);
          const monthName = new Date(2000, month - 1).toLocaleString('default', { month: 'long' });
          key = `${monthName} ${parts[2]}`;
        }
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    const sortedEntries = Object.entries(groups).sort((a, b) => {
      const order = ['Extracting Logs', 'Failed Logs', 'UNchecked Logs'];
      const indexA = order.indexOf(a[0]);
      const indexB = order.indexOf(b[0]);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      if (a[0] === 'Pending / Unknown') return 1;
      if (b[0] === 'Pending / Unknown') return -1;

      // Parse "Month Year" for chronological sorting
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime();
      }
      return b[0].localeCompare(a[0]);
    });

    // Auto-expand first group if it's the first time
    if (sortedEntries.length > 0 && expandedMonths.size === 0) {
      setExpandedMonths(new Set([sortedEntries[0][0]]));
    }

    return sortedEntries;
  }, [filteredAndSortedRecords]);

  const cabTypes = useMemo(() => {
    const types = new Set(records.map(r => r.Category).filter(Boolean));
    return ['all', ...Array.from(types)];
  }, [records]);

  const selectedRecord = useMemo(() =>
    records.find(r => r.id === selectedId), [records, selectedId]
  );

  // Effect to process the extraction queue
  useEffect(() => {
    if (isExtractionPaused) return;
    if (extractionQueue.length === 0) return;
    
    // Process 2 extractions concurrently
    const maxConcurrency = 2;
    if (currentlyExtracting.length >= maxConcurrency) return;

    // Get next item in queue that isn't already running
    const nextId = extractionQueue.find(id => !currentlyExtracting.includes(id));
    if (!nextId) return;

    const record = records.find(r => r.id === nextId);
    if (!record) {
      // Clean up if record doesn't exist
      setExtractionQueue(prev => prev.filter(id => id !== nextId));
      return;
    }

    // Add to currently extracting list
    setCurrentlyExtracting(prev => [...prev, nextId]);
    
    (async () => {
      try {
        const engineLabel = useGemini ? 'GEMINI' : 'LOCAL AI';
        setProcessing(prev => ({ 
          active: true, 
          total: prev.active ? prev.total : extractionQueue.length, 
          current: prev.active ? prev.current : 0, 
          message: `[${engineLabel}] EXTRACTING: ${nextId.toUpperCase()}` 
        }));

        const aiData = useGemini 
          ? await processWithGemini(record.image_url)
          : await processWithLMStudio(record.image_url, apiBaseUrl, lmStudioToken);

        if (!aiData) throw new Error('AI returned no data');

        setRecords(prev => prev.map(r => r.id === nextId ? {
          ...r,
          ...aiData,
          status: 'completed' as const,
          "Extra Kms": Math.max(0, (parseFloat(aiData["Total Kms"]) || 0) - (parseFloat(r["Minimun Kms"]) || 0)).toString(),
          "Total Amt": (
            (parseFloat(r["Basic Pkg Amt."]) || 19) + 
            (Math.max(0, (parseFloat(aiData["Total Kms"]) || 0) - (parseFloat(r["Minimun Kms"]) || 0)) * (parseFloat(r["Extra Kms Amt"]) || 0)) + 
            (parseFloat(aiData["Toll&Parking"]) || 0)
          ).toFixed(2)
        } : r));

        // Delete from local physical imagere queue since extraction is successful!
        try {
          const namesToDelete = [
            `${record.id}.jpg`,
            record["BOOKING ID"] ? `${record["BOOKING ID"].trim().replace('#', '')}.jpg` : null,
            aiData["BOOKING ID"] ? `${aiData["BOOKING ID"].trim().replace('#', '')}.jpg` : null,
          ].filter(Boolean) as string[];

          namesToDelete.forEach(name => {
            fetch('/api/delete-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: name })
            }).catch(e => console.warn(`[Vite] Failed to delete queue image: ${name}`, e));
          });
        } catch (delErr) {
          console.error(`[Vite] Error initiating file deletion`, delErr);
        }
      } catch (err) {
        setRecords(prev => prev.map(r => r.id === nextId ? {
          ...r,
          status: 'error' as const,
          error_message: err instanceof Error ? err.message : String(err)
        } : r));
      } finally {
        // Remove from currently extracting and from queue
        setCurrentlyExtracting(prev => prev.filter(id => id !== nextId));
        setExtractionQueue(prev => prev.filter(id => id !== nextId));
        setProcessing(prev => {
          const newCurrent = prev.current + 1;
          const isActive = newCurrent < prev.total;
          return {
            ...prev,
            current: newCurrent,
            active: isActive,
            message: isActive ? `Extracted ${newCurrent}/${prev.total}` : 'Batch Complete'
          };
        });
      }
    })();
  }, [extractionQueue, isExtractionPaused, currentlyExtracting, records, useGemini, apiBaseUrl, lmStudioToken]);

  const retryExtraction = useCallback((id: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'processing', error_message: undefined } : r));
    setExtractionQueue(prev => [...new Set([...prev, id])]);
  }, []);

  const retryAllErrors = useCallback(() => {
    const errorRecords = records.filter(r => r.status === 'error');
    if (errorRecords.length === 0) return;

    setRecords(prev => prev.map(r => r.status === 'error' ? { ...r, status: 'processing', error_message: undefined } : r));
    setExtractionQueue(prev => [...new Set([...prev, ...errorRecords.map(r => r.id)])]);
  }, [records]);

  const clearAllExtracting = useCallback(() => {
    if (confirm("Are you sure you want to delete all extracting logs? This will empty the queue and remove these logs from the app.")) {
      const extractingIds = records.filter(r => r.status === 'processing').map(r => r.id);
      setCurrentlyExtracting([]);
      setExtractionQueue(prev => prev.filter(id => !extractingIds.includes(id)));
      setRecords(prev => prev.filter(r => r.status !== 'processing'));
      if (selectedId && extractingIds.includes(selectedId)) {
        setSelectedId(null);
      }
      setProcessing({ active: false, total: 0, current: 0, message: '' });
    }
  }, [records, selectedId]);

  const syncExtractingToDisk = useCallback(async () => {
    const extractingRecords = records.filter(r => r.status === 'processing');
    if (extractingRecords.length === 0) {
      alert("No active extracting logs found to sync.");
      return;
    }
    
    console.log(`[Vite] Syncing ${extractingRecords.length} active logs to physical folder...`);
    
    // Asynchronously write to disk
    for (const record of extractingRecords) {
      if (!record.image_url) continue;
      
      let fileName = `${record.id}.jpg`;
      if (record["BOOKING ID"] && record["BOOKING ID"].trim()) {
        fileName = `${record["BOOKING ID"].trim().replace('#', '')}.jpg`;
      }
      
      try {
        await fetch('/api/save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, base64: record.image_url })
        });
      } catch (err) {
        console.error(`[Vite] Failed to sync ${fileName} to disk`, err);
      }
    }
    alert(`Successfully synced ${extractingRecords.length} active images to c:\\Users\\warzo\\Desktop\\cablog\\imagere\\`);
  }, [records]);

  const restartExtracting = useCallback(() => {
    const extractingRecords = records.filter(r => r.status === 'processing');
    if (extractingRecords.length === 0) return;

    setCurrentlyExtracting([]);
    setIsExtractionPaused(false);
    setExtractionQueue(extractingRecords.map(r => r.id));
    setProcessing({
      active: true,
      total: extractingRecords.length,
      current: 0,
      message: 'Restarting extraction queue...'
    });
  }, [records]);

  const stats = useMemo(() => {
    let green = 0;   // Completed & Reviewed
    let yellow = 0;  // Completed & Unreviewed
    let blue = 0;    // Processing
    let red = 0;     // Error

    records.forEach(r => {
      if (r.status === 'processing') {
        blue++;
      } else if (r.status === 'error') {
        red++;
      } else if (r.status === 'completed') {
        if (r.isReviewed) {
          green++;
        } else {
          yellow++;
        }
      }
    });

    return { green, yellow, blue, red };
  }, [records]);

  const handleFiles = async (files: File[]) => {
    // 1. Convert files to URLs
    const newUrls: { url: string; file: File; hash: string }[] = [];
    const existingHashes = new Set(records.map(r => r.image_hash).filter(Boolean));

    setProcessing({
      active: true,
      total: files.length,
      current: 0,
      message: 'Reading documents...'
    });

    for (const file of files) {
      try {
        let imageUrls: string[] = [];
        if (file.type === 'application/pdf') {
          imageUrls = await pdfToImages(file);
        } else {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          imageUrls = [base64];
        }

        // Compress each image to max 1600px width/height to protect local AI memory and bandwidth
        const compressedUrls: string[] = [];
        let frameIdx = 0;
        for (const url of imageUrls) {
          setProcessing(prev => ({ ...prev, message: `Optimizing ${file.name}...` }));
          const compressed = await resizeAndCompressImage(url, 1600);
          compressedUrls.push(compressed);

          // Determine the physical filename
          let saveName = file.name;
          if (file.type === 'application/pdf') {
            saveName = `${file.name.replace(/\.[^/.]+$/, "")}_page_${frameIdx + 1}.jpg`;
          } else {
            // Ensure proper image extension
            const extMatch = saveName.match(/\.[^/.]+$/);
            if (!extMatch) {
              saveName = `${saveName}.jpg`;
            }
          }

          // Trigger local physical disk save under /imagere folder silently
          try {
            await fetch('/api/save-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: saveName, base64: compressed })
            });
            console.log(`[Vite Middleware] Physically stored ${saveName} in /imagere/`);
          } catch (saveErr) {
            console.error(`[Vite Middleware] Failed to write file ${saveName} to /imagere/`, saveErr);
          }

          frameIdx++;
        }

        for (const url of compressedUrls) {
          const hash = getImageHash(url);
          if (existingHashes.has(hash)) {
            setProcessing(prev => {
              const newCurrent = prev.current + 1;
              const isActive = newCurrent < prev.total;
              return {
                ...prev,
                current: newCurrent,
                active: isActive,
                message: isActive ? `Skipping duplicate: ${file.name}` : 'Batch Complete'
              };
            });
            continue;
          }
          existingHashes.add(hash);
          newUrls.push({ url, file, hash });
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (newUrls.length === 0) return;

    // 2. Set total processing count
    setProcessing({
      active: true,
      total: newUrls.length,
      current: 0,
      message: 'Starting extraction...'
    });

    // 3. Create records and add to queue
    let currentTotal = records.length;
    const recordsToAdd: TripRecord[] = [];

    for (const item of newUrls) {
      currentTotal++;
      const id = Math.random().toString(36).substr(2, 9);
      const newRecord: TripRecord = {
        id,
        image_url: item.url,
        image_hash: item.hash,
        "Sl.no": currentTotal,
        "BOOKING ID": '',
        "Category": 'Non-Premium',
        "DATE": '',
        "PASSENGER NAME": '',
        "PHONE/ID": '',
        "Driver name": '',
        "Cab No.": '',
        "Reporting address": '',
        "Drop Address": '',
        "Shift Time": '',
        "Duty type": '',
        "Basic Pkg Amt.": DEFAULT_BASIC_PKG_AMT,
        "Minimun Kms": DEFAULT_MINIMUM_KMS,
        "Total Kms": '0',
        "Extra Kms": '0',
        "Extra Kms Amt": '0',
        "Total Extra kms amt": '0',
        "Minimun Hrs": '0',
        "Total Hrs": '0',
        "Extra Hrs": '0',
        "Exta Hrs Amt": '0',
        "total Extra Hrs Amt": '0',
        "Toll&Parking": '0',
        "Total Amt": '0',
        status: 'processing',
        isReviewed: false
      };
      recordsToAdd.push(newRecord);
    }

    setRecords(prev => [...prev, ...recordsToAdd]);
    setExtractionQueue(prev => [...prev, ...recordsToAdd.map(r => r.id)]);
  };

  const updateRecord = (updated: TripRecord) => {
    setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleDone = (updated: TripRecord) => {
    updateRecord({ ...updated, isReviewed: true });
    setSelectedId(null);
  };

  const deleteRecord = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const clearAll = () => {
    if (confirm("Delete all records?")) {
      setRecords([]);
      setSelectedId(null);
    }
  };

  return (
    <div className={cn(
      "min-h-screen font-sans selection:bg-zinc-500 selection:text-white transition-colors duration-300 no-scrollbar",
      theme === 'dark' ? "bg-black text-white" : "bg-white text-zinc-900"
    )}>
      {/* Navigation */}
      <nav className={cn(
        "h-20 border-b flex items-center justify-between px-8 sticky top-0 backdrop-blur-xl z-40 transition-colors",
        theme === 'dark' ? "bg-black/80 border-zinc-900" : "bg-white/80 border-zinc-200 shadow-sm"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-10 h-10 flex items-center justify-center transition-colors",
            theme === 'dark' ? "bg-white text-black" : "bg-zinc-900 text-white"
          )}>
            <span className="font-black italic text-xl">CL</span>
          </div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">CabLog</h1>

          {processing.active && (
            <div className="hidden md:flex items-center gap-3 ml-6 bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800">
              <Loader2 className={cn("w-3 h-3 text-zinc-500", !isExtractionPaused && "animate-spin")} />
              <span className={cn(
                "text-[10px] font-mono font-bold uppercase tracking-widest transition-colors min-w-[70px]",
                theme === 'dark' ? "text-zinc-500" : "text-zinc-600"
              )}>
                {isExtractionPaused ? "PAUSED" : (processing.message || `Processing ${processing.current}/${processing.total}`)}
              </span>
              <div className="w-16 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-zinc-900 dark:bg-white"
                  animate={{ width: `${processing.total > 0 ? (processing.current / processing.total) * 100 : 0}%` }}
                />
              </div>
              <span className={cn(
                "text-[10px] font-mono font-bold w-8 text-right mr-1",
                theme === 'dark' ? "text-white" : "text-zinc-900"
              )}>
                {processing.total > 0 ? Math.round((processing.current / processing.total) * 100) : 0}%
              </span>
              {extractionQueue.length > 0 && (
                <button
                  onClick={() => setIsExtractionPaused(!isExtractionPaused)}
                  className={cn(
                    "p-1 rounded-full transition-colors flex items-center justify-center",
                    theme === 'dark' ? "hover:bg-zinc-800 text-zinc-400 hover:text-white" : "hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900"
                  )}
                  title={isExtractionPaused ? "Resume Extraction" : "Pause Extraction"}
                >
                  {isExtractionPaused ? (
                    <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  ) : (
                    <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle Theme"
            className={cn(
              "p-2 transition-colors border border-transparent rounded-full",
              theme === 'dark' ? "hover:bg-zinc-900 hover:border-zinc-800 text-zinc-400 hover:text-white" : "hover:bg-zinc-100 hover:border-zinc-200 text-zinc-600 hover:text-zinc-900"
            )}
          >
            {theme === 'dark' ? <RefreshCcw className="w-5 h-5 rotate-180" /> : <Settings className="w-5 h-5" />}
          </button>

          <div className={cn("h-6 w-px mx-1", theme === 'dark' ? "bg-zinc-800" : "bg-zinc-200")} />

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFiles(Array.from(e.target.files));
              }
            }}
            multiple
            accept="image/*,application/pdf"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "px-4 py-2 text-sm font-bold uppercase transition-all flex items-center gap-2 rounded-lg shadow-sm border cursor-pointer",
              theme === 'dark' 
                ? "bg-zinc-950 hover:bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white" 
                : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-950 hover:border-zinc-300 hover:ring-4 hover:ring-zinc-50"
            )}
            title="Import Duty Slip Files (Images or PDFs)"
          >
            <Database className="w-4 h-4 text-blue-500 animate-pulse" />
            <span>Import Logs</span>
          </button>

          <button
            onClick={() => exportToCSV(records.filter(r => r.status === 'completed'))}
            disabled={records.length === 0}
            title="Export CSV"
            className={cn(
              "p-2 transition-colors border border-transparent rounded-full disabled:opacity-30",
              theme === 'dark' ? "hover:bg-zinc-900 hover:border-zinc-800 text-zinc-400 hover:text-white" : "hover:bg-zinc-100 hover:border-zinc-200 text-zinc-600 hover:text-zinc-900"
            )}
          >
            <FileCode className="w-5 h-5" />
          </button>

          <button
            onClick={() => exportToExcel(records.filter(r => r.status === 'completed'))}
            disabled={records.length === 0}
            className={cn(
              "px-4 py-2 text-sm font-bold uppercase transition-all disabled:opacity-50 flex items-center gap-2 rounded-lg shadow-sm border",
              theme === 'dark' ? "bg-white text-black hover:bg-zinc-200 border-white" : "bg-zinc-900 text-white hover:bg-black border-zinc-900"
            )}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel Export</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-2 transition-colors border border-transparent rounded-full",
              theme === 'dark' ? "hover:bg-zinc-900 hover:border-zinc-800 text-zinc-400 hover:text-white" : "hover:bg-zinc-100 hover:border-zinc-200 text-zinc-600 hover:text-zinc-900"
            )}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </nav>

      <main className="flex">
        {/* Sidebar / List View */}
        <div className={cn(
          "h-[calc(100vh-80px)] overflow-y-auto border-r transition-all no-scrollbar",
          theme === 'dark' ? "border-zinc-800" : "border-zinc-200",
          selectedId ? "hidden" : "w-full max-w-7xl mx-auto p-6 md:p-12"
        )}>
          {!selectedId && records.length > 0 && (
            <div className="mb-10 space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-5xl font-black uppercase tracking-tighter italic">Fleet Logs</h2>
                  <p className={cn(
                    "font-mono text-[10px] uppercase font-bold tracking-[0.2em] mt-2 transition-colors",
                    theme === 'dark' ? "text-zinc-500" : "text-zinc-600"
                  )}>{filteredAndSortedRecords.length} / {records.length} Entries Ready</p>
                </div>
                <button
                  onClick={clearAll}
                  className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 hover:text-red-500 transition-colors bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-full"
                >
                  Reset DB
                </button>
              </div>

              {/* Search & Filters */}
              <div className={cn(
                "grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border rounded-2xl shadow-sm",
                theme === 'dark' ? "bg-zinc-950/50 border-zinc-900" : "bg-zinc-50/50 border-zinc-200"
              )}>
                <div className="relative">
                  <Tooltip content="SEARCH LOGS BY ANY CRITERIA" theme={theme}>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="SEARCH FOR ANYTHING..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={cn(
                        "w-full border rounded-lg px-10 py-2.5 text-[10px] font-mono outline-none transition-all font-bold",
                        theme === 'dark' ? "bg-black border-zinc-800 focus:border-white text-white" : "bg-white border-zinc-200 focus:border-zinc-900 text-zinc-900 focus:ring-4 focus:ring-zinc-100 shadow-sm"
                      )}
                    />
                  </Tooltip>
                </div>

                <Tooltip content="FILTER BY CAR CATEGORY" theme={theme}>
                  <select
                    value={filterCabType}
                    onChange={(e) => setFilterCabType(e.target.value)}
                    className={cn(
                      "w-full border rounded-lg px-3 py-2 text-[10px] font-mono outline-none transition-all uppercase cursor-pointer font-bold",
                      theme === 'dark' ? "bg-black border-zinc-800 focus:border-white text-white" : "bg-white border-zinc-200 focus:border-zinc-900 text-zinc-900 focus:ring-4 focus:ring-zinc-100 shadow-sm"
                    )}
                  >
                    {cabTypes.map(type => (
                      <option key={type} value={type}>{type === 'all' ? 'CATEGORY: ALL' : `CAT: ${type}`}</option>
                    ))}
                  </select>
                </Tooltip>

                <div className="flex gap-2">
                  <Tooltip content="SORT FIELD" theme={theme}>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className={cn(
                        "flex-1 border rounded-lg px-3 py-2 text-[10px] font-mono outline-none transition-all uppercase cursor-pointer font-bold min-w-[120px]",
                        theme === 'dark' ? "bg-black border-zinc-800 focus:border-white text-white" : "bg-white border-zinc-200 focus:border-zinc-900 text-zinc-900 focus:ring-4 focus:ring-zinc-100 shadow-sm"
                      )}
                    >
                      <option value="date">SORT: DATE</option>
                      <option value="total_amt">SORT: AMOUNT</option>
                      <option value="log_sheet_no">SORT: BOOKING ID</option>
                    </select>
                  </Tooltip>
                  <Tooltip content="TOGGLE ASC/DESC" theme={theme}>
                    <button
                      onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className={cn(
                        "border rounded-lg px-3 py-2 text-[10px] font-mono transition-all font-bold h-full",
                        theme === 'dark' ? "bg-black border-zinc-800 hover:border-white" : "bg-white border-zinc-200 hover:border-zinc-900 shadow-sm"
                      )}
                    >
                      {sortOrder === 'asc' ? 'ASC' : 'DESC'}
                    </button>
                  </Tooltip>
                </div>

                <Tooltip content="FILTER BY PROCESS STATUS" theme={theme}>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={cn(
                      "w-full border rounded-lg px-3 py-2 text-[10px] font-mono outline-none transition-all uppercase cursor-pointer font-bold",
                      theme === 'dark' ? "bg-black border-zinc-800 focus:border-white text-white" : "bg-white border-zinc-200 focus:border-zinc-900 text-zinc-900 focus:ring-4 focus:ring-zinc-100 shadow-sm"
                    )}
                  >
                    <option value="all">STATUS: ALL</option>
                    <option value="completed">COMPLETED</option>
                    <option value="processing">PROCESSING</option>
                    <option value="error">ERROR</option>
                  </select>
                </Tooltip>
              </div>

              {/* Status Counter Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Green (Verified) */}
                <div className={cn(
                  "p-3.5 border rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden",
                  theme === 'dark' ? "bg-zinc-950/50 border-zinc-900" : "bg-zinc-50/50 border-zinc-200"
                )}>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-black">Verified (Green)</span>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
                      <span className="text-2xl font-black font-mono leading-none">{stats.green}</span>
                    </div>
                  </div>
                </div>

                {/* Yellow (Unchecked) */}
                <div className={cn(
                  "p-3.5 border rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden",
                  theme === 'dark' ? "bg-zinc-950/50 border-zinc-900" : "bg-zinc-50/50 border-zinc-200"
                )}>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-black">Unchecked (Yellow)</span>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
                      <span className="text-2xl font-black font-mono leading-none">{stats.yellow}</span>
                    </div>
                  </div>
                </div>

                {/* Blue (Extracting) */}
                <div className={cn(
                  "p-3.5 border rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden",
                  theme === 'dark' ? "bg-zinc-950/50 border-zinc-900" : "bg-zinc-50/50 border-zinc-200"
                )}>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-black">Extracting (Blue)</span>
                    <div className="flex gap-1.5">
                      {stats.blue > 0 && (
                        <button 
                          onClick={syncExtractingToDisk}
                          className="px-1.5 py-0.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/10 rounded text-[8px] font-black uppercase font-mono tracking-wider transition-all cursor-pointer font-bold animate-pulse"
                          title="Sync active extracting logs to your computer disk folder"
                        >
                          Sync Files
                        </button>
                      )}
                      {stats.blue > 0 && (
                        <button 
                          onClick={clearAllExtracting}
                          className="px-1.5 py-0.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/10 rounded text-[8px] font-black uppercase font-mono tracking-wider transition-all cursor-pointer font-bold"
                          title="Delete all active extractions"
                        >
                          Clear All
                        </button>
                      )}
                      {stats.blue > 0 && (
                        <button 
                          onClick={restartExtracting}
                          className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-850 rounded text-[8px] font-black uppercase font-mono tracking-wider transition-all"
                          title="Restart all extracting ones from the first"
                        >
                          Restart
                        </button>
                      )}
                      {extractionQueue.length > 0 && (
                        <button 
                          onClick={() => setIsExtractionPaused(!isExtractionPaused)}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono tracking-wider transition-all",
                            isExtractionPaused 
                              ? "bg-blue-500 text-white hover:bg-blue-600" 
                              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-850"
                          )}
                          title={isExtractionPaused ? "Resume extraction queue" : "Pause extraction queue"}
                        >
                          {isExtractionPaused ? "Resume" : "Pause"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        extractionQueue.length > 0 && !isExtractionPaused ? "bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.6)]" : "bg-zinc-500"
                      )} />
                      <span className="text-2xl font-black font-mono leading-none">{stats.blue}</span>
                    </div>
                    {extractionQueue.length > 0 && (
                      <span className="text-[9px] font-mono text-zinc-400 font-bold">
                        {extractionQueue.length} Queued
                      </span>
                    )}
                  </div>
                </div>

                {/* Red (Failed) */}
                <div className={cn(
                  "p-3.5 border rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden",
                  theme === 'dark' ? "bg-zinc-950/50 border-zinc-900" : "bg-zinc-50/50 border-zinc-200"
                )}>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-black">Failed (Red)</span>
                    {stats.red > 0 && (
                      <button 
                        onClick={retryAllErrors}
                        className="px-1.5 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded text-[8px] font-black uppercase font-mono tracking-wider transition-all"
                        title="Retry all failed extractions"
                      >
                        Retry All
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        stats.red > 0 ? "bg-red-500 animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.6)]" : "bg-zinc-500"
                      )} />
                      <span className="text-2xl font-black font-mono leading-none">{stats.red}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {records.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto py-20 px-4"
            >
              <FileUpload onFilesSelected={handleFiles} isProcessing={false} theme={theme} />
              <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className={cn(
                  "p-10 border group transition-all rounded-2xl shadow-sm",
                  theme === 'dark' ? "bg-zinc-950 border-zinc-900 hover:border-zinc-700" : "bg-zinc-50 border-zinc-200 hover:border-zinc-300"
                )}>
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all group-hover:scale-110 group-hover:rotate-3 shadow-lg",
                    theme === 'dark' ? "bg-zinc-900 text-white group-hover:bg-white group-hover:text-black" : "bg-white text-zinc-900 group-hover:bg-zinc-900 group-hover:text-white"
                  )}>
                    <Cpu className="w-6 h-6 font-bold" />
                  </div>
                  <h3 className="font-black uppercase text-base tracking-tighter mb-3 italic">Autonomous OCR</h3>
                  <p className={cn(
                    "text-[11px] font-mono leading-relaxed uppercase font-bold",
                    theme === 'dark' ? "text-zinc-500" : "text-zinc-600"
                  )}>Process handwritten trip sheets with sub-second accuracy using Gemini AI or local LM Studio.</p>
                </div>
                <div className={cn(
                  "p-10 border group transition-all rounded-2xl shadow-sm",
                  theme === 'dark' ? "bg-zinc-950 border-zinc-900 hover:border-zinc-700" : "bg-zinc-50 border-zinc-200 hover:border-zinc-300"
                )}>
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all group-hover:scale-110 group-hover:-rotate-3 shadow-lg",
                    theme === 'dark' ? "bg-zinc-900 text-white group-hover:bg-white group-hover:text-black" : "bg-white text-zinc-900 group-hover:bg-zinc-900 group-hover:text-white"
                  )}>
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <h3 className="font-black uppercase text-base tracking-tighter mb-3 italic">Monthly Logic</h3>
                  <p className={cn(
                    "text-[11px] font-mono leading-relaxed uppercase font-bold",
                    theme === 'dark' ? "text-zinc-500" : "text-zinc-600"
                  )}>Automatic grouping and sheet separation for simplified monthly accounting workflows.</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-8">
              {groupedRecords.map(([month, monthRecords]) => {
                const isExpanded = expandedMonths.has(month);
                const totalMonthAmt = monthRecords.reduce((acc, r) => acc + (parseFloat(r["Total Amt"]) || 0), 0);
                const isMonthFullyReviewed = monthRecords.length > 0 && monthRecords.every(r => r.status === 'completed' && r.isReviewed);

                return (
                  <div key={month} className={cn(
                    "rounded-2xl transition-all overflow-hidden border mb-6",
                    theme === 'dark'
                      ? (isExpanded ? "bg-zinc-950/40 border-zinc-900 shadow-2xl" : "bg-transparent border-zinc-900/50 hover:border-zinc-800")
                      : (isExpanded ? "bg-white border-zinc-200 shadow-md" : "bg-zinc-50/50 border-zinc-100 hover:border-zinc-200")
                  )}>
                    <div
                      onClick={() => toggleMonth(month)}
                      className={cn(
                        "flex items-center justify-between p-6 cursor-pointer select-none group",
                        theme === 'dark' ? "hover:bg-zinc-900/50" : "hover:bg-white"
                      )}
                    >
                      <div className="flex items-center gap-6">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                          month === 'Extracting Logs'
                            ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                            : month === 'Failed Logs'
                              ? "bg-red-500/10 text-red-500 border border-red-500/20"
                              : month === 'UNchecked Logs'
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                : (theme === 'dark'
                                  ? (isExpanded ? "bg-white text-black" : "bg-zinc-900 text-zinc-500 group-hover:text-white")
                                  : (isExpanded ? "bg-zinc-900 text-white shadow-lg" : "bg-white text-zinc-500 border border-zinc-100 group-hover:text-zinc-900 group-hover:border-zinc-200"))
                        )}>
                          {month === 'Extracting Logs' && <Loader2 className="w-6 h-6 animate-spin" />}
                          {month === 'Failed Logs' && <AlertCircle className="w-6 h-6" />}
                          {month === 'UNchecked Logs' && <AlertCircle className="w-6 h-6 animate-pulse" />}
                          {month !== 'Extracting Logs' && month !== 'Failed Logs' && month !== 'UNchecked Logs' && <LayoutGrid className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className={cn(
                              "text-2xl font-black italic uppercase tracking-tighter transition-colors leading-none",
                              theme === 'dark'
                                ? (isExpanded ? "text-white" : "text-zinc-500 group-hover:text-zinc-200")
                                : (isExpanded ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-800")
                            )}>{month}</h3>
                            <div className={cn(
                              "w-2.5 h-2.5 rounded-full shrink-0",
                              month === 'Extracting Logs'
                                ? "bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.6)]"
                                : month === 'Failed Logs'
                                  ? "bg-red-500 animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                                  : month === 'UNchecked Logs'
                                    ? "bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.6)]"
                                    : isMonthFullyReviewed
                                      ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]"
                                      : "bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.6)]"
                            )} title={month === 'Extracting Logs' ? "Documents are extracting" : month === 'Failed Logs' ? "Extractions failed" : isMonthFullyReviewed ? "All logs are verified" : "Pending logs require verification"} />
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={cn(
                              "text-[10px] font-mono font-bold uppercase tracking-widest",
                              theme === 'dark' ? "text-zinc-600" : "text-zinc-700"
                            )}>{monthRecords.length} LOGS</span>
                            <div className={cn("w-1 h-1 rounded-full", theme === 'dark' ? "bg-zinc-800" : "bg-zinc-300")} />
                            <span className={cn(
                              "text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md",
                              theme === 'dark' ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-700 font-black"
                            )}>
                              ₹{totalMonthAmt.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {month === 'Extracting Logs' && monthRecords.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              clearAllExtracting();
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest border bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20 hover:border-red-500/30 cursor-pointer"
                            title="Delete all active extractions"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Delete All</span>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            exportToExcel(monthRecords.filter(r => r.status === 'completed'));
                          }}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest border",
                            theme === 'dark'
                              ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                              : "bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:border-zinc-300 shadow-sm"
                          )}
                          title="Export Month"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Export {month.split(' ')[0]}</span>
                        </button>
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                          theme === 'dark' ? "bg-zinc-900" : "bg-zinc-50"
                        )}>
                          <ChevronDown className={cn(
                            "w-5 h-5 transition-transform duration-300",
                            theme === 'dark' ? "text-zinc-500" : "text-zinc-400",
                            isExpanded && "rotate-180 text-zinc-900 dark:text-white"
                          )} />
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className={cn(
                            "border-t p-6",
                            theme === 'dark' ? "border-zinc-900" : "border-zinc-100"
                          )}
                        >
                          <div className={cn(
                            "grid gap-5",
                            selectedId ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                          )}>
                            {monthRecords.map((record) => (
                              <motion.div
                                layoutId={`card-${record.id}`}
                                key={record.id}
                                onClick={() => setSelectedId(record.id)}
                                className={cn(
                                  "p-7 cursor-pointer group transition-all relative overflow-hidden border rounded-3xl shadow-sm hover:shadow-2xl hover:-translate-y-1",
                                  theme === 'dark'
                                    ? (selectedId === record.id ? "bg-zinc-900 border-white" : "bg-zinc-950 border-zinc-900 hover:bg-zinc-900 hover:border-zinc-700")
                                    : (selectedId === record.id ? "bg-zinc-50 border-zinc-900" : "bg-white border-zinc-100 hover:bg-zinc-50 hover:border-zinc-200")
                                )}
                              >
                                {record.status === 'processing' && (
                                  <div className="absolute bottom-0 left-0 h-1.5 w-full bg-zinc-100 dark:bg-zinc-900">
                                    <motion.div
                                      className="h-full bg-zinc-900 dark:bg-white z-20"
                                      initial={{ width: 0 }}
                                      animate={{ width: '95%' }}
                                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                    />
                                  </div>
                                )}

                                <div className="flex justify-between items-start mb-8">
                                  <div className="flex flex-col">
                                    <span className={cn(
                                      "text-[9px] font-mono uppercase tracking-[0.2em] font-black",
                                      theme === 'dark' ? "text-zinc-600" : "text-zinc-500"
                                    )}>LOG REFERENCE</span>
                                    <span className="text-xl font-black font-mono tracking-tighter italic mt-1">#{record["BOOKING ID"] || 'EXTRACTING'}</span>
                                  </div>
                                  {record.status === 'completed' && record.isReviewed && <div className="w-3.5 h-3.5 rounded-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]" />}
                                  {record.status === 'completed' && !record.isReviewed && <div className="w-3.5 h-3.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.6)]" />}
                                  {record.status === 'processing' && <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />}
                                  {record.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                                </div>

                                <div className="space-y-4 mb-8">
                                  <div className="flex justify-between text-[11px] font-mono uppercase font-black tracking-tight">
                                    <span className={cn(theme === 'dark' ? "text-zinc-600" : "text-zinc-500")}>VEHICLE PLATE</span>
                                    <span className={cn(
                                      "truncate ml-4 max-w-[140px]",
                                      theme === 'light' ? "text-zinc-900" : "text-white"
                                    )}>{record["Cab No."] || 'PENDING'}</span>
                                  </div>
                                  <div className="flex justify-between text-[11px] font-mono uppercase font-black tracking-tight">
                                    <span className={cn(theme === 'dark' ? "text-zinc-600" : "text-zinc-500")}>OPERATOR NAME</span>
                                    <span className={cn(
                                      "truncate ml-4 max-w-[140px]",
                                      theme === 'light' ? "text-zinc-900" : "text-white"
                                    )}>{record["Driver name"] || 'EXTRACTING...'}</span>
                                  </div>
                                  <div className={cn(
                                    "flex justify-between text-[11px] font-mono uppercase font-black tracking-tight border-t pt-4 mt-2",
                                    theme === 'dark' ? "border-zinc-900" : "border-zinc-100"
                                  )}>
                                    <span className={cn(theme === 'dark' ? "text-zinc-600" : "text-zinc-500")}>DATE ISSUED</span>
                                    <span className={theme === 'light' ? "text-zinc-900" : "text-white"}>{record.DATE || '---'}</span>
                                  </div>
                                </div>

                                <div className="flex items-end justify-between pt-6 border-t-2 border-dashed dark:border-zinc-900 border-zinc-100">
                                  <div>
                                    <span className={cn(
                                      "text-[9px] font-mono uppercase tracking-widest block font-black",
                                      theme === 'dark' ? "text-zinc-500" : "text-zinc-600"
                                    )}>Total Settlement</span>
                                    <span className="text-3xl font-black font-mono tracking-tighter italic">₹{(parseFloat(record["Total Amt"]) || 0).toFixed(0)}</span>
                                  </div>
                                  <div className={cn(
                                    "p-2.5 rounded-2xl transition-all shadow-sm",
                                    theme === 'dark' ? "bg-zinc-900 text-white group-hover:bg-white group-hover:text-black" : "bg-zinc-100 text-zinc-400 group-hover:bg-zinc-900 group-hover:text-white"
                                  )}>
                                    <ChevronRight className="w-5 h-5" />
                                  </div>
                                </div>

                                {!selectedId && (
                                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    {record.status === 'error' && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); retryExtraction(record.id); }}
                                        title="Retry Extraction"
                                        className="p-2 hover:text-white dark:hover:text-black hover:bg-zinc-900 dark:hover:bg-white text-red-500 rounded-lg transition-all"
                                      >
                                        <RefreshCcw className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); deleteRecord(record.id); }}
                                      className="p-2 hover:text-red-500 transition-all text-zinc-500"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </motion.div>
                            ))}

                            {!selectedId && (
                              <div
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.multiple = true;
                                  input.accept = 'image/*,.pdf';
                                  input.onchange = (e) => {
                                    const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
                                    handleFiles(files);
                                  };
                                  input.click();
                                }}
                                className={cn(
                                  "p-6 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-all cursor-pointer group h-full min-h-[260px] shadow-sm",
                                  theme === 'dark' ? "bg-zinc-950/50 border-zinc-800 hover:border-zinc-500" : "bg-zinc-50 border-zinc-200 hover:border-zinc-400 hover:bg-white"
                                )}
                              >
                                <div className="flex flex-col items-center gap-5">
                                  <div className={cn(
                                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-md",
                                    theme === 'dark' ? "bg-zinc-900 text-zinc-600 group-hover:bg-white group-hover:text-black group-hover:scale-110" : "bg-white text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white group-hover:scale-110"
                                  )}>
                                    <LayoutGrid className="w-7 h-7" />
                                  </div>
                                  <div className="text-center">
                                    <span className="text-[11px] uppercase font-black tracking-widest text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white block">Insert Documents</span>
                                    <span className="text-[8px] uppercase font-mono text-zinc-400 mt-1 block">TO {month} SECTOR</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side-by-Side Review Interface */}
        <AnimatePresence>
          {selectedId && selectedRecord && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="flex-1 flex h-[calc(100vh-80px)] z-30"
            >
              <div className={cn(
                "flex-1 overflow-hidden flex flex-col relative transition-colors",
                theme === 'dark' ? "bg-zinc-900" : "bg-zinc-100"
              )}>
                <button
                  onClick={() => setSelectedId(null)}
                  className={cn(
                    "absolute top-6 left-6 z-10 p-2 backdrop-blur rounded-lg transition-colors border shadow-xl",
                    theme === 'dark' ? "bg-black/50 hover:bg-black border-zinc-800" : "bg-white/50 hover:bg-white border-zinc-200"
                  )}
                >
                  <ChevronRight className="w-6 h-6 rotate-180" />
                </button>
                <div className={cn(
                  "flex-1 overflow-auto p-12 flex items-center justify-center",
                  theme === 'dark' ? "bg-[radial-gradient(#222_1px,transparent_1px)]" : "bg-[radial-gradient(#ddd_1px,transparent_1px)]",
                  "[background-size:20px_20px]"
                )}>
                  <motion.img
                    layoutId={`img-${selectedRecord.id}`}
                    src={selectedRecord.image_url}
                    alt="Trip Sheet"
                    animate={{ rotate: imageRotation, scale: imageScale }}
                    style={{ originX: 0.5, originY: 0.5 }}
                    className="max-w-full shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-8 border-black rounded-lg"
                  />
                </div>
                <div className={cn(
                  "h-12 border-t px-6 flex items-center justify-between",
                  theme === 'dark' ? "bg-black border-zinc-800" : "bg-white border-zinc-200"
                )}>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Image Inspector Mode</span>
                  <div className="flex gap-4">
                    <button onClick={() => setImageRotation(prev => prev - 90)} className="text-[9px] uppercase font-black hover:text-zinc-900 dark:hover:text-white transition-colors text-zinc-400">Rotate Left</button>
                    <button onClick={() => setImageRotation(prev => prev + 90)} className="text-[9px] uppercase font-black hover:text-zinc-900 dark:hover:text-white transition-colors text-zinc-400">Rotate Right</button>
                    <button onClick={() => setImageScale(prev => Math.min(prev + 0.25, 3))} className="text-[9px] uppercase font-black hover:text-zinc-900 dark:hover:text-white transition-colors text-zinc-400">Zoom In</button>
                    <button onClick={() => setImageScale(prev => Math.max(prev - 0.25, 0.5))} className="text-[9px] uppercase font-black hover:text-zinc-900 dark:hover:text-white transition-colors text-zinc-400">Zoom Out</button>
                  </div>
                </div>
              </div>

              <div className="w-[750px] shrink-0 shadow-2xl">
                <ReviewForm
                  record={selectedRecord}
                  onUpdate={updateRecord}
                  onSave={handleDone}
                  theme={theme}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm transition-colors",
            theme === 'dark' ? "bg-black/90" : "bg-white/60"
          )}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={cn(
                "w-full max-w-md border p-8 shadow-2xl rounded-2xl",
                theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
              )}
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black uppercase tracking-tighter italic">AI Config</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    theme === 'dark' ? "hover:bg-zinc-900" : "hover:bg-zinc-100"
                  )}
                >
                  <RefreshCcw className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 block font-medium">Processing Engine</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setUseGemini(true)}
                      className={cn(
                        "p-4 border font-bold text-[10px] tracking-widest uppercase transition-all rounded-lg",
                        useGemini
                          ? (theme === 'dark' ? "border-white bg-white text-black" : "border-zinc-900 bg-zinc-900 text-white")
                          : (theme === 'dark' ? "border-zinc-800 hover:border-zinc-600" : "border-zinc-200 hover:border-zinc-400 text-zinc-500")
                      )}
                    >
                      Gemini 3 Pro
                    </button>
                    <button
                      onClick={() => setUseGemini(false)}
                      className={cn(
                        "p-4 border font-bold text-[10px] tracking-widest uppercase transition-all rounded-lg",
                        !useGemini
                          ? (theme === 'dark' ? "border-white bg-white text-black" : "border-zinc-900 bg-zinc-900 text-white")
                          : (theme === 'dark' ? "border-zinc-800 hover:border-zinc-600" : "border-zinc-200 hover:border-zinc-400 text-zinc-500")
                      )}
                    >
                      LM Studio
                    </button>
                  </div>
                </div>

                {!useGemini && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block font-bold">Local API Endpoint</label>
                      <input
                        value={apiBaseUrl}
                        onChange={(e) => setApiBaseUrl(e.target.value)}
                        className={cn(
                          "w-full border rounded px-3 py-3 text-xs font-mono outline-none transition-colors",
                          theme === 'dark' ? "bg-black border-zinc-800 focus:border-white text-white" : "bg-zinc-50 border-zinc-200 focus:border-zinc-900 text-zinc-900"
                        )}
                        placeholder="http://localhost:1234/v1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block font-bold">LM Studio API Token (Optional)</label>
                      <input
                        value={lmStudioToken}
                        onChange={(e) => setLmStudioToken(e.target.value)}
                        type="password"
                        className={cn(
                          "w-full border rounded px-3 py-3 text-xs font-mono outline-none transition-colors",
                          theme === 'dark' ? "bg-black border-zinc-800 focus:border-white text-white" : "bg-zinc-50 border-zinc-200 focus:border-zinc-900 text-zinc-900"
                        )}
                        placeholder="Paste your LM Studio API token here"
                      />
                    </div>
                    <div className="p-4 bg-zinc-900/50 border border-zinc-800 flex gap-3 italic">
                      <Cpu className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                      <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">
                        Ensure LM Studio is running a Vision compatibility model and server is started on the specified port. If authentication is required, paste your API token above.
                      </p>
                    </div>
                  </motion.div>
                )}

                <button
                  onClick={() => setShowSettings(false)}
                  className={cn(
                    "w-full py-4 font-black uppercase text-xs tracking-widest transition-all rounded-xl shadow-lg",
                    theme === 'dark' ? "bg-white text-black hover:bg-zinc-200" : "bg-zinc-900 text-white hover:bg-black"
                  )}
                >
                  Apply Settings
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
