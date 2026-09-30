import { HOUSE, FORM_FIELDS } from "./facts.js";
const $ = (s, el = document) => el.querySelector(s);
const RM = (n) => "RM " + Number(n).toLocaleString("en-MY");
const hasWA = /^\d{9,15}$/.test(HOUSE.ownerWhatsApp);
const unknown = (v) => v === null || v === undefined;

/* ---------- facts ---------- */
const row = (k, v) => `<dt>${k}</dt><dd>${unknown(v) ? '<span class="pending">Ask owners</span>' : v}</dd>`;
$("#facts").innerHTML = `
  <div><h3>The unit</h3><dl>
    ${row("Type", HOUSE.propertyType)}${row("Bedrooms", HOUSE.bedrooms)}${row("Bathroom", HOUSE.bathrooms)}
    ${row("Size", HOUSE.sizeSqft + " sq ft")}${row("Floor", HOUSE.floorRange)}${row("Furnishing", HOUSE.furnishing)}
    ${row("Parking", HOUSE.parking)}${row("Pets", unknown(HOUSE.petsAllowed) ? null : HOUSE.petsAllowed ? "Allowed" : "Not allowed")}
  </dl></div>
  <div><h3>Costs & move-in</h3><dl>
    ${row("Rent", RM(HOUSE.rent) + " / month")}${row("Deposit", RM(HOUSE.deposit) + " (3.5 mo)")}
    ${row("Utilities", HOUSE.utilitiesIncluded ? "Tenant pays" : null)}${row("Available", HOUSE.availableFrom ? "Immediately" : null)}
    ${row("Min. tenancy", HOUSE.minTenancy)}${row("Legal fees", "Extra (owners confirm)")}${row("Tenants", HOUSE.tenantPreference)}
  </dl></div>
  <div><h3>Building</h3><dl>
    ${row("Completed", HOUSE.building.completed)}${row("Floors", HOUSE.building.floors)}${row("Units", HOUSE.building.totalUnits.toLocaleString())}
  </dl><ul style="margin-top:14px">${HOUSE.facilities.map((f) => `<li>${f}</li>`).join("")}</ul></div>`;

/* ---------- gallery lightbox ---------- */
const lb = $("#lb");
$("#gallery").addEventListener("click", (e) => {
  const img = e.target.closest("figure")?.querySelector("img"); if (!img) return;
  $("img", lb).src = img.src; $("img", lb).alt = img.alt; lb.showModal();
});
lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });

/* ---------- chat ---------- */
const log = $("#log"), input = $("#q"), send = $("#send");
const history = [];
let useLocal = false;

function bubble(text, who) {
  const d = document.createElement("div");
  d.className = "msg " + who; d.textContent = text; log.appendChild(d);
  log.scrollTop = log.scrollHeight; return d;
}
function interestCta() {
  const a = document.createElement("a");
  a.href = "#enquire"; a.className = "btn btn-primary cta-inline"; a.textContent = "I'm interested → fill in the form";
  log.appendChild(a); log.scrollTop = log.scrollHeight;
}
const INTEREST = /\b(view|viewing|visit|interested|rent it|book|take it|move in|minat|nak sewa|tengok rumah|lawat)\b/i;

