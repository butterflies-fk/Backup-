module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        let body = req.body;

        if (!body) {
            return res.status(400).json({ error: 'No body received' });
        }

        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                return res.status(400).json({ error: 'Invalid JSON body' });
            }
        }

        let image = body.image;

        if (!image) {
            return res.status(400).json({ error: 'No image received' });
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
        }

        // remove base64 prefix if present
        if (image.includes(',')) {
            image = image.split(',')[1];
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    inline_data: {
                                        mime_type: 'image/jpeg',
                                        data: image
                                    }
                                },
                                {
                                    text: `
Return ONLY valid JSON (no markdown, no explanation, no extra text).
Format:
{
  "issue": "string",
  "description": "1-2 sentences describing what you see",
  "solution": "2-3 short actionable steps separated by newlines"
}
`
                                }
                            ]
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            return res.status(500).json({
                error: 'Gemini API request failed',
                details: errText
            });
        }

        const data = await response.json();

        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText || typeof rawText !== 'string') {
            return res.status(500).json({
                error: 'Empty or invalid AI response',
                debug: data
            });
        }

        // safer JSON extraction
        let result;

        try {
            const jsonStart = rawText.indexOf('{');
            const jsonEnd = rawText.lastIndexOf('}') + 1;

            if (jsonStart === -1 || jsonEnd <= 0) {
                throw new Error('No JSON object found in response');
            }

            const jsonString = rawText.slice(jsonStart, jsonEnd);
            result = JSON.parse(jsonString);

        } catch (err) {
            return res.status(500).json({
                error: 'Failed to parse AI response JSON',
                raw: rawText
            });
        }

        return res.status(200).json(result);

    } catch (error) {
        return res.status(500).json({
            error: error.message || 'Unknown server error'
        });
    }
};