// Cloudflare Worker — route: rent.eiaawsolutions.com/*
// Answers link-preview crawlers (Meta/Facebook/Threads/Instagram, WhatsApp, X, LinkedIn, Telegram…)
// at Cloudflare's edge so Meta never depends on Railway's edge. Normal visitors pass straight through.
const BOT = /facebookexternalhit|facebookcatalog|meta-external|Facebot|Instagram|Threads|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|Pinterest|redditbot/i;
const SITE = "https://rent.eiaawsolutions.com";
const T = "🏠 For Rent: Rhythm Avenue USJ19 · RM1,500/month";
const D = "Available now · 2 bed, 649 sq ft, 29th floor · Fridge & king bed frame · Pool, gym, 24h security · Near KTM/LRT.";
const IMG = SITE + "/og.jpg?v=2";
const FALLBACK_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${T}</title><meta name="description" content="${D}"><link rel="canonical" href="${SITE}/"><meta property="og:type" content="website"><meta property="og:site_name" content="Rhythm Avenue USJ19 – For Rent"><meta property="og:title" content="${T}"><meta property="og:description" content="${D}"><meta property="og:url" content="${SITE}/"><meta property="og:image" content="${IMG}"><meta property="og:image:secure_url" content="${IMG}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Rhythm Avenue USJ19 unit for rent, RM1,500 per month"><meta property="og:locale" content="en_MY"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${T}"><meta name="twitter:description" content="${D}"><meta name="twitter:image" content="${IMG}"></head><body><h1>${T}</h1><p>${D}</p><p><a href="${SITE}/">View photos, details and enquire</a></p></body></html>`;
const NEUTRAL = { "user-agent": "Mozilla/5.0 (compatible; RentPreviewEdge/1.0; +https://rent.eiaawsolutions.com)", accept: "*/*" };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua = request.headers.get("user-agent") || "";
    if (!BOT.test(ua) || url.pathname.startsWith("/api/")) return fetch(request);

    const head = request.method === "HEAD";
    if (url.pathname === "/robots.txt") {
      return new Response(head ? null : "User-agent: *\nAllow: /\nDisallow: /api/\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "x-preview-edge": "robots" },
      });
    }

    const isAsset = /\.(jpe?g|png|webp|gif|ico|svg|js|css|xml|txt)$/i.test(url.pathname);
    try {
      const res = await fetch(url.toString(), { headers: NEUTRAL, cf: { cacheEverything: true, cacheTtl: isAsset ? 86400 : 300 } });
      if (res.ok) {
        const out = new Response(head ? null : res.body, res);
        out.headers.delete("set-cookie");
        out.headers.set("x-preview-edge", "origin");
        return out;
      }
    } catch (e) { /* fall through */ }

    if (isAsset) return new Response(null, { status: 502, headers: { "x-preview-edge": "asset-failed" } });
    return new Response(head ? null : FALLBACK_HTML, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", "x-preview-edge": "fallback" },
    });
  },
};
