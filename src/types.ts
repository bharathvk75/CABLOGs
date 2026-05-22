export interface TripRecord {
  id: string;
  image_url: string;
  "Sl.no": number;
  "BOOKING ID": string;
  "Category": string;
  "DATE": string;
  "PASSENGER NAME": string;
  "PHONE/ID": string;
  "Driver name": string;
  "Cab No.": string;
  "Reporting address": string;
  "Drop Address": string;
  "Shift Time": string;
  "Duty type": string;
  "Basic Pkg Amt.": string;
  "Minimun Kms": string;
  "Total Kms": string;
  "Extra Kms": string;
  "Extra Kms Amt": string;
  "Total Extra kms amt": string;
  "Minimun Hrs": string;
  "Total Hrs": string;
  "Extra Hrs": string;
  "Exta Hrs Amt": string;
  "total Extra Hrs Amt": string;
  "Toll&Parking": string;
  "Total Amt": string;
  
  status: 'pending' | 'processing' | 'completed' | 'error';
  isReviewed?: boolean;
  error_message?: string;
  image_hash?: string;
}

export type AppState = {
  records: TripRecord[];
  isProcessing: boolean;
  progress: number;
  apiBaseUrl: string;
  useGemini: boolean;
};
