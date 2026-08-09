import { rawSearch } from "../../lib/aliexpress";
import { normalizeProduct } from "../../lib/normalize";
import { getSupabase } from "../../lib/supabase";

// كلمات البذرة (seed keywords) — الفئات الأساسية اللي هنسحبها بشكل دوري.
// وسّع القائمة دي براحتك لما تحب تضيف فئات جديدة للموقع.
// كل كلمة بتسحب لحد 50 منتج، فكل ما زودت الكلمات كل ما القاعدة كبرت.
const SEED_KEYWORDS = [
  // إلكترونيات وألعاب
  "smartphone",
  "playstation console",
  "xbox console",
  "nintendo switch",
  "wireless earbuds",
  "smart watch",
  "laptop",
  "tablet",
  "bluetooth speaker",
  "headphones",
  "gaming keyboard",
  "gaming mouse",
  "monitor screen",
  "power bank",
  "webcam",
  "drone camera",
  "action camera",
  "fitness tracker",
  "wireless charger",
  "router wifi",

  // منزل ومطبخ
  "kitchen gadget",
  "air fryer",
  "coffee maker",
  "vacuum cleaner",
  "led light",
  "home decor",

  // موضة وإكسسوارات
  "backpack",
  "sunglasses",
  "watch men",
  "handbag women",
  "sneakers shoes",
  "jewelry set",

  // رياضة وأطفال
  "yoga mat",
  "dumbbells",
  "bicycle accessories",
  "kids toys",
  "baby products",

  // عناية وجمال
  "skincare set",
  "makeup kit",
  "hair dryer",
  "perfume",
];

export default async function handler(req, res) {
  // حماية: لو ضبطت متغير بيئة اسمه CRON_SECRET، Vercel Cron هيبعته
  // تلقائياً كـ "Authorization: Bearer <CRON_SECRET>" — التشغيل اليدوي
  // بيحتاج نفس القيمة كـ query param
  const isCronRequest = req.headers["authorization"] === `Bearer ${process.env.CRON_SECRET}`;
  const isManualRequest = req.query.secret === process.env.CRON_SECRET;

  if (!isCronRequest && !isManualRequest) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = getSupabase();
  const results = [];

  for (const keyword of SEED_KEYWORDS) {
    try {
      const rawProducts = await rawSearch(keyword, 50);
      const normalized = rawProducts.map((p) => normalizeProduct(p, keyword));

      if (normalized.length > 0) {
        const { error } = await supabase
          .from("products")
          .upsert(normalized, { onConflict: "provider,provider_product_id" });

        if (error) throw error;
      }

      results.push({ keyword, count: normalized.length, status: "ok" });
    } catch (err) {
      console.error(`Sync failed for "${keyword}":`, err.message);
      results.push({ keyword, status: "failed", error: err.message });
    }
  }

  return res.status(200).json({ syncedAt: new Date().toISOString(), results });
}
