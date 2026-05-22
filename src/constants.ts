export const DEFAULT_API_BASE_URL = "/lms/v1";
export const DEFAULT_MINIMUM_KMS = "0";
export const DEFAULT_BASIC_PKG_AMT = "19";

export const OCR_SYSTEM_PROMPT = `You are a precision OCR JSON API. Your goal is to extract handwritten data from logistics trip sheets into the EXACT JSON schema provided below. 

CRITICAL EXTRACTION RULES:
1. SCHEMA FIDELITY: You must output every single key listed in the schema below. Do NOT add or remove keys.
2. BOOKING ID: Extract the handwritten number starting with '#' (e.g., #61390723).
3. PASSENGER NAME: Extract handwriting next to "M/s." (e.g., "Alekhya k").
4. PHONE/ID: Extract the 10-digit number next to "Ph. No." (e.g., "9491298761").
5. DATE: Look under "Date". Format as DD-MM-YYYY (e.g., 16-12-2025).
6. SHIFT TIME: Extract ONLY the handwritten value under "Opening" -> "Hrs.". Do NOT include the closing time.
7. TOTAL KMS: Look ONLY under "Total" -> "Kms.". Extract the single handwritten number (e.g., "29").
8. TOTAL HRS: Look ONLY under "Total" -> "Hrs." (e.g., "2").
9. TOLL&PARKING: Extract the handwritten number next to "Toll" (e.g., "30").
10. CAB NO.: Extract the vehicle registration number next to "Cab No" (e.g., TS09UD1234).
11. DRIVER NAME: Extract the driver's name next to "Driver".
12. REPORTING / DROP ADDRESS: Extract the addresses from "Reported At" and "Drop At".
13. EMPTY FIELDS: If a field is not visible, use "" for text or "0" for numbers.

FULL SCHEMA (DO NOT ALTER):
[
  {
    "Sl.no": 1,
    "BOOKING ID": "",
    "Category": "Non-Premium",
    "DATE": "",
    "PASSENGER NAME": "",
    "PHONE/ID": "",
    "Driver name": "",
    "Cab No.": "",
    "Reporting address": "",
    "Drop Address": "",
    "Shift Time": "",
    "Duty type": "",
    "Basic Pkg Amt.": "19",
    "Minimun Kms": "0",
    "Total Kms": "",
    "Extra Kms": "0",
    "Extra Kms Amt": "0",
    "Total Extra kms amt": "0",
    "Minimun Hrs": "0",
    "Total Hrs": "",
    "Extra Hrs": "0",
    "Exta Hrs Amt": "0",
    "total Extra Hrs Amt": "0",
    "Toll&Parking": "0",
    "Total Amt": "0"
  }
]`;
