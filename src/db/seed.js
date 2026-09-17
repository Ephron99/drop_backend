const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./pool');
const env = require('../config/env');

// ============================================================
// Rwanda Hubs
// ============================================================
const seedHubs = [
  { id: 'hub-kigali',   name: 'Kigali Hub',   region: 'Kigali City' },
  { id: 'hub-eastern',  name: 'Eastern Hub',  region: 'Eastern Province' },
  { id: 'hub-southern', name: 'Southern Hub', region: 'Southern Province' },
  { id: 'hub-western',  name: 'Western Hub',  region: 'Western Province' },
  { id: 'hub-northern', name: 'Northern Hub', region: 'Northern Province' },
];

// ============================================================
// Seed Users
// ============================================================
const seedUsers = [
  // Nation-level roles (no hub)
  { id: 'user-sm-001', email: 'director@company.com',     name: 'General Tarek Mostafa', role: 'senior_manager', branch: null, hubId: null },
  { id: 'user-sa-001', email: 'superadmin@company.com',   name: 'Super Admin',            role: 'admin',          branch: null, hubId: null },

  // Kigali Hub — hub_manager + branch_managers
  { id: 'user-hm-kig', email: 'planner@company.com',       name: 'Ahmad Fathy',          role: 'hub_manager',    branch: null,       hubId: 'hub-kigali' },
  { id: 'user-bm-kig', email: 'manager@branch.com',         name: 'Theogene Tuyishime',   role: 'branch_manager', branch: 'Kicukiro', hubId: 'hub-kigali' },
  { id: 'user-bm-k2',  email: 'manager.jabana@reg.rw',      name: 'Olivier Habimana',     role: 'branch_manager', branch: 'Jabana',   hubId: 'hub-kigali' },
  { id: 'user-bm-k3',  email: 'manager.remera@reg.rw',      name: 'Claude Niyonzima',     role: 'branch_manager', branch: 'Remera',   hubId: 'hub-kigali' },

  // Eastern Hub
  { id: 'user-hm-east', email: 'manager.eastern@reg.rw',   name: 'Jean Pierre Habimana', role: 'hub_manager',    branch: null,       hubId: 'hub-eastern' },
  { id: 'user-bm-east', email: 'manager.bugesera@reg.rw',   name: 'Pascal Ndayishimiye',  role: 'branch_manager', branch: 'Bugesera', hubId: 'hub-eastern' },

  // Southern Hub
  { id: 'user-hm-south', email: 'manager.southern@reg.rw',  name: 'Marie Claire Uwase',   role: 'hub_manager',    branch: null,       hubId: 'hub-southern' },
  { id: 'user-bm-south', email: 'manager.kamonyi@reg.rw',    name: 'Fidele Nshimiyimana',  role: 'branch_manager', branch: 'Kamonyi',  hubId: 'hub-southern' },

  // Northern Hub
  { id: 'user-hm-north', email: 'manager.northern@reg.rw',  name: 'Emmanuel Bizimana',    role: 'hub_manager',    branch: null,       hubId: 'hub-northern' },
  { id: 'user-bm-north', email: 'manager.rulindo@reg.rw',    name: 'Janvier Nkurunziza',   role: 'branch_manager', branch: 'Rulindo',  hubId: 'hub-northern' },

  // Western Hub
  { id: 'user-hm-west', email: 'manager.western@reg.rw',    name: 'Clementine Mukamana',  role: 'hub_manager',    branch: null,       hubId: 'hub-western' },
  { id: 'user-bm-west', email: 'manager.karongi@reg.rw',     name: 'Alexis Ntirenganya',   role: 'branch_manager', branch: 'Karongi',  hubId: 'hub-western' },
];

