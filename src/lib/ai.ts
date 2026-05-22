import { GoogleGenAI, Type } from "@google/genai";
import { OCR_SYSTEM_PROMPT } from "../constants";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

export async function processWithGemini(imageBase64: string): Promise<any> {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64.split(',')[1] || imageBase64
          }
        },
        { text: OCR_SYSTEM_PROMPT }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            "BOOKING ID": { type: Type.STRING },
            "DATE": { type: Type.STRING },
            "PASSENGER NAME": { type: Type.STRING },
            "PHONE/ID": { type: Type.STRING },
            "Driver name": { type: Type.STRING },
            "Cab No.": { type: Type.STRING },
            "Drop Address": { type: Type.STRING },
            "Total Kms": { type: Type.STRING },
            "Total Hrs": { type: Type.STRING },
            "Toll&Parking": { type: Type.STRING },
            "Reporting address": { type: Type.STRING },
            "Shift Time": { type: Type.STRING },
            "Duty type": { type: Type.STRING }
          }
        }
      }
    }
  });

  try {
    const raw = JSON.parse(response.text);
    return Array.isArray(raw) ? raw[0] : raw;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return null;
  }
}

export async function processWithLMStudio(imageBase64: string, baseUrl: string, apiToken: string): Promise<any> {
    try {
        // Ensure the URL is properly formatted
        let endpoint = baseUrl.trim();
        // If it's a relative path (starting with /), don't prepend http
        if (!endpoint.startsWith('http') && !endpoint.startsWith('/')) {
            endpoint = 'http://' + endpoint;
        }
        // Remove trailing slashes
        endpoint = endpoint.replace(/\/$/, '');
        // Ensure /v1 is in the path
        if (!endpoint.includes('/v1')) {
            endpoint = endpoint + '/v1';
        }
        
        const fullUrl = `${endpoint}/chat/completions`;
        console.log(`[LM Studio] Full request URL: ${fullUrl}`);
        console.log(`[LM Studio] API Token provided: ${apiToken ? 'YES (length: ' + apiToken.length + ')' : 'NO'}`);
        
        const headers: Record<string, string> = { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (apiToken && apiToken.trim()) {
            headers['Authorization'] = `Bearer ${apiToken}`;
            console.log(`[LM Studio] Using Bearer token authentication`);
        } else {
            console.warn(`[LM Studio] No API token provided - requests may fail if server requires authentication`);
        }
        
        console.log(`[LM Studio] Request headers:`, headers);
        
        // Try to get loaded model name from /v1/models to prevent failure due to empty model name
        let loadedModel = "local-model";
        try {
            const modelsUrl = `${endpoint}/models`;
            const modelsResponse = await fetch(modelsUrl, { headers });
            if (modelsResponse.ok) {
                const modelsData = await modelsResponse.json();
                if (modelsData?.data?.[0]?.id) {
                    loadedModel = modelsData.data[0].id;
                    console.log(`[LM Studio] Detected loaded model: ${loadedModel}`);
                }
            }
        } catch (e) {
            console.warn(`[LM Studio] Could not detect loaded model, using default: ${loadedModel}`, e);
        }
        
        const requestBody = {
            model: loadedModel,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Please extract the trip sheet data from this image using the pre-configured system instructions." },
                        { type: "image_url", image_url: { url: imageBase64 } }
                    ]
                }
            ],
            temperature: 0.1,
            max_tokens: 2000
        };
        
        console.log(`[LM Studio] Request body prepared (image size: ${imageBase64.length} chars)`);
        
        const response = await fetch(fullUrl, {
            method: 'POST',
            headers,
            mode: 'cors',
            credentials: 'omit',
            body: JSON.stringify(requestBody)
        });
        
        console.log(`[LM Studio] Response received - Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LM Studio] HTTP Error ${response.status}:`, errorText);
            throw new Error(`LM Studio HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        console.log(`[LM Studio] Parsed JSON response:`, data);
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error(`Unexpected LM Studio response format: ${JSON.stringify(data).substring(0, 200)}`);
        }

        let content = data.choices[0].message.content.trim();
        console.log(`[LM Studio] Raw content:`, content.substring(0, 300));
        
        // Try to extract JSON from response
        let jsonData;
        try {
            // Try parsing directly
            jsonData = JSON.parse(content);
        } catch {
            // Try extracting JSON from text (if model returned markdown or extra text)
            // Look for anything that looks like a JSON array or object
            const jsonArrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
            const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
            
            if (jsonArrayMatch) {
                console.log(`[LM Studio] Extracted JSON array from text`);
                jsonData = JSON.parse(jsonArrayMatch[0]);
            } else if (jsonObjectMatch) {
                console.log(`[LM Studio] Extracted JSON object from text`);
                jsonData = JSON.parse(jsonObjectMatch[0]);
            } else {
                throw new Error(`Could not extract JSON from response. Got: ${content.substring(0, 300)}`);
            }
        }

        const result = Array.isArray(jsonData) ? jsonData[0] : jsonData;
        console.log(`[LM Studio] Extracted data:`, result);
        return result;
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`[LM Studio] Error:`, errorMsg);
        throw new Error(`LM Studio Processing Failed: ${errorMsg}`);
    }
}
