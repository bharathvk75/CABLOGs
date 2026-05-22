import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'save-images-middleware',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.method === 'POST' && req.url === '/api/save-image') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const { fileName, base64 } = JSON.parse(body);
                  const dirPath = path.resolve(__dirname, 'imagere');
                  
                  // Ensure directory exists
                  if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                  }
                  
                  // Strip header if present
                  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
                  const filePath = path.join(dirPath, fileName);
                  
                  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                  
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, path: filePath }));
                } catch (err: any) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
            } else if (req.method === 'POST' && req.url === '/api/delete-image') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const { fileName } = JSON.parse(body);
                  const dirPath = path.resolve(__dirname, 'imagere');
                  const filePath = path.join(dirPath, fileName);
                  
                  if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[Vite Middleware] Deleted completed file from disk: ${filePath}`);
                  }
                  
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true }));
                } catch (err: any) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/lms': {
          target: 'http://169.254.136.125:1234',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/lms/, '')
        }
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