// ============================================================
// Locations (linked to hubs)
// ============================================================
const seedLocations = [
  // Kigali Hub locations
  { id: 'loc-kig-001', name: 'Kicukiro Substation',  address: 'Kicukiro, Kigali',  governorate: 'Kigali City',       hubId: 'hub-kigali' },
  { id: 'loc-kig-002', name: 'Remera Feeder Station', address: 'Remera, Kigali',    governorate: 'Kigali City',       hubId: 'hub-kigali' },
  { id: 'loc-kig-003', name: 'Jabana Substation',     address: 'Jabana, Kigali',    governorate: 'Kigali City',       hubId: 'hub-kigali' },
  // Eastern Hub locations
  { id: 'loc-east-001', name: 'Bugesera Substation',  address: 'Bugesera, Eastern', governorate: 'Eastern Province',  hubId: 'hub-eastern' },
  { id: 'loc-east-002', name: 'Kayonza Feeder',       address: 'Kayonza, Eastern',  governorate: 'Eastern Province',  hubId: 'hub-eastern' },
  // Southern Hub locations
  { id: 'loc-south-001', name: 'Kamonyi Substation',  address: 'Kamonyi, Southern', governorate: 'Southern Province', hubId: 'hub-southern' },
  // Northern Hub locations
  { id: 'loc-north-001', name: 'Rulindo Substation',  address: 'Rulindo, Northern', governorate: 'Northern Province', hubId: 'hub-northern' },
  { id: 'loc-north-002', name: 'Gicumbi Feeder',      address: 'Gicumbi, Northern', governorate: 'Northern Province', hubId: 'hub-northern' },
  // Western Hub locations
  { id: 'loc-west-001', name: 'Karongi Substation',   address: 'Karongi, Western',  governorate: 'Western Province',  hubId: 'hub-western' },
];

// ============================================================
// Branches (linked to hubs)
// ============================================================
const seedBranches = [
  // Kigali Hub branches
  { id: 'br-kig-001', name: 'Kicukiro Branch',   hubId: 'hub-kigali',   lengthKm: 12.5, conductorType: 'ACSR 95mm2', status: 'energized' },
  { id: 'br-kig-002', name: 'Remera Branch',     hubId: 'hub-kigali',   lengthKm: 8.3,  conductorType: 'ACSR 95mm2', status: 'under_construction' },
  { id: 'br-kig-003', name: 'Jabana Branch',     hubId: 'hub-kigali',   lengthKm: 15.2, conductorType: 'AAC 120mm2',  status: 'planned' },
  // Eastern Hub branches
  { id: 'br-east-001', name: 'Bugesera Branch',  hubId: 'hub-eastern',  lengthKm: 22.0, conductorType: 'ACSR 95mm2', status: 'energized' },
  { id: 'br-east-002', name: 'Kayonza Branch',   hubId: 'hub-eastern',  lengthKm: 18.7, conductorType: 'AAC 95mm2',  status: 'under_construction' },
  // Southern Hub branches
  { id: 'br-south-001', name: 'Kamonyi Branch',  hubId: 'hub-southern', lengthKm: 19.4, conductorType: 'ACSR 95mm2', status: 'energized' },
  // Northern Hub branches
  { id: 'br-north-001', name: 'Rulindo Branch',  hubId: 'hub-northern', lengthKm: 14.1, conductorType: 'ACSR 95mm2', status: 'energized' },
  { id: 'br-north-002', name: 'Gicumbi Branch',  hubId: 'hub-northern', lengthKm: 16.8, conductorType: 'AAC 95mm2',  status: 'planned' },
  // Western Hub branches
  { id: 'br-west-001', name: 'Karongi Branch',   hubId: 'hub-western',  lengthKm: 25.6, conductorType: 'ACSR 95mm2', status: 'under_construction' },
];

