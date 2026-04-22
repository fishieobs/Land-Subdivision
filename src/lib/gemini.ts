import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function extractLandDataFromPdf(base64Data: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Data,
          },
        },
        {
          text: `你是一位專業的地政士。請從這份土地登記謄本（PDF）中提取以下資訊，並回傳 JSON 格式。
          請務必精準提取地號、地段、面積（平方公尺）、公告土地現值（元/平方公尺）、申報地價。
          並提取所有共有人（所有權人）的姓名及其權利範圍（分子與分母）。

          輸出 JSON 結構範例：
          {
            "landInfo": {
              "landId": "string (例如: 123-0000)",
              "district": "string (例如: 台北市大安區仁愛段)",
              "totalArea": number,
              "announcedValue": number,
              "declaredValue": number
            },
            "owners": [
              {
                "name": "string",
                "address": "string",
                "numerator": number,
                "denominator": number
              }
            ]
          }`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          landInfo: {
            type: Type.OBJECT,
            properties: {
              landId: { type: Type.STRING },
              district: { type: Type.STRING },
              totalArea: { type: Type.NUMBER },
              announcedValue: { type: Type.NUMBER },
              declaredValue: { type: Type.NUMBER }
            },
            required: ["landId", "totalArea"]
          },
          owners: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                address: { type: Type.STRING },
                numerator: { type: Type.NUMBER },
                denominator: { type: Type.NUMBER }
              },
              required: ["name", "numerator", "denominator"]
            }
          }
        }
      }
    },
  });

  return JSON.parse(response.text);
}