// Offline/fallback answers, driven by the same facts (used if the AI endpoint is unavailable)
function localAnswer(q) {
  const t = q.toLowerCase(), H = HOUSE;
  const ask = "The owners will confirm that. Send an enquiry below and they'll reply on WhatsApp.";
  const rules = [
    [/deposit|cagaran/, () => `Deposit: ${H.depositNote} Legal fees for the tenancy agreement are charged separately.`],
    [/legal|stamp|agreement fee|lawyer|guaman|duti setem|other (fee|charge|cost)|extra (fee|charge|cost)|hidden/, () => `Legal fees: ${H.legalFees}`],
    [/rent|price|harga|sewa|how much|berapa|cost/, () => `Rent is ${RM(H.rent)} per month. The deposit is ${RM(H.deposit)} in total, which is 3.5 months' rent. Legal fees for the tenancy agreement are charged separately.`],
    [/park|parkir|car|kereta/, () => H.parking ? `Parking: ${H.parking.toLowerCase() === "not included" ? "not included with this unit." : H.parking + "."}` : "Parking isn't specified in the listing. " + ask],
    [/pet|cat|dog|kucing|anjing|haiwan/, () => unknown(H.petsAllowed) ? "The pet policy hasn't been set yet. The owners will confirm. Send an enquiry below and they'll reply on WhatsApp." : H.petsAllowed ? "Yes, pets are allowed." : "Sorry, pets are not allowed."],
    [/bed ?room|bilik|room/, () => `There are ${H.bedrooms} bedrooms and ${H.bathrooms} bathroom. The master bedroom has a king-size bed frame, an air-conditioner, a ceiling fan and wall lamps. ${H.notIncluded}`],
    [/bath|toilet|shower|heater|tandas/, () => `There is ${H.bathrooms} bathroom, with a rain shower and an electric water heater.`],
    [/fridge|refrigerator|peti ais|peti sejuk/, () => "Yes, a refrigerator is included."],
    [/\bbed\b|bed ?frame|katil|mattress|tilam/, () => "The master bedroom comes with a king-size bed frame. A mattress and a bed for the second bedroom are not listed, so ask the owners if you need them."],
    [/furnish|furniture|perabot|sofa|bed\b|wardrobe|almari|katil|tilam|fridge|refrigerator|peti/, () => `The unit is ${H.furnishing.toLowerCase()}. It comes with: ${H.inUnit.slice(0, 7).join("; ")}. ${H.notIncluded}`],
    [/air ?con|aircon|cond|fan|kipas/, () => "There's an air-conditioner in the master bedroom, plus ceiling fans in the living room and master bedroom."],
    [/wash|laundry|mesin basuh|dry/, () => "Yes. There's a Toshiba top-load washing machine in the utility yard, plus a ceiling clothes-drying rack."],
    [/cook|kitchen|masak|dapur/, () => "Cooking is allowed. The kitchen has a sink, tiled worktops, a dish rack and louvre windows."],
    [/pool|gym|facilit|kemudahan|sauna|squash|security|guard|pengawal|playground/, () => `Facilities: ${H.facilities.join(", ")}.`],
    [/lrt|ktm|mrt|train|transport|bus|station|tren/, () => "The listing says the building is near KTM/LRT. The owners can share the exact route when you arrange a viewing."],
    [/size|sq|square|luas|keluasan/, () => `The listed size is ${H.sizeSqft} sq ft.`],
    [/floor|tingkat|level|high/, () => `The unit is on a ${H.floorRange.toLowerCase()} of a ${H.building.floors}-floor building completed in ${H.building.completed}.`],
    [/avail|move|pindah|when|bila|start|kosong|ready/, () => H.availableFrom ? "It's available now and ready for immediate occupation." : "Move-in date is flexible. " + ask],
    [/tenancy|contract|kontrak|how long|lease|year|tahun|minimum/, () => H.minTenancy ? `The minimum tenancy is ${H.minTenancy}. Legal fees for the tenancy agreement are charged separately.` : ask],
    [/utilit|electric|water|wifi|internet|tnb|air\b|elektrik|indah|bill|bil/, () => H.utilitiesIncluded ? `Utilities are ${H.utilitiesIncluded.charAt(0).toLowerCase() + H.utilitiesIncluded.slice(1)}. They are not included in the rent.` : ask],
    [/where|location|address|lokasi|alamat|area/, () => `${H.address}. The building is near KTM/LRT.`],
    [/view|visit|lawat|tengok|appointment/, () => H.viewing],
    [/foreign|nationality|warganegara|citizen/, () => `The owners are looking for ${H.tenantPreference}.`],
    [/^(hi|hello|hey|salam|assalam|hai)\b/, () => "Hi! Ask me anything about the unit: rent, rooms, facilities or move-in."],
  ];
  for (const [re, fn] of rules) if (re.test(t)) return fn();
  return "I don't have that detail yet. " + ask;
}

async function ask(q) {
  q = q.trim(); if (!q) return;
  bubble(q, "me"); history.push({ role: "user", content: q });
  input.value = ""; send.disabled = true;
  const typing = bubble("", "ai typing"); typing.innerHTML = "<i></i><i></i><i></i>";
  let reply = null;
  if (!useLocal) {
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history }) });
      if (r.ok) reply = (await r.json()).reply; else useLocal = r.status === 503 || r.status === 404 || r.status === 405;
    } catch { useLocal = true; }
  }
  if (!reply) { await new Promise((res) => setTimeout(res, 450)); reply = localAnswer(q); }
  typing.remove(); bubble(reply, "ai"); history.push({ role: "assistant", content: reply });
  if (INTEREST.test(q) || /form below|fill in/i.test(reply)) interestCta();
  send.disabled = false; input.focus({ preventScroll: true });
}
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });

const SUGGEST = ["What's the deposit?", "Is it furnished?", "Is parking included?", "Are pets allowed?", "What facilities are there?", "Near LRT?", "Boleh masak?"];
SUGGEST.forEach((s) => { const b = document.createElement("button"); b.type = "button"; b.textContent = s; b.onclick = () => ask(s); $("#chips").appendChild(b); });
bubble(`Hi! 👋 I can tell you anything about this ${HOUSE.bedrooms}-bedroom unit at Rhythm Avenue USJ19. It's ${RM(HOUSE.rent)} a month, on a high floor and partially furnished. What would you like to know?`, "ai");