// ============================================================
// Lines (feeders) — linked to branches
// ============================================================
const seedLines = [
  // Kicukiro Branch lines
  { id: 'line-kig-001', name: 'Kicukiro MV Feeder',     voltageLevel: 'MV', branchId: 'br-kig-001' },
  { id: 'line-kig-002', name: 'Kicukiro LV Ring',       voltageLevel: 'LV', branchId: 'br-kig-001' },
  // Remera Branch lines
  { id: 'line-kig-003', name: 'Remera MV Feeder',       voltageLevel: 'MV', branchId: 'br-kig-002' },
  // Jabana Branch lines
  { id: 'line-kig-004', name: 'Jabana LV Distribution', voltageLevel: 'LV', branchId: 'br-kig-003' },
  // Bugesera Branch lines
  { id: 'line-east-001', name: 'Bugesera MV Feeder',    voltageLevel: 'MV', branchId: 'br-east-001' },
  // Kayonza Branch lines
  { id: 'line-east-002', name: 'Kayonza LV Ring',       voltageLevel: 'LV', branchId: 'br-east-002' },
  // Kamonyi Branch lines
  { id: 'line-south-001', name: 'Kamonyi MV Feeder',    voltageLevel: 'MV', branchId: 'br-south-001' },
  // Rulindo Branch lines
  { id: 'line-north-001', name: 'Rulindo MV Feeder',    voltageLevel: 'MV', branchId: 'br-north-001' },
  // Gicumbi Branch lines
  { id: 'line-north-002', name: 'Gicumbi LV Ring',      voltageLevel: 'LV', branchId: 'br-north-002' },
  // Karongi Branch lines
  { id: 'line-west-001', name: 'Karongi MV Feeder',     voltageLevel: 'MV', branchId: 'br-west-001' },
];

// ============================================================
// Transformers
// ============================================================
const seedTransformers = [
  { id: 'tr-kig-001', name: 'TRF-KIC-001', serialNumber: 'TRF-KIC-MV-001', capacityKVA: 500, lineId: 'line-kig-001' },
  { id: 'tr-kig-002', name: 'TRF-KIC-002', serialNumber: 'TRF-KIC-MV-002', capacityKVA: 630, lineId: 'line-kig-001' },
  { id: 'tr-kig-003', name: 'TRF-KIC-LV-001', serialNumber: 'TRF-KIC-LV-001', capacityKVA: 250, lineId: 'line-kig-002' },
  { id: 'tr-kig-004', name: 'TRF-REM-001', serialNumber: 'TRF-REM-MV-001', capacityKVA: 500, lineId: 'line-kig-003' },
  { id: 'tr-kig-005', name: 'TRF-JAB-001', serialNumber: 'TRF-JAB-LV-001', capacityKVA: 315, lineId: 'line-kig-004' },
  { id: 'tr-east-001', name: 'TRF-BUG-001', serialNumber: 'TRF-BUG-MV-001', capacityKVA: 500, lineId: 'line-east-001' },
  { id: 'tr-east-002', name: 'TRF-KAY-LV-001', serialNumber: 'TRF-KAY-LV-001', capacityKVA: 250, lineId: 'line-east-002' },
  { id: 'tr-south-001', name: 'TRF-KAM-001', serialNumber: 'TRF-KAM-MV-001', capacityKVA: 630, lineId: 'line-south-001' },
  { id: 'tr-north-001', name: 'TRF-RUL-001', serialNumber: 'TRF-RUL-MV-001', capacityKVA: 500, lineId: 'line-north-001' },
  { id: 'tr-north-002', name: 'TRF-GIC-LV-001', serialNumber: 'TRF-GIC-LV-001', capacityKVA: 315, lineId: 'line-north-002' },
  { id: 'tr-west-001', name: 'TRF-KAR-001', serialNumber: 'TRF-KAR-MV-001', capacityKVA: 400, lineId: 'line-west-001' },
];

function nowIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function dateOnly(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

async function runSchema(conn) {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await conn.query(stmt);
  }
  console.log('[SEED] Schema initialized.');
}

async function seedHubsData(conn) {
  let inserted = 0;
  let skipped = 0;
  for (const h of seedHubs) {
    const [existing] = await conn.query(
      'SELECT id FROM hubs WHERE name = ? LIMIT 1',
      [h.name]
    );
    if (existing.length > 0) {
      h._uuid = existing[0].id;
      skipped++;
      continue;
    }
    const id = uuidv4();
    await conn.query(
      'INSERT INTO hubs (id, name, region) VALUES (?, ?, ?)',
      [id, h.name, h.region]
    );
    h._uuid = id;
    inserted++;
  }
  console.log(`[SEED] Hubs: ${inserted} inserted, ${skipped} already existed.`);
}

