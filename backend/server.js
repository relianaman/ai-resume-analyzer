require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

app.post('/api/analyze', async (req, res) => {
    const { resumeText, filePayload, jobDescription } = req.body;

    if (!resumeText && !filePayload) {
        return res.status(400).json({ error: 'Resume content is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
    }

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
        
        const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const systemInstruction = `
        You are an expert ATS (Applicant Tracking System) and Career Coach. 
        Note: Today's date is ${currentDate}. Keep this in mind when evaluating timelines (e.g., if it is currently 2026, an internship in 2025 is in the past, not the future).
        Analyze the provided Resume Text against the Target Job Description (if provided).
        
        Return the analysis STRICTLY as a JSON object with the following structure:
        {
          "atsScore": number (0-100),
          "scoreMessage": "Brief 1-sentence summary of the score (e.g., 'Strong match, but needs optimization.')",
          "extractedSkills": ["skill1", "skill2", ...],
          "missingKeywords": ["keyword1", "keyword2", ...],
          "improvementSuggestions": "Markdown formatted detailed suggestions for improving the resume. Focus on formatting, impact metrics, and alignment with the job description."
        }
        
        Do NOT wrap the JSON in markdown code blocks like \`\`\`json. Return ONLY the raw JSON string.
        `;
        
        const prompt = `
        Target Job Description (if empty, do a general best-practices analysis):
        ${jobDescription || "None provided. Analyze for general software engineering/professional roles."}
        
        Resume Text:
        ${resumeText || "Attached in file payload."}
        `;

        let parts = [{ text: systemInstruction + "\n\n" + prompt }];
        
        if (filePayload) {
            parts.unshift({
                inlineData: {
                    mimeType: filePayload.mimeType,
                    data: filePayload.data
                }
            });
        }

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: parts
                }
            ],
            generationConfig: {
                temperature: 0.2,
                response_mime_type: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        atsScore: { type: "INTEGER" },
                        scoreMessage: { type: "STRING" },
                        extractedSkills: { type: "ARRAY", items: { type: "STRING" } },
                        missingKeywords: { type: "ARRAY", items: { type: "STRING" } },
                        improvementSuggestions: { type: "STRING" }
                    },
                    required: ["atsScore", "scoreMessage", "extractedSkills", "missingKeywords", "improvementSuggestions"]
                }
            }
        };

        // Standard fetch works in Node 18+
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", errorData);
            return res.status(500).json({ error: errorData.error?.message || "Failed to communicate with AI API" });
        }

        const data = await response.json();
        let responseText = data.candidates[0].content.parts[0].text;
        
        // Clean up markdown blocks if the AI accidentally includes them
        let cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        // Ensure the string ends with a closing brace if truncated
        if (!cleanText.endsWith('}')) {
            cleanText += '"}';
        }
        
        try {
            const analysis = JSON.parse(cleanText);
            res.json(analysis);
        } catch (e) {
            console.error("Failed to parse JSON response:", cleanText);
            res.status(500).json({ error: "AI returned invalid data format." });
        }

    } catch (error) {
        console.error('Server error during analysis:', error);
        res.status(500).json({ error: 'Internal server error during analysis.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
