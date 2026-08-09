import crypto from "crypto";


const API_URL = "https://api-sg.aliexpress.com/sync";

// يبني التوقيع (signature) المطلوب من AliExpress Open Platform (خوارزمية MD5 الرسمية)
function buildSign(params, appSecret) {
  const sortedKeys = Object.keys(params).sort();
  let base = appSecret;
  for (const key of sortedKeys) {
    base += key + params[key];
  }
  base += appSecret;
  return crypto.createHash("md5").update(base, "utf8").digest("hex").toUpperCase();
}

async function callAliExpressApi(method, extraParams) {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;

  const timestamp = Date.now().toString();

  const params = {
    method,
    app_key: appKey,
    sign_method: "md5",
    timestamp,
    format: "json",
    v: "2.0",
    ...extraParams,
  };

  params.sign = buildSign(params, appSecret);

  const query = new URLSearchParams(params).toString();

  const res = await fetch(`${API_URL}?${query}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`AliExpress API error: ${res.status}`);
  }
  return res.json();
}

// بحث خام بدون فلترة/تنسيق — يُستخدم فقط من داخل سكريبت المزامنة (sync)
export async function rawSearch(keywords, pageSize = 50) {
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID;
  const extraParams = {
    keywords,
    tracking_id: trackingId,
    page_size: String(pageSize),
    target_currency: "USD",
    target_language: "AR",
  };
  const data = await callAliExpressApi("aliexpress.affiliate.product.query", extraParams);
  const result = data?.aliexpress_affiliate_product_query_response?.resp_result?.result;
  return result?.products?.product || [];
}

// بحث عن منتجات بكلمات مفتاحية + فلتر سعر اختياري
export async function searchProducts({ keywords, minPrice, maxPrice, sort }) {
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID;

  const extraParams = {
    keywords,
    tracking_id: trackingId,
    // نجيب عدد أكبر من المرشحين عشان نقدر نفلتر الأدق منهم بعدين
    page_size: "50",
    target_currency: "USD",
    target_language: "AR",
  };

  // لو المستخدم محددش ترتيب واضح (رخيص/غالي/الأكثر مبيعاً)، سيبنا AliExpress
  // يرجع بالترتيب الافتراضي (الأقرب صلة) بدل ما نفرض ترتيب بيدي نتائج غير دقيقة
  if (sort && sort !== "RELEVANCE") {
    extraParams.sort = sort;
  }

  if (minPrice) extraParams.min_sale_price = minPrice;
  if (maxPrice) extraParams.max_sale_price = maxPrice;

  const data = await callAliExpressApi(
    "aliexpress.affiliate.product.query",
    extraParams
  );

  const result =
    data?.aliexpress_affiliate_product_query_response?.resp_result?.result;

  if (!result || !result.products) return [];

  const mapped = result.products.product.map((p) => ({
    id: p.product_id,
    title: p.product_title,
    image: p.product_main_image_url,
    price: p.target_sale_price,
    originalPrice: p.target_original_price,
    currency: p.target_sale_price_currency,
    rating: p.evaluate_rate,
    orders: parseInt(p.lastest_volume) || 0,
    affiliateLink: p.promotion_link,
  }));

  return rerankByRelevance(mapped, keywords).slice(0, 20);
}

// يرتب النتائج حسب مدى تطابق العنوان مع كلمات البحث الفعلية،
// بدل الاعتماد بس على "الأكثر مبيعاً" اللي ممكن يجيب ملحقات غير مقصودة
function rerankByRelevance(products, keywords) {
  const terms = keywords
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2); // نتجاهل كلمات قصيرة زي "to" أو "for"

  const scored = products.map((p) => {
    const title = (p.title || "").toLowerCase();
    const matchCount = terms.filter((t) => title.includes(t)).length;
    // نعطي وزن إضافي بسيط لعدد الطلبات كمرجّح ثانوي، مش أساسي
    const score = matchCount * 1000 + Math.min(p.orders, 500);
    return { ...p, _score: score, _matchCount: matchCount };
  });

  // لو فيه منتجات بتطابق كل كلمات البحث على الأقل جزئياً، نفضلها
  const relevant = scored.filter((p) => p._matchCount > 0);
  const pool = relevant.length >= 5 ? relevant : scored;

  return pool.sort((a, b) => b._score - a._score);
}

// المنتجات "الساخنة" (الأكثر مبيعاً/رواجاً حالياً) — تُستخدم لملء الصفحة عند فتحها
export async function getHotProducts({ category, pageSize = 24 } = {}) {
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID;

  const extraParams = {
    tracking_id: trackingId,
    page_size: String(pageSize),
    target_currency: "USD",
    target_language: "AR",
    sort: "LAST_VOLUME_DESC",
  };
  if (category) extraParams.category_ids = category;

  const data = await callAliExpressApi(
    "aliexpress.affiliate.hotproduct.query",
    extraParams
  );

  const result =
    data?.aliexpress_affiliate_hotproduct_query_response?.resp_result?.result;

  if (!result || !result.products) return [];

  return result.products.product.map((p) => ({
    id: p.product_id,
    title: p.product_title,
    image: p.product_main_image_url,
    price: p.target_sale_price,
    originalPrice: p.target_original_price,
    currency: p.target_sale_price_currency,
    rating: p.evaluate_rate,
    orders: p.lastest_volume,
    affiliateLink: p.promotion_link,
  }));
}
