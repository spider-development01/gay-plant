export async function onRequestPost(context) {
  // 1. Read environment variable from Cloudflare Pages settings
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing GEMINI_API_KEY in Cloudflare Pages Environment Variables." }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  try {
    // 2. Read image, mimeType, and chosen language (defaults to 'en')
    const { image, mimeType, language = "en" } = await context.request.json();
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image received." }),
        { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    // 3. Configure Language Prompt Directives
    const languageConfig = {
      hi: {
        name: "Hindi (हिन्दी)",
        instruction: "Write all human-readable values (common_name, family, origin, care_level, health status/notes, light, water, soil, pet_details, propagation, summary, fun_fact) in natural, fluent Hindi using Devanagari script. Keep 'scientific_name' in botanical Latin."
      },
      pa: {
        name: "Punjabi (ਪੰਜਾਬੀ)",
        instruction: "Write all human-readable values (common_name, family, origin, care_level, health status/notes, light, water, soil, pet_details, propagation, summary, fun_fact) in natural, fluent Punjabi using Gurmukhi script. Keep 'scientific_name' in botanical Latin."
      },
      en: {
        name: "English",
        instruction: "Write all values in English. Keep 'scientific_name' in botanical Latin."
      }
    };

    const targetLang = languageConfig[language] || languageConfig.en;

    const model = context.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `You are an expert botanist and horticulturist.
Analyze the provided photo.
If the image does NOT contain a plant, leaf, flower, or succulent, return valid JSON with: {"is_plant": false}.

TARGET LANGUAGE: ${targetLang.name}.
LANGUAGE REQUIREMENT: ${targetLang.instruction}

If it is a plant, return ONLY valid JSON matching this schema:
{
  "is_plant": true,
  "confidence": 95,
  "common_name": "Common Name in ${targetLang.name}",
  "scientific_name": "Botanical Latin Name",
  "family": "Plant Family in ${targetLang.name}",
  "origin": "Native geographic origin in ${targetLang.name}",
  "care_level": "Care difficulty in ${targetLang.name}",
  "health": {
    "status": "Healthy / Stress condition in ${targetLang.name}",
    "notes": "Assessment of leaves, stems, hydration in ${targetLang.name}"
  },
  "light": "Sunlight requirements in ${targetLang.name}",
  "water": "Watering instructions in ${targetLang.name}",
  "soil": "Soil and drainage advice in ${targetLang.name}",
  "pet_safe": true,
  "pet_details": "Toxicity info for pets in ${targetLang.name}",
  "propagation": "Brief instructions on how to propagate in ${targetLang.name}",
  "summary": "2-sentence overview in ${targetLang.name}",
  "fun_fact": "One captivating botanical fact in ${targetLang.name}"
}`;

    // 4. Call Gemini API
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
                  data: image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.error?.message || "Gemini API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      throw new Error("No response received from Gemini.");
    }

    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();

    return new Response(clean, {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
