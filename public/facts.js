// ─────────────────────────────────────────────────────────────
//  SINGLE SOURCE OF TRUTH for the listing.
//  Both the web page and the AI assistant read from this file.
//  Edit here → redeploy → the page AND the AI answers update.
//  Anything set to null is "unknown" — the AI will say the owner
//  will confirm instead of guessing.
// ─────────────────────────────────────────────────────────────
export const HOUSE = {
  // ---- Owner settings (EDIT THESE) ----
  ownerWhatsApp: "60XXXXXXXXX",          // e.g. "60123456789" – no +, no dashes
  ownerDisplayName: "The owners (Amos & wife)",
  availableFrom: null,                   // e.g. "1 November 2026"
  minTenancy: null,                      // e.g. "12 months"
  petsAllowed: null,                     // true / false / null
  parking: null,                         // e.g. "1 covered bay included"
  utilitiesIncluded: null,               // e.g. "Not included – tenant pays TNB, water, internet"
  tenantPreference: "Malaysian citizens",
  viewing: "By appointment – send an enquiry and the owners will arrange a time.",

  // ---- Listing facts (from the Mudah.my listing, ad 98377236) ----
  title: "Rhythm Avenue USJ19",
  tagline: "A place with all you need",
  address: "Rhythm Avenue, USJ 19, Subang Jaya, Selangor",
  rent: 1500,
  deposit: 5250,                         // RM – 3.5 months' rent in total
  depositNote: "RM 5,250 in total (equal to 3.5 months' rent). The owners will confirm the split between security and utility deposit.",
  propertyType: "Apartment",
  furnishing: "Partially furnished",
  bedrooms: 2,
  bathrooms: 1,
  floorRange: "High floor",
  sizeSqft: 430,                         // as listed on Mudah – verify
  building: { completed: 2008, floors: 20, totalUnits: 1036 },
  facilities: ["24-hour security", "Lift", "Swimming pool", "Gymnasium", "Sauna", "Squash court",
               "Jogging track", "Playground", "Minimart", "Multipurpose hall"],
  amenities: ["Air-conditioning", "Cooking allowed", "Near KTM/LRT", "Washing machine"],

  // ---- What is visible in the photos ----
  inUnit: [
    "Grey fabric L-shaped sofa with adjustable headrests",
    "White TV console",
    "White dining table with 2 chairs",
    "Tall white shoe cabinet by the door",
    "Ceiling fans in the living room and master bedroom",
    "Air-conditioner in the master bedroom",
    "Wall lamps and ceiling light in the master bedroom",
    "Full-length mirror in the second bedroom",
    "Kitchen with sink, tiled worktops, dish rack and louvre windows",
    "Toshiba top-load washing machine in the utility yard",
    "Ceiling clothes-drying rack in the yard",
    "Bathroom with rain shower and electric water heater",
    "Tiled floors throughout; teal feature walls; grilled windows",
  ],
  notIncluded: "Beds, mattresses and wardrobes are not shown in the photos — ask the owners what is provided.",
};

export const FORM_FIELDS = [
  { id: "name",        label: "Name",                               type: "text",   required: true },
  { id: "nationality", label: "Nationality",                        type: "text",   required: true, value: "Malaysian" },
  { id: "race",        label: "Race",                               type: "text",   required: true },
  { id: "religion",    label: "Religion",                           type: "text",   required: true },
  { id: "occupants",   label: "How many people stay",               type: "number", required: true, min: 1, max: 6 },
  { id: "relation",    label: "Family / Friends",                   type: "select", required: true, options: ["NA (staying alone)", "Family", "Friends", "Couple"] },
  { id: "occupation",  label: "Occupation",                         type: "text",   required: true },
  { id: "pets",        label: "Do you have any pet?",               type: "select", required: true, options: ["No", "Yes"] },
  { id: "duration",    label: "How long you are looking to stay?",  type: "select", required: true, options: ["Less than 1 year", "1 year", "1-2 years", "2+ years"] },
  { id: "moveIn",      label: "Move-in Date",                       type: "date",   required: true },
  { id: "budget",      label: "Budget",                             type: "text",   required: true, placeholder: "e.g. RM1,300 – 1,500" },
  { id: "phone",       label: "WhatsApp number",                    type: "tel",    required: true, placeholder: "e.g. 012-345 6789" },
];

// Plain-text fact sheet used as the AI's only knowledge.
export function factSheet(h = HOUSE) {
  const u = (v) => (v === null || v === undefined ? "UNKNOWN – owner will confirm" : v);
  return [
    `Property: ${h.title} — ${h.address}`,
    `Type: ${h.propertyType}, ${h.furnishing}, ${h.bedrooms} bedrooms, ${h.bathrooms} bathroom, ${h.floorRange}`,
    `Size: ${h.sizeSqft} sq ft (as listed)`,
    `Rent: RM ${h.rent.toLocaleString("en-MY")} per month`,
    `Deposit: ${h.depositNote}`,
    `Building: completed ${h.building.completed}, ${h.building.floors} floors, ${h.building.totalUnits} units`,
    `Facilities: ${h.facilities.join(", ")}`,
    `Amenities: ${h.amenities.join(", ")}`,
    `In the unit (from photos): ${h.inUnit.join("; ")}`,
    `Note: ${h.notIncluded}`,
    `Available from: ${u(h.availableFrom)}`,
    `Minimum tenancy: ${u(h.minTenancy)}`,
    `Pets allowed: ${h.petsAllowed === null ? "UNKNOWN – owner will confirm" : h.petsAllowed ? "Yes" : "No"}`,
    `Parking: ${u(h.parking)}`,
    `Utilities: ${u(h.utilitiesIncluded)}`,
    `Tenant preference: ${h.tenantPreference}`,
    `Viewing: ${h.viewing}`,
  ].join("\n");
}
