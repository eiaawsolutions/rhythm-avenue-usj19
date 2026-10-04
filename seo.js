// Server-side rendering of crawlable content + structured data.
// Everything is generated from public/facts.js so the page, schema, llms.txt and the AI chat never disagree.
import { HOUSE, faqs, factSheet } from "./public/facts.js";

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const RM = (n) => "RM " + Number(n).toLocaleString("en-MY");
const known = (v) => v !== null && v !== undefined;
export const DATE_POSTED = "2026-09-30";
export const IMAGES = ["og.jpg", "img/living.jpg", "img/living-wide.jpg", "img/kitchen.jpg", "img/bedroom-main.jpg", "img/bedroom-2.jpg", "img/bathroom.jpg", "img/laundry.jpg", "img/yard.jpg"];

export function factsHtml(H = HOUSE) {
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${known(v) ? esc(v) : '<span class="pending">Ask owners</span>'}</dd>`;
  return `
  <div><h3>The unit</h3><dl>
    ${row("Type", H.propertyType)}${row("Bedrooms", H.bedrooms)}${row("Bathroom", H.bathrooms)}
    ${row("Size", H.sizeSqft + " sq ft")}${row("Floor", H.unitFloor + "th (high floor)")}${row("Furnishing", H.furnishing)}
    ${row("Parking", H.parking)}${row("Pets", known(H.petsAllowed) ? (H.petsAllowed ? "Allowed" : "Not allowed") : null)}
  </dl></div>
  <div><h3>Costs & move-in</h3><dl>
    ${row("Rent", RM(H.rent) + " / month")}${row("Deposit", RM(H.deposit) + " (3.5 mo)")}
    ${row("Utilities", H.utilitiesIncluded ? "Tenant pays" : null)}${row("Available", H.availableFrom ? "Immediately" : null)}
    ${row("Min. tenancy", H.minTenancy)}${row("Legal fees", "Extra (owners confirm)")}${row("Tenants", H.tenantPreference)}
  </dl></div>
  <div><h3>Building</h3><dl>
    ${row("Type", H.building.type)}${row("Tenure", H.building.tenure)}${row("Completed", H.building.completed)}
    ${row("Blocks", H.building.blocks)}${row("Floors", H.building.floors)}${row("Units", H.building.totalUnits.toLocaleString("en-MY"))}
  </dl><ul style="margin-top:14px">${H.facilities.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`;
}

export function areaHtml(H = HOUSE) {
  const N = H.neighbourhood;
  const box = (title, items) => `<div><h3>${esc(title)}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Rhythm Avenue USJ 19 Subang Jaya");
  return `<div class="area">
    ${box("Getting around", N.transit)}
    ${box("Shopping", N.shopping)}
    ${box("Schools & universities", N.schools)}
    ${box("Healthcare", N.healthcare)}
    ${box("Highways", N.roads)}
    ${box("Work & business", N.business)}
    <div class="map"><span><b>${esc(H.address)} ${esc(H.postcode)}</b></span><a class="btn btn-ghost" href="${maps}" target="_blank" rel="noopener">Open in Google Maps</a></div>
  </div>`;
}

export function faqHtml() {
  return faqs().map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n");
}

export function jsonLd(site, H = HOUSE) {
  const url = site + "/";
  const img = IMAGES.map((p) => `${site}/${p}${p === "og.jpg" ? "?v=2" : ""}`);
  const address = { "@type": "PostalAddress", streetAddress: "Rhythm Avenue, USJ 19", addressLocality: "Subang Jaya", addressRegion: "Selangor", postalCode: H.postcode, addressCountry: "MY" };
  const feature = (name) => ({ "@type": "LocationFeatureSpecification", name, value: true });
  const description = `2-bedroom, 1-bathroom ${H.furnishing.toLowerCase()} apartment for rent at Rhythm Avenue, USJ 19, Subang Jaya, Selangor. ${H.sizeSqft} sq ft on floor ${H.unitFloor}. ${RM(H.rent)} per month, available now, minimum tenancy ${H.minTenancy}. Short walk to Wawasan LRT (Kelana Jaya Line) and 19 USJ City Mall.`;
  const graph = [
    {
      "@type": "WebSite", "@id": url + "#website", url, name: "Rhythm Avenue USJ 19 – Apartment for Rent", inLanguage: ["en-MY", "ms-MY", "zh-Hans-MY"],
    },
    {
      "@type": ["WebPage", "ItemPage"], "@id": url + "#webpage", url, name: "Apartment for Rent at Rhythm Avenue USJ 19, Subang Jaya", isPartOf: { "@id": url + "#website" },
      primaryImageOfPage: img[0], datePublished: DATE_POSTED, dateModified: new Date().toISOString().slice(0, 10), inLanguage: "en-MY",
      about: { "@id": url + "#apartment" }, mainEntity: { "@id": url + "#listing" },
    },
    {
      "@type": "RealEstateListing", "@id": url + "#listing", url, name: "2-Bedroom Apartment for Rent – Rhythm Avenue USJ 19, Subang Jaya", description,
      datePosted: DATE_POSTED, image: img, about: { "@id": url + "#apartment" },
      offers: {
        "@type": "Offer", businessFunction: "http://purl.org/goodrelations/v1#LeaseOut", price: H.rent, priceCurrency: "MYR",
        priceSpecification: { "@type": "UnitPriceSpecification", price: H.rent, priceCurrency: "MYR", unitCode: "MON", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } },
        availability: "https://schema.org/InStock", availabilityStarts: DATE_POSTED,
        seller: { "@type": "Person", name: "Private owners (no agent)" },
      },
    },
    {
      "@type": "Apartment", "@id": url + "#apartment", name: "Rhythm Avenue USJ 19 – 2-bedroom unit, floor " + H.unitFloor, description,
      numberOfRooms: H.bedrooms, numberOfBedrooms: H.bedrooms, numberOfBathroomsTotal: H.bathrooms, floorLevel: String(H.unitFloor),
      floorSize: { "@type": "QuantitativeValue", value: H.sizeSqft, unitCode: "FTK" }, petsAllowed: !!H.petsAllowed,
      amenityFeature: ["Refrigerator", "King-size bed frame", "Air-conditioning (master bedroom)", "Washing machine", "Water heater", "Cooking allowed", "Partially furnished"].map(feature),
      address, image: img, containedInPlace: { "@id": url + "#building" }, hasMap: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Rhythm Avenue USJ 19 Subang Jaya"),
    },
    {
      "@type": "ApartmentComplex", "@id": url + "#building", name: "Rhythm Avenue", alternateName: ["Rhythm Avenue USJ19", "Rhythm Avenue Subang Jaya"], address,
      numberOfAccommodationUnits: H.building.totalUnits, amenityFeature: H.facilities.map(feature), petsAllowed: !!H.petsAllowed,
      containedInPlace: { "@type": "Place", name: "USJ 19, Subang Jaya, Selangor, Malaysia" },
    },
    {
      "@type": "FAQPage", "@id": url + "#faq", mainEntity: faqs().map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}

export function renderPage(tpl, site) {
  return tpl
    .replaceAll("https://rhythm-avenue-usj19.pages.dev", site)
    .replace("<!--JSONLD-->", jsonLd(site))
    .replace("<!--FACTS-->", factsHtml())
    .replace("<!--AREA-->", areaHtml())
    .replace("<!--FAQ-->", faqHtml());
}

export function llmsTxt(site) {
  return `# Rhythm Avenue USJ 19 – 2-bedroom apartment for rent (Subang Jaya, Selangor, Malaysia)

> Privately listed by the owners. ${RM(HOUSE.rent)}/month, available now. Page: ${site}/

## Facts
${factSheet().split("\n").map((l) => "- " + l).join("\n")}

## FAQ
${faqs().map(([q, a]) => `- ${q} ${a}`).join("\n")}

## Enquire
- Use the enquiry form at ${site}/#enquire (the owners reply on WhatsApp).
`;
}

export function sitemapXml(site) {
  const today = new Date().toISOString().slice(0, 10);
  const imgs = IMAGES.map((p) => `<image:image><image:loc>${site}/${p}${p === "og.jpg" ? "?v=2" : ""}</image:loc></image:image>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url><loc>${site}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority>${imgs}</url>
</urlset>
`;
}
