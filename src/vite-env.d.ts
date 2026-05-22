/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_LM_STUDIO_API_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
