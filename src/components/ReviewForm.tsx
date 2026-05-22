import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { TripRecord } from '../types';
import { cn } from '../lib/utils';
import { Save, Calculator, CheckCircle2, Loader2 } from 'lucide-react';

interface ReviewFormProps {
  record: TripRecord;
  onUpdate: (updated: TripRecord) => void;
  onSave: (record: TripRecord) => void;
  theme?: 'dark' | 'light';
}

export function ReviewForm({ record, onUpdate, onSave, theme = 'dark' }: ReviewFormProps) {
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const lastUpdateRef = useRef<number>(Date.now());


    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const updated = { ...record, [name]: value };
    
    // Auto-calculate logic according to user instructions
    const totalKms = parseFloat(updated["Total Kms"]) || 0;
    const minKms = parseFloat(updated["Minimun Kms"]) || 0;
    const basicAmt = parseFloat(updated["Basic Pkg Amt."]) || 19;
    const ratePerKm = parseFloat(updated["Extra Kms Amt"]) || 0;
    const toll = parseFloat(updated["Toll&Parking"]) || 0;
    
    const extraKms = Math.max(0, totalKms - minKms);
    updated["Extra Kms"] = extraKms.toString();
    
    // Total Amt = Basic Pkg Amt. + (Extra Kms * Rate) + Toll&Parking.
    const totalAmt = basicAmt + (extraKms * ratePerKm) + toll;
    updated["Total Amt"] = totalAmt.toFixed(2);
    
    onUpdate(updated);
    setSavingStatus('saving');
  };

  const inputClass = cn(
    "w-full border rounded px-3 py-2 transition-colors text-xs font-mono outline-none",
    theme === 'dark' 
      ? "bg-zinc-900 border-zinc-800 text-white focus:border-white" 
      : "bg-white border-zinc-200 text-zinc-900 focus:border-zinc-900"
  );
  const labelClass = cn(
    "text-[9px] uppercase tracking-widest mb-1 block font-bold transition-colors text-zinc-500",
    theme === 'light' && "text-zinc-700"
  );

  return (
    <div className={cn(
      "flex flex-col h-full border-l transition-colors",
      theme === 'dark' ? "bg-black border-zinc-800 text-white" : "bg-white border-zinc-200 text-zinc-900"
    )}>
      <div className={cn(
        "p-8 flex justify-between items-center sticky top-0 z-10 border-b",
        theme === 'dark' ? "bg-black/80 border-zinc-900 backdrop-blur-xl" : "bg-white/80 border-zinc-100 backdrop-blur-xl"
      )}>
        <div className="flex items-center gap-4">
          <h2 className={cn(
            "text-2xl font-black uppercase tracking-tighter italic",
            theme === 'light' ? "text-zinc-900" : "text-white"
          )}>Review Entry</h2>
          <div className="flex items-center gap-2">
            {savingStatus === 'saving' && (
              <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 uppercase tracking-widest animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                Syncing...
              </div>
            )}
            {savingStatus === 'saved' && (
              <div className={cn(
                "flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full",
                theme === 'dark' ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-900"
              )}>
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                Saved
              </div>
            )}
          </div>
        </div>
        <button 
          onClick={() => {
            onSave(record);
            setSavingStatus('saved');
            setTimeout(() => setSavingStatus('idle'), 2000);
          }}
          className={cn(
            "px-4 py-2 text-sm font-bold uppercase transition-all flex items-center gap-2 shadow-sm rounded",
            theme === 'dark' ? "bg-white text-black hover:bg-zinc-200" : "bg-zinc-900 text-white hover:bg-black"
          )}
        >
          <Save className="w-4 h-4" />
          Done
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-8 space-y-10">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Booking ID</label>
            <input name="BOOKING ID" value={record["BOOKING ID"]} onChange={handleChange} className={inputClass} placeholder="ID-0000" />
          </div>
          <div>
            <label className={labelClass}>Date (DD-MM-YYYY)</label>
            <input name="DATE" value={record["DATE"]} onChange={handleChange} className={inputClass} placeholder="01-01-2024" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Category</label>
            <input name="Category" value={record.Category} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Passenger Name</label>
            <input name="PASSENGER NAME" value={record["PASSENGER NAME"]} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Driver Name</label>
            <input name="Driver name" value={record["Driver name"]} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Cab No</label>
            <input name="Cab No." value={record["Cab No."]} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Phone / ID</label>
            <input name="PHONE/ID" value={record["PHONE/ID"]} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Shift Time</label>
            <input name="Shift Time" value={record["Shift Time"]} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>Reporting Address</label>
            <input name="Reporting address" value={record["Reporting address"]} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Drop Address</label>
            <input name="Drop Address" value={record["Drop Address"]} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div className={cn(
          "p-6 border space-y-6 rounded-2xl",
          theme === 'dark' ? "bg-zinc-950/50 border-zinc-900" : "bg-zinc-50/50 border-zinc-200"
        )}>
           <h3 className={cn(
             "text-[10px] font-black uppercase tracking-widest italic",
             theme === 'light' ? "text-zinc-700" : "text-zinc-600"
           )}>Distance & Time</h3>
           <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Total Kms</label>
                <input name="Total Kms" value={record["Total Kms"]} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Total Hrs</label>
                <input name="Total Hrs" value={record["Total Hrs"]} onChange={handleChange} className={inputClass} />
              </div>
           </div>
        </div>

        <div className={cn(
          "p-4 border space-y-4 rounded-xl",
          theme === 'dark' ? "bg-zinc-900 border-zinc-800" : "bg-zinc-100 border-zinc-200 shadow-sm"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-black uppercase tracking-widest italic">Financials</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Basic Pkg Amt</label>
              <input name="Basic Pkg Amt." value={record["Basic Pkg Amt."]} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Min Kms</label>
              <input name="Minimun Kms" value={record["Minimun Kms"]} onChange={handleChange} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Extra Km Rate</label>
              <input name="Extra Kms Amt" value={record["Extra Kms Amt"]} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Toll & Parking</label>
              <input name="Toll&Parking" value={record["Toll&Parking"]} onChange={handleChange} className={inputClass} />
            </div>
          </div>
          
          <div className={cn(
            "pt-4 border-t grid grid-cols-2 gap-4",
            theme === 'dark' ? "border-zinc-800" : "border-zinc-200"
          )}>
            <div>
              <label className={labelClass}>Extra Kms</label>
              <div className={cn(
                "text-xl font-mono font-black italic",
                theme === 'light' ? "text-zinc-700" : "text-zinc-400"
              )}>{record["Extra Kms"]}</div>
            </div>
            <div>
              <label className={labelClass}>Total Amount</label>
              <div className={cn(
                "text-xl font-mono font-black italic",
                theme === 'dark' ? "text-white" : "text-zinc-900"
              )}>₹ {record["Total Amt"]}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
