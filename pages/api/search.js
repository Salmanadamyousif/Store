import { getSupabase } from "../../lib/supabase";
import { searchProducts as liveSearch } from "../../lib/aliexpress";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

// نطلب من Gemini يحول جملة المستخدم لكلمات بحث + فلاتر واضحة
async function interpretQuery(userQuery) {
  const apiKey = process.env.GEMINI_API_KEY;

  const prompt = `You analyze shopping requests (written in Arabic or English) and turn them into precise English search keywords for an AliExpress store.

Rules:
- Be specific. If the user names a product category (e.g. "PlayStation"), assume they mean the main product (e.g. "PlayStation 5 console"), not accessories, cables, or converters for it — unless they explicitly ask for an accessory.
- Keep keywords short and product-focused (2-5 words).
- Only set "sort" to something other than "RELEVANCE" if the user explicitly asks for cheap/expensive/best-selling. Otherwise default to "RELEVANCE" so results stay accurate.

Return ONLY valid JSON, no markdown, no explanation, in exactly this shape:
{
  "keywords": "english search keywords, max 5 words",
  "min_price": number or null,
  "max_price": number or null,
  "sort": "RELEVANCE" or "SALE_PRICE_ASC" or "SALE_PRICE_DESC" or "LAST_VOLUME_DESC"
}

User request: "${userQuery}"`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(
      `Gemini returned no content: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  // أحياناً Gemini بيرجع الـ JSON ملفوف بعلامات ```json ... ```
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON: ${cleaned.slice(0, 300)}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query } = req.body;
  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: "Please enter a search term" });
  }

  try {
    const interpreted = await interpretQuery(query);

    let products = await searchDatabase(interpreted);
    let source = "database";

    // لو القاعدة المتزامنة معندهاش نتيجة (كلمة برة الفئات اللي عندنا)،
    // نلجأ للبحث الحي في AliExpress كخط دعم — أبطأ شوية، بس بيغطي أي منتج
    if (products.length === 0) {
      products = await liveSearch({
        keywords: interpreted.keywords,
        minPrice: interpreted.min_price,
        maxPrice: interpreted.max_price,
        sort: interpreted.sort,
      });
      source = "live";

      // نضيف اللي لقيناه للقاعدة عشان المرة الجاية يبقى سريع.
      // لازم ننتظرها (await) هنا لأن Vercel بيوقف تنفيذ أي كود بعد
      // إرسال الرد للمستخدم مباشرة — عملية في الخلفية مش مضمونة تكمل.
      try {
        await cacheLiveResults(products, interpreted.keywords);
      } catch (e) {
        console.error("Caching live results failed:", e.message);
      }
    }

    return res.status(200).json({
      interpreted,
      products,
      source, // مفيد للتشخيص: هل جت من القاعدة السريعة ولا البحث الحي
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong, please try again" });
  }
}

async function cacheLiveResults(products, seedKeyword) {
  if (!products || products.length === 0) return;
  const { normalizeProduct } = await import("../../lib/normalize");
  const supabase = getSupabase();

  const rows = products.map((p) =>
    normalizeProduct(
      {
        product_id: p.id,
        product_title: p.title,
        product_main_image_url: p.image,
        target_sale_price: p.price,
        target_original_price: p.originalPrice,
        target_sale_price_currency: p.currency,
        evaluate_rate: p.rating,
        lastest_volume: p.orders,
        promotion_link: p.affiliateLink,
      },
      seedKeyword
    )
  );

  await supabase.from("products").upsert(rows, { onConflict: "provider,provider_product_id" });
}

async function searchDatabase({ keywords, min_price, max_price, sort }) {
  const supabase = getSupabase();

  const terms = keywords
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  function baseQuery() {
    let q = supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("is_accessory", false);

    if (min_price) q = q.gte("price", min_price);
    if (max_price) q = q.lte("price", max_price);

    if (sort === "SALE_PRICE_ASC") q = q.order("price", { ascending: true });
    else if (sort === "SALE_PRICE_DESC") q = q.order("price", { ascending: false });
    else q = q.order("orders_count", { ascending: false });

    return q.limit(20);
  }

  // المحاولة 1: العبارة كاملة (أدق نتيجة لو موجودة)
  let { data, error } = await baseQuery().ilike("search_text", `%${keywords.toLowerCase()}%`);
  if (error) throw error;
  if (data.length > 0) return data.map(mapRow);

  // المحاولة 2: أي كلمة من الكلمات المستخرجة (تغطية أوسع لو القاعدة لسه صغيرة)
  if (terms.length > 0) {
    const orFilter = terms.map((t) => `search_text.ilike.%${t}%`).join(",");
    ({ data, error } = await baseQuery().or(orFilter));
    if (error) throw error;
  }

  return data.map(mapRow);
}

function mapRow(row) {
  return {
    id: row.provider_product_id,
    title: row.title,
    image: row.image,
    price: row.price,
    originalPrice: row.original_price,
    currency: row.currency,
    rating: row.rating,
    orders: row.orders_count,
    affiliateLink: row.affiliate_link,
  };
}
