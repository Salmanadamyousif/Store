import { createClient } from "@supabase/supabase-js";

let cachedClient = null;

// نستخدم service_role key (مش anon key) لأن المزامنة بتكتب في القاعدة،
// وده كود سيرفر فقط (API routes) مش بيوصل للمتصفح أبداً
export function getSupabase() {
  if (cachedClient) return cachedClient;

  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }

  cachedClient = createClient(url, key);
  return cachedClient;
}
