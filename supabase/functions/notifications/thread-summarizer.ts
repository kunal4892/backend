import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY"));
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro"
});
// Summarize only threads older than this many seconds
const STALE_AFTER_SECONDS = 7200; // 2 hours
serve(async (req)=>{
  try {
    if (req.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: cors()
    });
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - STALE_AFTER_SECONDS * 1000).toISOString();
    console.log("🔍 Looking for threads older than", twoHoursAgo);
    const { data: threads, error: fetchErr } = await supabase.from("threads").select("id, summary_updated_at").or(`summary_updated_at.is.null,summary_updated_at.lt.${twoHoursAgo}`).limit(20); // limit for safety per run
    if (fetchErr) throw fetchErr;
    if (!threads?.length) {
      console.log("✅ No stale threads found.");
      return json({
        message: "No threads to summarize"
      });
    }
    console.log(`🧠 Found ${threads.length} stale threads.`);
    const results = [];
    for (const t of threads){
      try {
        const summary = await summarizeThread(t.id);
        results.push({
          threadId: t.id,
          summary
        });
        console.log(`✅ Summarized thread ${t.id}`);
      } catch (err) {
        console.error(`❌ Failed to summarize thread ${t.id}:`, err.message);
      }
    }
    return json({
      success: true,
      updated: results.length
    });
  } catch (err) {
    console.error("❌ cron-thread-summarizer error:", err);
    return json({
      error: err.message
    }, 500);
  }
});
async function summarizeThread(threadId) {
  const { data: messages, error } = await supabase.from("messages").select("role, text, created_at").eq("thread_id", threadId).order("created_at", {
    ascending: true
  });
  if (error || !messages?.length) throw new Error("No messages found");
  const text = messages.map((m)=>`${m.role.toUpperCase()}: ${m.text}`).join("\n");
  const prompt = `
Summarize the following chat between a user and an AI companion.
Keep it under 150 words.
Include:
- Topics discussed
- Emotional tone
- Relationship dynamics
- Key context that will help continue future replies naturally.

Messages:
${text}
`;
  const result = await model.generateContent(prompt);
  const summary = result.response.text().trim();
  await supabase.from("threads").update({
    summary,
    summary_updated_at: new Date().toISOString()
  }).eq("id", threadId);
  return summary;
}
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: cors()
  });
}
