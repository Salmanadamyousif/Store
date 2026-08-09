import { getSupabase } from "../../lib/supabase";

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("is_accessory", false) // نستبعد الملحقات من العرض الافتراضي
      .order("orders_count", { ascending: false })
      .limit(24);

    if (error) throw error;

    const products = data.map(mapRow);

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=1800, stale-while-revalidate=900"
    );
    return res.status(200).json({ products });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not load trending products" });
  }
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
