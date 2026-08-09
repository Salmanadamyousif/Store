// كلمات بتدل إن المنتج ملحق (accessory) مش الجهاز/المنتج الأساسي نفسه.
// ده أهم جزء بيحل مشكلة "بحثت عن بلايستيشن وطلع كابل" —
// بنحسبها مرة واحدة وقت المزامنة، مش في كل بحث.
const ACCESSORY_WORDS = [
  "case", "cover", "cable", "charger", "adapter", "converter",
  "protector", "holder", "stand", "strap", "skin", "sticker",
  "screen protector", "pouch", "sleeve", "mount", "dock",
  "replacement part", "spare part", "controller grip",
];


export function isAccessory(title) {
  const t = title.toLowerCase();
  return ACCESSORY_WORDS.some((word) => t.includes(word));
}

export function normalizeProduct(raw, seedKeyword) {
  return {
    provider: "aliexpress",
    provider_product_id: String(raw.product_id),
    title: raw.product_title,
    image: raw.product_main_image_url,
    price: parseFloat(raw.target_sale_price) || null,
    original_price: parseFloat(raw.target_original_price) || null,
    currency: raw.target_sale_price_currency || "USD",
    rating: raw.evaluate_rate || null,
    orders_count: parseInt(raw.lastest_volume) || 0,
    affiliate_link: raw.promotion_link,
    seed_keyword: seedKeyword,
    is_accessory: isAccessory(raw.product_title || ""),
    search_text: (raw.product_title || "").toLowerCase(),
    is_active: true,
    synced_at: new Date().toISOString(),
  };
}