function findHubUuid(idKey) {
  const h = seedHubs.find((h) => h.id === idKey);
  return h ? h._uuid : null;
}

async function seedUsersData(conn) {
  const password = 'password123';
  const hash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  let inserted = 0;
  let skipped = 0;
  for (const u of seedUsers) {
    const [existing] = await conn.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [u.email]
    );
    if (existing.length > 0) {
      u._uuid = existing[0].id;
      // Update hub_id in case it changed
      await conn.query('UPDATE users SET hub_id = ? WHERE id = ?', [
        u.hubId ? findHubUuid(u.hubId) : null,
        existing[0].id,
      ]);
      skipped++;
      continue;
    }
    const id = uuidv4();
    const hubUuid = u.hubId ? findHubUuid(u.hubId) : null;
    await conn.query(
      'INSERT INTO users (id, email, password_hash, full_name, role, branch, hub_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, u.email, hash, u.name, u.role, u.branch, hubUuid]
    );
    u._uuid = id;
    inserted++;
  }
  console.log(`[SEED] Users: ${inserted} inserted, ${skipped} already existed (password: password123).`);
}

function findUserUuid(idKey) {
  const u = seedUsers.find((u) => u.id === idKey);
  return u ? u._uuid : null;
}

function findBranchUuid(idKey) {
  const b = seedBranches.find((b) => b.id === idKey);
  return b ? b._uuid : null;
}

async function seedMasterData(conn) {
  let locInserted = 0, locSkipped = 0;
  let brInserted = 0, brSkipped = 0;
  let lineInserted = 0, lineSkipped = 0;
  let trInserted = 0, trSkipped = 0;

  for (const l of seedLocations) {
    const [existing] = await conn.query(
      'SELECT id FROM locations WHERE name = ? LIMIT 1',
      [l.name]
    );
    if (existing.length > 0) {
      l._uuid = existing[0].id;
      // Update hub_id linkage
      await conn.query('UPDATE locations SET hub_id = ? WHERE id = ?', [
        findHubUuid(l.hubId),
        existing[0].id,
      ]);
      locSkipped++;
      continue;
    }
    const id = uuidv4();
    await conn.query(
      'INSERT INTO locations (id, name, address, governorate, hub_id) VALUES (?, ?, ?, ?, ?)',
      [id, l.name, l.address, l.governorate, findHubUuid(l.hubId)]
    );
    l._uuid = id;
    locInserted++;
  }

  for (const b of seedBranches) {
    const [existing] = await conn.query(
      'SELECT id FROM branches WHERE name = ? LIMIT 1',
      [b.name]
    );
    if (existing.length > 0) {
      b._uuid = existing[0].id;
      await conn.query('UPDATE branches SET hub_id = ?, length_km = ?, conductor_type = ?, status = ? WHERE id = ?', [
        findHubUuid(b.hubId),
        b.lengthKm,
        b.conductorType ?? null,
        b.status ?? 'planned',
        existing[0].id,
      ]);
      brSkipped++;
      continue;
    }
    const id = uuidv4();
    await conn.query(
      'INSERT INTO branches (id, name, hub_id, length_km, conductor_type, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, b.name, findHubUuid(b.hubId), b.lengthKm, b.conductorType ?? null, b.status ?? 'planned']
    );
    b._uuid = id;
    brInserted++;
  }

  for (const ln of seedLines) {
    const [existing] = await conn.query(
      'SELECT id FROM `lines` WHERE name = ? LIMIT 1',
      [ln.name]
    );
    if (existing.length > 0) {
      ln._uuid = existing[0].id;
      await conn.query('UPDATE `lines` SET voltage_level = ?, branch_id = ? WHERE id = ?', [
        ln.voltageLevel,
        findBranchUuid(ln.branchId),
        existing[0].id,
      ]);
      lineSkipped++;
      continue;
    }
    const id = uuidv4();
    await conn.query(
      'INSERT INTO `lines` (id, name, voltage_level, branch_id) VALUES (?, ?, ?, ?)',
      [id, ln.name, ln.voltageLevel, findBranchUuid(ln.branchId)]
    );
    ln._uuid = id;
    lineInserted++;
  }

  for (const t of seedTransformers) {
    const ln = seedLines.find((l) => l.id === t.lineId);
    const [existing] = await conn.query(
      'SELECT id FROM transformers WHERE serial_number = ? LIMIT 1',
      [t.serialNumber]
    );
    if (existing.length > 0) {
      t._uuid = existing[0].id;
      trSkipped++;
      continue;
    }
    const id = uuidv4();
    await conn.query(
      'INSERT INTO transformers (id, name, serial_number, capacity_kva, line_id) VALUES (?, ?, ?, ?, ?)',
      [id, t.name, t.serialNumber, t.capacityKVA, ln._uuid]
    );
    t._uuid = id;
    trInserted++;
  }

  console.log(`[SEED] Locations: ${locInserted} inserted/${locSkipped} existed, Branches: ${brInserted}/${brSkipped}, Lines: ${lineInserted}/${lineSkipped}, Transformers: ${trInserted}/${trSkipped}.`);
}

