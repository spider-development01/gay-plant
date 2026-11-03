export async function onRequestPost(context) {
  // 1. Read environment variable from Cloudflare Pages settings
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing GEMINI_API_KEY in Cloudflare Pages Environment Variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { image, mimeType } = await context.request.json();
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image received." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const model = context.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `You are a master botanist.
Analyze this photo. If NOT a plant/leaf/flower/succulent, set "is_plant": false.
If it is a plant, return ONLY valid JSON with this schema:
{
  "is_plant": true,
  "confidence": 98,
  "common_name": "Common Plant Name",
  "scientific_name": "Botanical Latin Name",
  "family": "Plant Family",
  "origin": "Native geographic origin",
  "care_level": "Easy" | "Moderate" | "Challenging",
  "health": {
    "status": "Healthy" | "Minor Stress" | "Distressed",
    "notes": "Observation of leaf condition, hydration, and color"
  },
  "light": "Sunlight requirements",
  "water": "Watering routine and moisture check",
  "soil": "Soil type and drainage advice",
  "pet_safe": false,
  "pet_details": "Toxicity info for dogs and cats",
  "propagation": "Brief instructions on how to propagate",
  "summary": "2-sentence overview of its characteristics",
  "fun_fact": "One captivating botanical fact"
}`;

    // 2. Call Gemini 3.5 Flash Lite
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
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.error?.message || "Gemini API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();

    return new Response(clean, {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