/* ---------- enquiry form ---------- */
const fieldsEl = $("#fields");
FORM_FIELDS.forEach((f) => {
  const w = document.createElement("div"); w.className = "field";
  const req = f.required ? "required" : "";
  let ctrl;
  if (f.type === "select") ctrl = `<select id="f_${f.id}" name="${f.id}" ${req}><option value="" disabled selected>Select…</option>${f.options.map((o) => `<option>${o}</option>`).join("")}</select>`;
  else ctrl = `<input id="f_${f.id}" name="${f.id}" type="${f.type}" ${req} ${f.min ? `min="${f.min}"` : ""} ${f.max ? `max="${f.max}"` : ""} ${f.value ? `value="${f.value}"` : ""} ${f.placeholder ? `placeholder="${f.placeholder}"` : ""} ${f.type === "tel" ? 'inputmode="tel" autocomplete="tel"' : ""} ${f.id === "name" ? 'autocomplete="name"' : ""}>`;
  w.innerHTML = `<label for="f_${f.id}">${f.label}</label>${ctrl}`;
  fieldsEl.appendChild(w);
});
$("#f_moveIn").min = new Date().toISOString().slice(0, 10);

function waText(d) {
  const date = d.moveIn ? new Date(d.moveIn + "T00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "";
  return `Hi, I'm interested in the Rhythm Avenue USJ19 unit (RM1,500).\n\n` +
    `Name: ${d.name}\nNationality: ${d.nationality}\nRace: ${d.race}\nReligion: ${d.religion}\n` +
    `How many people stay: ${d.occupants}\nFamily / Friends: ${d.relation}\nOccupation: ${d.occupation}\n` +
    `Do you have any pet?: ${d.pets}\nHow long you are looking to stay?: ${d.duration}\n` +
    `Move-in Date: ${date}\nBudget: ${d.budget}\nWhatsApp: ${d.phone}`;
}

$("#enqForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target, msg = $("#formMsg"), btn = $("#submitBtn");
  if (!form.checkValidity()) {
    form.reportValidity();
    msg.textContent = "Please complete all fields and tick the consent box."; return;
  }
  const d = Object.fromEntries(new FormData(form).entries());
  btn.disabled = true; msg.textContent = "Sending…";
  let saved = false;
  try {
    const r = await fetch("/api/enquiry", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...d, consent: $("#consent").checked }) });
    saved = r.ok;
    if (r.status === 429) { msg.textContent = "Too many enquiries from this device today. Please try again tomorrow."; btn.disabled = false; return; }
  } catch {}
  const text = waText(d);
  const wa = hasWA ? `https://wa.me/${HOUSE.ownerWhatsApp}?text=${encodeURIComponent(text)}` : null;
  $("#formBody").innerHTML = `<div class="done">
      <div class="eyebrow">${saved ? "Enquiry received" : "Almost done"}</div>
      <h3>Thanks, ${d.name.split(" ")[0].replace(/[<>&"]/g, "")}!</h3>
      <p>${wa ? "Tap below to send your details to the owners on WhatsApp. That's the fastest way to get a reply." : "The owners will contact you on WhatsApp shortly."}</p>
      <pre></pre>
      ${wa ? `<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">Send on WhatsApp</a>` : ""}
    </div>`;
  $("#formBody pre").textContent = text;
  $("#enquire").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- sharing ---------- */
const url = location.origin + location.pathname;
const shareMsg = "2-bedroom for rent at Rhythm Avenue USJ19, Subang Jaya: RM1,500/month, high floor, pool & gym. Ask the AI anything:";
const enc = encodeURIComponent;
const links = [
  ["WhatsApp", `https://wa.me/?text=${enc(shareMsg + " " + url)}`],
  ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
  ["Telegram", `https://t.me/share/url?url=${enc(url)}&text=${enc(shareMsg)}`],
  ["X", `https://twitter.com/intent/tweet?text=${enc(shareMsg)}&url=${enc(url)}`],
  ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`],
];
const sr = $("#shareRow");
links.forEach(([n, h]) => { const a = document.createElement("a"); a.href = h; a.target = "_blank"; a.rel = "noopener"; a.textContent = n; sr.appendChild(a); });
const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "Copy link";
copy.onclick = async () => { try { await navigator.clipboard.writeText(url); copy.textContent = "Link copied ✓"; } catch { prompt("Copy this link:", url); } setTimeout(() => (copy.textContent = "Copy link"), 2000); };
sr.appendChild(copy);
document.querySelectorAll("[data-share]").forEach((b) => b.addEventListener("click", async () => {
  if (navigator.share) { try { await navigator.share({ title: document.title, text: shareMsg, url }); } catch {} }
  else $("#share").scrollIntoView({ behavior: "smooth" });
}));

document.querySelector("#lb button").addEventListener("click", () => lb.close());