async function seedProgressEntries(conn) {
  const seKigUuid   = findUserUuid('user-bm-kig');
  const bmKigUuid   = findUserUuid('user-hm-kig');
  const seEastUuid  = findUserUuid('user-bm-east');
  const seSouthUuid = findUserUuid('user-bm-south');

  const locKig1  = seedLocations.find((l) => l.id === 'loc-kig-001');
  const locEast1 = seedLocations.find((l) => l.id === 'loc-east-001');
  const locSouth = seedLocations.find((l) => l.id === 'loc-south-001');

  const lineKig1  = seedLines.find((l) => l.id === 'line-kig-001');
  const lineKig2  = seedLines.find((l) => l.id === 'line-kig-002');
  const lineEast1 = seedLines.find((l) => l.id === 'line-east-001');
  const lineSouth = seedLines.find((l) => l.id === 'line-south-001');

  const trKig1  = seedTransformers.find((t) => t.id === 'tr-kig-001');
  const trKig3  = seedTransformers.find((t) => t.id === 'tr-kig-003');
  const trEast1 = seedTransformers.find((t) => t.id === 'tr-east-001');
  const trSouth = seedTransformers.find((t) => t.id === 'tr-south-001');

  const entries = [
    // Kigali Hub - published entry
    {
      id: uuidv4(),
      entry_date: dateOnly(4),
      location_id: locKig1._uuid,
      line_id: lineKig1._uuid,
      voltage_level: 'MV',
      transformer_id: trKig1._uuid,
      progress_pct: 45,
      transformers_installed: 3,
      transformers_terminated: 3,
      transformers_tested: 2,
      transformers_commissioned: 2,
      status: 'published',
      site_engineer_id: seKigUuid,
      branch_manager_id: bmKigUuid,
      submitted_at: nowIso(5),
      approved_at: nowIso(4.5),
      published_at: nowIso(4),
      rejection_comments: null,
    },
    // Kigali Hub - submitted (awaiting hub manager review)
    {
      id: uuidv4(),
      entry_date: dateOnly(1),
      location_id: locKig1._uuid,
      line_id: lineKig2._uuid,
      voltage_level: 'LV',
      transformer_id: trKig3._uuid,
      progress_pct: 20,
      transformers_installed: 1,
      transformers_terminated: 1,
      transformers_tested: 0,
      transformers_commissioned: 0,
      status: 'submitted',
      site_engineer_id: seKigUuid,
      branch_manager_id: null,
      submitted_at: nowIso(1),
      approved_at: null,
      published_at: null,
      rejection_comments: null,
    },
    // Kigali Hub - draft
    {
      id: uuidv4(),
      entry_date: dateOnly(2),
      location_id: locKig1._uuid,
      line_id: lineKig1._uuid,
      voltage_level: 'MV',
      transformer_id: trKig1._uuid,
      progress_pct: 10,
      transformers_installed: 0,
      transformers_terminated: 0,
      transformers_tested: 0,
      transformers_commissioned: 0,
      status: 'draft',
      site_engineer_id: seKigUuid,
      branch_manager_id: null,
      submitted_at: null,
      approved_at: null,
      published_at: null,
      rejection_comments: null,
    },
    // Eastern Hub - published
    {
      id: uuidv4(),
      entry_date: dateOnly(3),
      location_id: locEast1._uuid,
      line_id: lineEast1._uuid,
      voltage_level: 'MV',
      transformer_id: trEast1._uuid,
      progress_pct: 30,
      transformers_installed: 2,
      transformers_terminated: 2,
      transformers_tested: 1,
      transformers_commissioned: 1,
      status: 'published',
      site_engineer_id: seEastUuid,
      branch_manager_id: findUserUuid('user-hm-east'),
      submitted_at: nowIso(4),
      approved_at: nowIso(3.5),
      published_at: nowIso(3),
      rejection_comments: null,
    },
    // Southern Hub - submitted
    {
      id: uuidv4(),
      entry_date: dateOnly(1),
      location_id: locSouth._uuid,
      line_id: lineSouth._uuid,
      voltage_level: 'MV',
      transformer_id: trSouth._uuid,
      progress_pct: 15,
      transformers_installed: 1,
      transformers_terminated: 0,
      transformers_tested: 0,
      transformers_commissioned: 0,
      status: 'submitted',
      site_engineer_id: seSouthUuid,
      branch_manager_id: null,
      submitted_at: nowIso(1),
      approved_at: null,
      published_at: null,
      rejection_comments: null,
    },
  ];

  let peInserted = 0;
  let peSkipped = 0;
  for (const e of entries) {
    const [existing] = await conn.query(
      `SELECT id FROM progress_entries
       WHERE entry_date = ? AND location_id = ? AND line_id = ? AND site_engineer_id = ?
       LIMIT 1`,
      [e.entry_date, e.location_id, e.line_id, e.site_engineer_id]
    );
    if (existing.length > 0) {
      peSkipped++;
      continue;
    }
    await conn.query(
      `INSERT INTO progress_entries (
        id, entry_date, location_id, line_id, voltage_level, transformer_id,
        progress_pct, transformers_installed, transformers_terminated, transformers_tested,
        transformers_commissioned, status, site_engineer_id, branch_manager_id,
        submitted_at, approved_at, published_at, rejection_comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id, e.entry_date, e.location_id, e.line_id, e.voltage_level, e.transformer_id,
        e.progress_pct, e.transformers_installed, e.transformers_terminated,
        e.transformers_tested, e.transformers_commissioned, e.status,
        e.site_engineer_id, e.branch_manager_id, e.submitted_at,
        e.approved_at, e.published_at, e.rejection_comments,
      ]
    );
    peInserted++;
  }
  console.log(`[SEED] Progress entries: ${peInserted} inserted, ${peSkipped} already existed.`);
}

async function main() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('[SEED] Running schema + seed for Rwanda hierarchy...');
    await runSchema(conn);
    await seedHubsData(conn);
    await seedUsersData(conn);
    await seedMasterData(conn);
    await seedProgressEntries(conn);
    console.log('[SEED] All done. Rwanda hubs: Kigali, Eastern, Southern, Western, Northern.');
    console.log('[SEED] Demo login password: password123');
    console.log('[SEED] Branch Manager (Kigali): manager@branch.com');
    console.log('[SEED] Hub Manager (Kigali):    planner@company.com');
    console.log('[SEED] Senior Manager:           director@company.com');
    console.log('[SEED] Admin:                    superadmin@company.com');
  } catch (err) {
    console.error('[SEED] Fatal error:', err);
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
