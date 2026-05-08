import { GoogleGenAI } from "@google/genai";

// Initialize Gemini Client
// Note: In a real app, ensure process.env.API_KEY is set. 
// For this demo, we gracefully handle missing keys.
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const generateSqlFromNaturalLanguage = async (prompt: string, schemaDescription: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    console.warn("Gemini API Key missing. Returning mock SQL.");
    return `SELECT * FROM campaigns WHERE name LIKE '%${prompt}%' LIMIT 10; -- Mock generated SQL`;
  }

  try {
    const fullPrompt = `
      You are an expert SQL Data Analyst. 
      Convert the following natural language request into a valid MySQL query.
      
      Database Schema:
      ${schemaDescription}
      
      User Request: "${prompt}"
      
      Return ONLY the SQL query, no markdown, no explanations.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
    });

    return response.text.replace(/```sql/g, '').replace(/```/g, '').trim();
  } catch (error) {
    console.error("Error generating SQL:", error);
    return "-- Error generating SQL. Please check API configuration.";
  }
};

export const generateWidgetInsight = async (dataContext: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "AI insights require an API Key.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this data summary and provide a 1-sentence key insight: ${dataContext}`,
    });
    return response.text;
  } catch (error) {
    return "Could not generate insight.";
  }
};