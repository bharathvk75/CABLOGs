# CabLog

CabLog is an open-source AI-assisted operations tool for converting handwritten cab trip sheets into structured, reviewable, and export-ready records.

It is designed for transport teams, admin operations, and founders who want to reduce manual data entry while keeping control over data quality.

## Why This Project Exists

Manual trip-sheet processing is slow, error-prone, and hard to scale. CabLog solves this by combining:

- OCR-style extraction from image/PDF logs
- Human-in-the-loop review before finalizing records
- Monthly grouping and clean exports for reporting

The result is a practical workflow for invoice prep, reconciliation, and operational analytics.

## AI Provider Flexibility (Cloud + Local)

CabLog supports two AI backends:

- Gemini (cloud)
- LM Studio (local OpenAI-compatible endpoint)

This architecture means you are not locked to one model provider.

With proper prompting/context setup, technically any compatible model service can be integrated for extraction.

## Local Model Benefits (LM Studio)

Running with a local model gives real-world advantages:

- Privacy-first: sensitive trip logs can stay inside your local/network environment
- Lower recurring costs: no per-call cloud billing for high-volume processing
- Offline/edge readiness: useful in restricted or unstable network settings
- Model control: choose or swap models based on your speed/accuracy needs
- Open-source friendly: easy for contributors to test with self-hosted AI stacks

## Core Features

- Batch import of JPG/PNG/PDF trip sheets
- Automatic OCR-style field extraction into a fixed schema
- Queue-based processing with status tracking (pending/processing/completed/error)
- Monthly and workflow-based grouping in the UI
- Review and correction workflow before finalization
- Export to CSV and Excel for downstream finance/ops processes
- Persistent local record store + physical image sync support

## Screenshots

### 1) Input: Trip Sheet / Receipt

The operator uploads trip-sheet photos or receipt images as raw input.

![Sample Receipt](Receipt.jpeg)

### 2) Dashboard: Imported Logs and Queue

The dashboard shows imported records, status states, and processing controls.

![CabLog Dashboard](docs/screenshots/Screenshot%202026-05-22%20175737.png)

### 3) Extraction: OCR + Structured Data Parsing

Records move through the extraction pipeline and are normalized into schema fields.

![CabLog Processing](docs/screenshots/Screenshot%202026-05-22%20175758.png)

### 4) Review: Human Verification Before Export

Teams validate and adjust extracted values before final CSV/Excel export.

![CabLog Review](docs/screenshots/Screenshot%202026-05-22%20175811.png)

## Tech Stack

- React + TypeScript + Vite
- Lucide icons + Motion animations
- PDF processing via `pdfjs-dist`
- Spreadsheet export via `xlsx`
- Multi-provider AI integration (`@google/genai` + OpenAI-compatible local endpoint)

## Run Locally

Prerequisites:

- Node.js 18+

1. Install dependencies

```bash
npm install
```

2. Configure one of the AI options

- Gemini:
   - Set `VITE_GEMINI_API_KEY`
- LM Studio:
   - Install and load a vision-capable model in LM Studio
   - Start LM Studio local server
   - Keep endpoint at `/lms/v1` (or set your own base URL in-app)
   - Optionally provide a local API token if your server requires auth

## LM Studio OCR Setup Guide

Use this setup if you want local OCR extraction from images/receipts without a cloud provider.

### 1. Install a vision model in LM Studio

- Open LM Studio and download a vision-capable model (text-only models will not work for image OCR).
- Load that model before running CabLog.
- Confirm the model supports image input in chat/completions.

### 2. Enable server mode in LM Studio

Use these server settings to get started quickly:

- Start Local Server: enabled
- Host: `127.0.0.1` (or `0.0.0.0` if you need LAN access)
- Port: `1234`
- API format: OpenAI-compatible
- Endpoint expected by this app: `/v1/chat/completions`

In CabLog, keep the default API base URL as `/lms/v1` unless you changed the proxy route.

### 3. Add an instruction prompt before sending images: For Eg an Travels Car Receipt. Receipt.jpeg

In LM Studio chat settings or your model preset, add the following system instruction so extraction remains structured and consistent:

```text
You are a precision OCR JSON API. Extract trip-sheet or receipt data from images.

Rules:
1) Return valid JSON only.
2) Do not include markdown fences.
3) Keep field names exactly as requested by the client schema.
4) If a value is missing, use an empty string for text fields and "0" for numeric fields.
5) Preserve dates as DD-MM-YYYY whenever possible.
6) Do not hallucinate values.

Output format:
[
  {
    "BOOKING ID": "",
    "DATE": "",
    "PASSENGER NAME": "",
    "PHONE/ID": "",
    "Driver name": "",
    "Cab No.": "",
    "Reporting address": "",
    "Drop Address": "",
    "Shift Time": "",
    "Duty type": "",
    "Total Kms": "",
    "Total Hrs": "",
    "Toll&Parking": "0"
  }
]
```

Note: CabLog already sends extraction instructions from the app side. Adding this in LM Studio helps enforce consistency when models vary.

3. Start development server

```bash
npm run dev
```

4. Build for production

```bash
npm run build
```

## Open Source Note

CabLog is published as an open-source project and welcomes contributions in:

- extraction accuracy improvements
- model integration adapters
- UI/UX improvements for operations teams
- dataset and evaluation tooling

## Career-Relevant Engineering Highlights

This project demonstrates practical production skills:

- AI integration design (provider-agnostic architecture)
- robust async processing workflows with queue control
- schema-based extraction and data normalization
- operational UX for real business workflows
- export/reporting interoperability

## License

Apache-2.0
