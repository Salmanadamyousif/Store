import { useState, useEffect } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [interpreted, setInterpreted] = useState(null);
  const [products, setProducts] = useState(null);
  const [source, setSource] = useState(null);
  const [mode, setMode] = useState("trending"); // "trending" | "search"

  useEffect(() => {
    loadTrending();
  }, []);

  async function loadTrending() {
    setLoading(true);
    setError(null);
    setInterpreted(null);
    setMode("trending");
    try {
      const res = await fetch("/api/trending");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setProducts(data.products);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setProducts(null);
    setMode("search");

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Something went wrong");

      setInterpreted(data.interpreted);
      setProducts(data.products);
      setSource(data.source || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuery("");
    loadTrending();
  }

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="brand-eyebrow">Smart Search · AI-Powered</div>
          <h1>Tell us what you need.<br />We'll find it for you.</h1>
          <p>
            A search box that understands intent, not just keywords. Type your
            request the way you'd say it out loud.
          </p>

          <form className="search-box" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="e.g. cheap wireless earbuds for the gym"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          <div className="hint-row">
            {mode === "search" ? (
              <button className="link-btn" onClick={handleClear}>
                ← Back to trending products
              </button>
            ) : (
              'Try: "gift for my dad on a budget" or "best selling fast charger"'
            )}
          </div>

          {interpreted && (
            <div className="receipt">
              <div>
                <span className="label">Understood as:</span>
                {interpreted.keywords}
              </div>
              <div className="chips">
                {interpreted.min_price && (
                  <span className="chip">from ${interpreted.min_price}</span>
                )}
                {interpreted.max_price && (
                  <span className="chip">up to ${interpreted.max_price}</span>
                )}
                <span className="chip">
                  {(!interpreted.sort || interpreted.sort === "RELEVANCE") && "Best match"}
                  {interpreted.sort === "SALE_PRICE_ASC" && "Cheapest first"}
                  {interpreted.sort === "SALE_PRICE_DESC" && "Priciest first"}
                  {interpreted.sort === "LAST_VOLUME_DESC" && "Best sellers"}
                </span>
                {source === "live" && (
                  <span className="chip">🔎 fresh search</span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="results">
        <div className="wrap">
          {mode === "trending" && !loading && !error && (
            <div className="section-label">🔥 Trending right now</div>
          )}

          {error && <div className="state-msg">⚠ {error}</div>}

          {loading && (
            <div className="state-msg">
              <span className="spinner" />
              {mode === "trending"
                ? "Loading trending products..."
                : "Understanding your request and finding matches..."}
            </div>
          )}

          {!loading && products && products.length === 0 && (
            <div className="state-msg">No matches found, try rephrasing your search.</div>
          )}

          {!loading && products && products.length > 0 && (
            <div className="grid">
              {products.map((p) => (
                <div className="card" key={p.id}>
                  <img src={p.image} alt={p.title} loading="lazy" />
                  <div className="card-body">
                    <div className="card-title">{p.title}</div>
                    <div className="price-row">
                      <span className="price">
                        {p.price} {p.currency}
                      </span>
                      {p.originalPrice && p.originalPrice !== p.price && (
                        <span className="price-original">
                          {p.originalPrice} {p.currency}
                        </span>
                      )}
                    </div>
                    <div className="meta-row">
                      <span>⭐ {p.rating || "—"}</span>
                      <span>{p.orders || 0} sold</span>
                    </div>
                    <a
                      className="buy-btn"
                      href={p.affiliateLink}
                      target="_blank"
                      rel="noopener noreferrer nofollow sponsored"
                    >
                      View product
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer>
        This site contains affiliate links — we may earn a commission on
        purchases you make, at no extra cost to you.
      </footer>
    </>
  );
}
