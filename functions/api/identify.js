export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing GEMINI_API_KEY in environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  try {
    const { image, mimeType = "image/jpeg", language = "en" } = await context.request.json();
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image payload received." }),
        { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    // Clean base64 payload to prevent decoder INVALID_ARGUMENT errors
    const cleanBase64 = image.replace(/^data:image\/[a-z]+;base64,/, "").trim();

    const langMap = {
      hi: "Hindi (हिन्दी)",
      pa: "Punjabi (ਪੰਜਾਬੀ)",
      en: "English"
    };
    const targetLang = langMap[language] || "English";

    // Pinned to gemini-3.5-flash-lite
    const model = context.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `You are a clinical botanical pathologist.
Analyze this photo and provide a direct diagnostic report.
Target language for human-readable values: ${targetLang}. Keep 'latin_name' in botanical Latin.
If the image is not a plant or leaf, set is_plant to false.
Do not provide conversational filler, pleasantries, or speculative fluff.`;

    // Gemini 3.5 Flash-Lite compliant configuration:
    // NO temperature, NO top_p, NO top_k, NO thinkingBudget
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 280,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              is_plant: { type: "BOOLEAN" },
              name: { type: "STRING" },
              latin_name: { type: "STRING" },
              status: { type: "STRING", enum: ["HEALTHY", "STRESSED", "DISEASED", "PEST"] },
              issue: { type: "STRING" },
              symptoms: { type: "STRING" },
              treatment: { type: "STRING" },
              light: { type: "STRING" },
              water: { type: "STRING" },
              pet_safe: { type: "BOOLEAN" }
            },
            required: ["is_plant"]
          }
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: err.error?.message || `Gemini API error (${response.status})` }),
        { status: response.status, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      throw new Error("Empty diagnostic received from Gemini 3.5 Flash-Lite.");
    }

    return new Response(raw, {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
