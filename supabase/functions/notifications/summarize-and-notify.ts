import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "npm:jose";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
// 🔹 Firebase env vars
const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID");
const FCM_CLIENT_EMAIL = Deno.env.get("FCM_CLIENT_EMAIL");
const FCM_PRIVATE_KEY = Deno.env.get("FCM_PRIVATE_KEY");
// 🔹 Persona → Image mapping (could move to DB)
const PERSONA_IMAGES = {
  tara: "https://oendriwadwjztxqczqlp.supabase.co/storage/v1/object/sign/persona_images/tara.png?...",
  kabir: "https://oendriwadwjztxqczqlp.supabase.co/storage/v1/object/sign/persona_images/kabir.png?...",
  zoya: "https://oendriwadwjztxqczqlp.supabase.co/storage/v1/object/sign/persona_images/zoya.png?...",
  ramya: "https://oendriwadwjztxqczqlp.supabase.co/storage/v1/object/sign/persona_images/ramya.png?..."
};
// 🔹 Get OAuth2 access token for FCM
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const alg = "RS256";
  const fixedKey = FCM_PRIVATE_KEY.replace(/\\n/g, "\n");
  const privateKeyObj = await jose.importPKCS8(fixedKey, alg);
  const jwt = await new jose.SignJWT({
    iss: FCM_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }).setProtectedHeader({
    alg
  }).sign(privateKeyObj);
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Failed to get FCM token: " + JSON.stringify(data));
  return data.access_token;
}
// 🔹 Generate teaser using Gemini
async function generateTeaser(convo, personaName) {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;
  const convoText = convo.map((m)=>`${m.role === "user" ? "👤" : "🤖"}: ${m.text}`).join("\n");
  const prompt = `
You are ${personaName}, chatting casually in Hinglish.

Task: Write a **short teaser (max 20 words)** to re-engage the user.  
⚠️ IMPORTANT: Every teaser must feel new and personal. Avoid repeating hooks like "Hey", "missing you", "come back".  
Use curiosity, humor, or callbacks to recent convo.`;
  const r = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${prompt}\n\n${convoText}`
            }
          ]
        }
      ],
      generationConfig: {
        candidateCount: 1,
        temperature: 0.9
      }
    })
  });
  const data = await r.json();
  console.log("🔎 Gemini raw:", JSON.stringify(data, null, 2));
  return data?.candidates?.[0]?.content?.parts?.map((p)=>p.text).join(" ").trim() || "Chal na, baat karte hain 😉";
}
serve(async ()=>{
  try {
    // 1️⃣ Get all users with FCM token
    const { data: users } = await supabase.from("users").select("phone, fcm_token");
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({
        message: "No users"
      }), {
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const accessToken = await getAccessToken();
    for (const user of users){
      if (!user.fcm_token) continue;
      // 2️⃣ Get last thread for user
      const { data: thread } = await supabase.from("threads").select("id, persona_id, updated_at").eq("phone", user.phone).order("updated_at", {
        ascending: false
      }).limit(1).single();
      if (!thread) continue;
      // 3️⃣ Get last 30 messages
      const { data: messages } = await supabase.from("messages").select("role, text, created_at").eq("thread_id", thread.id).order("created_at", {
        ascending: false
      }).limit(30);
      if (!messages || messages.length === 0) continue;
      const convo = messages.reverse();
      const personaName = thread.persona_id || "AI Friend";
      // 🔹 Normalize persona key
      const personaKey = (thread.persona_id || "").toLowerCase();
      const personaImage = PERSONA_IMAGES[personaKey] || PERSONA_IMAGES["tara"];
      // 4️⃣ Generate teaser
      const teaser = await generateTeaser(convo, personaName);
      // 4.5️⃣ Insert teaser into DB
      const { error: insertError } = await supabase.from("messages").insert({
        thread_id: thread.id,
        role: "bot",
        text: teaser,
        created_at: new Date().toISOString()
      });
      if (insertError) console.error("❌ Failed to insert teaser:", insertError);
      // 5️⃣ Send push notification
      const msg = {
        message: {
          token: user.fcm_token,
          notification: {
            title: personaName,
            body: teaser,
            image: personaImage
          },
          data: {
          }
        }
      };
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(msg)
      });
      console.log("📤 FCM response", await r.json());
    }
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("❌ summarize-and-notify error:", err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500
    });
  }
});
