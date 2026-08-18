// The Kord Breach season's fixed structure — same for every player.
//
// Two things never vary between players: which document TYPES exist (the
// game only has so many), and which reward sits at which level, on which
// page, for what total document count. What genuinely differs from player
// to player is only the *breakdown* — how many of each type a given level
// costs you specifically. That breakdown is the one thing this app still
// treats as personal, user-owned data (state.levels[i].cost); everything
// else here is baked in.
//
// Update this file (and re-run scripts/generate-template.js if still using
// spreadsheet import/export) if a future season changes the lineup.

// Order here is the order document type icons/steppers render in, in the
// sidebar and on tile cost rows.
const DOCUMENT_TYPES = [
  'Financial documents',
  'PMC personell files',
  'Project documentation',
  'Blueprints and technical documentation',
  'Test documentation',
  'User documentation',
  'Medical documents',
  'Technical documentation',
  'Classified documents',
];

// totalDocuments is the target every level's cost breakdown must sum to —
// used to validate hand-entered or imported costs (see EXPECTED_SEASON_TOTAL
// in main.js for the whole-season 501 check, which is just the sum of these).
const LEVELS = [
  { id: 1, page: 1, reward: 'Marked dogtag (Grey)', itemName: 'marked_dogtag_grey', totalDocuments: 1 },
  { id: 2, page: 1, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 3 },
  { id: 3, page: 1, reward: 'BURN poster', itemName: 'burn_poster', totalDocuments: 3 },
  { id: 4, page: 1, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 3 },
  { id: 5, page: 1, reward: 'Black wood ceiling', itemName: 'black_wood_ceiling', totalDocuments: 5 },
  { id: 6, page: 2, reward: 'Gentex Ops-Core SOTR respirator', itemName: 'gentex_ops-core_sotr_respirator', totalDocuments: 4 },
  { id: 7, page: 2, reward: 'Red Hawaii', itemName: 'red_hawaii', totalDocuments: 7 },
  { id: 8, page: 2, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 3 },
  { id: 9, page: 2, reward: 'Scorpion Target', itemName: 'scorpion_target', totalDocuments: 3 },
  { id: 10, page: 2, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 3 },
  { id: 11, page: 3, reward: 'Mystery Ranch NICE Frame Load Sling', itemName: 'mystery_ranch_nice_frame_load_sling', totalDocuments: 4 },
  { id: 12, page: 3, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 5 },
  { id: 13, page: 3, reward: 'Black Herringbone', itemName: 'black_herringbone', totalDocuments: 7 },
  { id: 14, page: 3, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 5 },
  { id: 15, page: 3, reward: 'Heart', itemName: 'heart', totalDocuments: 4 },
  { id: 16, page: 4, reward: 'Marked dogtag (Green)', itemName: 'marked_dogtag_green', totalDocuments: 5 },
  { id: 17, page: 4, reward: 'Microtech Jagdkommando knife', itemName: 'microtech_jagdkommando_knife', totalDocuments: 10 },
  { id: 18, page: 4, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 5 },
  { id: 19, page: 4, reward: 'Beware the Bear poster', itemName: 'beware_the_bear_poster', totalDocuments: 5 },
  { id: 20, page: 4, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 5 },
  { id: 21, page: 5, reward: 'Orange Hawaii', itemName: 'orange_hawaii', totalDocuments: 10 },
  { id: 22, page: 5, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 7 },
  { id: 23, page: 5, reward: 'Black Division target', itemName: 'black_division_target', totalDocuments: 5 },
  { id: 24, page: 5, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 6 },
  { id: 25, page: 5, reward: 'Ferro Concepts FCPC V5 Plate Carrier (Black Division)', itemName: 'ferro_concepts_fcpc_5_plate_carrier_black_division', totalDocuments: 7 },
  { id: 26, page: 6, reward: 'Knyazev', itemName: 'knyazev', totalDocuments: 13 },
  { id: 27, page: 6, reward: "O'Connor", itemName: 'oconnor', totalDocuments: 12 },
  { id: 28, page: 6, reward: 'Howa Type 20 5.56x45 assault rifle', itemName: 'howa_type_20_5.56x45_assault_rifle', totalDocuments: 11 },
  { id: 29, page: 7, reward: 'Marked dogtag (Red)', itemName: 'marked_dogtag_red', totalDocuments: 10 },
  { id: 30, page: 7, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 9 },
  { id: 31, page: 7, reward: 'Scorpion upper', itemName: 'scorpion_upper', totalDocuments: 13 },
  { id: 32, page: 7, reward: 'Scorpion lower', itemName: 'scorpion_lower', totalDocuments: 13 },
  { id: 33, page: 8, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 6 },
  { id: 34, page: 8, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 14 },
  { id: 35, page: 8, reward: 'White accent walls', itemName: 'white_accent_walls', totalDocuments: 13 },
  { id: 36, page: 8, reward: 'Arch', itemName: 'arch', totalDocuments: 6 },
  { id: 37, page: 8, reward: 'Dome', itemName: 'dome', totalDocuments: 4 },
  { id: 38, page: 9, reward: 'Spiritus Systems LV-119 Plate Carrier (Black Divison V2)', itemName: 'spiritus_systems_lv-119_plate_carrier_black_division_v2', totalDocuments: 12 },
  { id: 39, page: 9, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 6 },
  { id: 40, page: 9, reward: 'Tasmanian Tiger Modular Pack 45 Plus (MultiCam Black)', itemName: 'tasmanian_tiger_modular_pack_45_plus_multicam_black', totalDocuments: 9 },
  { id: 41, page: 9, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 5 },
  { id: 42, page: 9, reward: 'Server Room', itemName: 'server_room', totalDocuments: 18 },
  { id: 43, page: 10, reward: 'Anton', itemName: 'anton', totalDocuments: 20 },
  { id: 44, page: 10, reward: 'Garrett', itemName: 'garrett', totalDocuments: 20 },
  { id: 45, page: 10, reward: 'Black Division gear crate', itemName: 'black_division_gear_crate', totalDocuments: 7 },
  { id: 46, page: 10, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 13 },
  { id: 47, page: 11, reward: 'Marked dogtag (Red Bullet Hole)', itemName: 'marked_dogtag_red_bullet_hole', totalDocuments: 11 },
  { id: 48, page: 11, reward: 'TarCoin', itemName: 'tarcoin', totalDocuments: 16 },
  { id: 49, page: 11, reward: 'Knyazev (After Battle)', itemName: 'knyazev_after_battle', totalDocuments: 19 },
  { id: 50, page: 11, reward: "O'Connor (After Battle)", itemName: 'oconnor_after_battle', totalDocuments: 19 },
  { id: 51, page: 12, reward: 'Norinco QBZ-191 5.8x42 assault rifle', itemName: 'norinco_qbz-191_5.8x42_assault_rifle', totalDocuments: 29 },
  { id: 52, page: 12, reward: 'Nocturnal upper', itemName: 'nocturnal_upper', totalDocuments: 25 },
  { id: 53, page: 12, reward: 'Nocturnal lower', itemName: 'nocturnal_lower', totalDocuments: 23 },
];

module.exports = { DOCUMENT_TYPES, LEVELS };
