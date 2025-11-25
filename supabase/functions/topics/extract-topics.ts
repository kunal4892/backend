/******************************************************************************************
 * 📍 extract-topics
 *
 * Analyzes conversation messages and extracts:
 *  ✅ Topics/interests mentioned by user
 *  ✅ User's sentiment/mood
 *  ✅ Key entities (people, places, events)
 *  ✅ Updates user_topics table
 ******************************************************************************************/ 
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

// Setup
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY"));
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  try {
    // JWT Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const decoded = await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    const phone = decoded.payload.phone;
    
    if (!phone) {
      return json({ error: "Invalid token" }, 401);
    }

    const { threadId, recentMessages } = await req.json();
    
    if (!threadId || !recentMessages || recentMessages.length === 0) {
      return json({ error: "Missing threadId or recentMessages" }, 400);
    }

    // Extract topics using Gemini
    const topics = await extractTopics(recentMessages, phone);
    
    return json({ success: true, topics });

  } catch (err) {
    console.error("❌ extract-topics error:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// 🧠 Extract Topics from Conversation
// ---------------------------------------------------------------------------
async function extractTopics(messages: any[], phone: string) {
  // Build conversation text
  const conversationText = messages
    .filter(m => m.role === "user") // Only analyze user messages
    .map(m => m.text)
    .join("\n");

  const prompt = `
Analyze this chat conversation and extract insights in JSON format:

CONVERSATION:
${conversationText}

Extract the following in JSON:
{
  "topics": [
    {
      "category": "sports|movies|relationships|career|food|travel|health|hobbies|other",
      "keywords": ["specific", "words", "mentioned"],
      "sentiment": "positive|negative|neutral",
      "context": "brief 1-line summary of user's interest"
    }
  ],
  "mood": "happy|sad|excited|confused|anxious|neutral|frustrated|romantic",
  "keyEntities": {
    "people": ["names mentioned"],
    "places": ["locations mentioned"],
    "events": ["activities or events mentioned"]
  }
}

Rules:
- Only include topics the USER is clearly interested in or talking about
- Be specific with categories (e.g., if they mention cricket, use "sports")
- Context should be 1 sentence max
- Only include entities actually mentioned
- Return ONLY valid JSON, no other text

JSON:`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    
    // Extract JSON from response (might have markdown code blocks)
    let jsonText = text;
    if (text.includes("```json")) {
      jsonText = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
      jsonText = text.split("```")[1].split("```")[0].trim();
    }
    
    const extracted = JSON.parse(jsonText);
    
    // Store in database
    await storeTopics(phone, extracted);
    
    return extracted;
  } catch (err) {
    console.error("Failed to extract topics:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 💾 Store Topics in Database
// ---------------------------------------------------------------------------
async function storeTopics(phone: string, extracted: any) {
  if (!extracted?.topics || extracted.topics.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  for (const topic of extracted.topics) {
    try {
      // Upsert: update if exists, insert if not
      const { data: existing } = await supabase
        .from("user_topics")
        .select("*")
        .eq("phone", phone)
        .eq("topic_category", topic.category)
        .maybeSingle();

      if (existing) {
        // Update existing topic
        await supabase
          .from("user_topics")
          .update({
            keywords: Array.from(new Set([...existing.keywords, ...topic.keywords])),
            sentiment: topic.sentiment,
            frequency: existing.frequency + 1,
            last_mentioned: now,
            context: topic.context, // Update with latest context
            updated_at: now,
          })
          .eq("id", existing.id);
      } else {
        // Insert new topic
        await supabase
          .from("user_topics")
          .insert({
            phone,
            topic_category: topic.category,
            keywords: topic.keywords,
            sentiment: topic.sentiment,
            frequency: 1,
            first_mentioned: now,
            last_mentioned: now,
            context: topic.context,
            created_at: now,
            updated_at: now,
          });
      }
    } catch (err) {
      console.warn("Failed to store topic:", topic.category, err);
    }
  }

  console.log(`✅ Stored ${extracted.topics.length} topics for ${phone}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: cors(),
  });
}

