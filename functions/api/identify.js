export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing GEMINI_API_KEY." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { image, mimeType = "image/jpeg", language = "en" } = await context.request.json();
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image received." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const langDirectives = {
      hi: "Hindi (हिन्दी)",
      pa: "Punjabi (ਪੰਜਾਬੀ)",
      en: "English"
    };
    const targetLang = langDirectives[language] || "English";

    // Use gemini-2.0-flash-lite for lowest cost per token
    const model = context.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `You are a clinical plant pathologist. Diagnose the photo.
Target language for text fields: ${targetLang}. Keep 'latin_name' in botanical Latin.
If not a plant/leaf, set is_plant=false.
Output direct, strictly actionable facts. No pleasantries or fluff.`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: image } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 250,
          responseMimeType: "application/json",
          // Disables reasoning token overhead on 2.0+ models
          thinkingConfig: { thinkingBudget: 0 },
          responseSchema: {
            type: "OBJECT",
            properties: {
              is_plant: { type: "BOOLEAN" },
              name: { type: "STRING" },
              latin_name: { type: "STRING" },
              status: { 
                type: "STRING", 
                enum: ["HEALTHY", "STRESSED", "DISEASED", "PEST"] 
              },
              issue: { type: "STRING", description: "Identified disease/pest/deficiency or 'None'" },
              symptoms: { type: "STRING", description: "Direct visual signs in max 15 words" },
              treatment: { type: "STRING", description: "Direct fix in max 25 words or 'Continue routine'" },
              light: { type: "STRING", description: "e.g., Bright Indirect" },
              water: { type: "STRING", description: "e.g., Allow top 2 in to dry" },
              pet_safe: { type: "BOOLEAN" }
            },
            required: ["is_plant"]
          }
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.error?.message || "API Error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Empty model response.");

    return new Response(raw, {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
