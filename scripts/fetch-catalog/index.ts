/**
 * Fetch REAL Catalunya university cut-offs (notes de tall) and the degree/
 * university catalog from the Generalitat open-data portal, and materialize
 * them into versioned YAML content (Git stays the source of truth, spec §15).
 *
 * Source: Dades Obertes Catalunya — "Notes de tall d'accés als estudis
 * universitaris (juny 2023-actualitat)", dataset id `usyn-hngc`.
 * Licence: Llicència oberta d'ús d'informació (Generalitat) — reusable with
 * attribution. Cut-offs are historical observations, NOT required scores (§4).
 *
 * This is ADDITIVE: the curated STEM degrees (with provisional Matemàtiques II
 * weightings) that power the goal-engine demo are preserved; open-data degrees
 * that would duplicate them (same university + name) are skipped. Open-data
 * degrees carry no weightings (those remain a separate, verified task).
 *
 * Run: tsx scripts/fetch-catalog/index.ts   (writes YAML; then `pnpm db:seed`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const DATASET = 'usyn-hngc';
const DATA_URL = `https://analisi.transparenciacatalunya.cat/resource/${DATASET}.json?$limit=50000`;
const SOURCE_PAGE = `https://analisi.transparenciacatalunya.cat/d/${DATASET}`;
const AUTHORITY =
  'Generalitat de Catalunya — Consell Interuniversitari de Catalunya (Dades Obertes)';

// Public Catalan universities we include (sigla → stable id + bilingual name).
const UNIVERSITIES: Record<string, { id: string; ca: string; es: string }> = {
  UB: { id: 'ub', ca: 'Universitat de Barcelona', es: 'Universidad de Barcelona' },
  UAB: { id: 'uab', ca: 'Universitat Autònoma de Barcelona', es: 'Universidad Autónoma de Barcelona' },
  UPC: { id: 'upc', ca: 'Universitat Politècnica de Catalunya', es: 'Universidad Politécnica de Cataluña' },
  UPF: { id: 'upf', ca: 'Universitat Pompeu Fabra', es: 'Universidad Pompeu Fabra' },
  URV: { id: 'urv', ca: 'Universitat Rovira i Virgili', es: 'Universidad Rovira i Virgili' },
  UdG: { id: 'udg', ca: 'Universitat de Girona', es: 'Universidad de Girona' },
  UdL: { id: 'udl', ca: 'Universitat de Lleida', es: 'Universidad de Lérida' },
};

interface Row {
  any: string;
  codi_oferta: string;
  nom_de_l_oferta: string;
  tipus_d_estudi: string;
  sigles_universitat_responsable: string;
  via_d_acc_s: string;
  nota_de_tall: string;
  municipi: string;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .trim();

const here = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.resolve(here, '../../content/universities/catalunya/2026');

// Official ponderació coefficients per subject, extracted from the Generalitat
// PDF and keyed for a university+name join. A degree may weight several subjects.
interface PondFile {
  entries: Array<{ uni: string; name: string; coef: number }>;
}
function loadPond(file: string, subject: string): Map<string, number> {
  const pond = JSON.parse(fs.readFileSync(path.join(here, file), 'utf8')) as PondFile;
  const m = new Map<string, number>();
  for (const e of pond.entries) m.set(`${e.uni}|${norm(e.name)}`, e.coef);
  void subject;
  return m;
}
const SUBJECT_PONDERACIONS: Array<{ subject: string; weights: Map<string, number> }> = [
  { subject: 'mathematics-ii', weights: loadPond('ponderacions-mates-2026.json', 'mathematics-ii') },
  { subject: 'physics', weights: loadPond('ponderacions-fisica-2026.json', 'physics') },
];

async function main(): Promise<void> {
  process.stdout.write(`Fetching ${DATA_URL}\n`);
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Dataset fetch failed: ${res.status}`);
  const rows = (await res.json()) as Row[];
  process.stdout.write(`  ${rows.length} rows received\n`);

  // Curated degrees to avoid duplicating (university_id + normalized name).
  const curatedKeys = new Set<string>();
  const stemPath = path.join(contentDir, 'degrees', 'stem.yaml');
  if (fs.existsSync(stemPath)) {
    const curated = parse(fs.readFileSync(stemPath, 'utf8')) as Array<{
      university_id: string;
      name: { ca: string };
    }>;
    for (const d of curated) curatedKeys.add(`${d.university_id}|${norm(d.name.ca)}`);
  }

  // Keep Grau + PAU access route at a known public university with a real score.
  // Collapse to one entry per (codi_oferta) at its latest year, then per
  // (university, program name) keeping the most recent / highest cut-off.
  const byKey = new Map<string, { row: Row; year: number; score: number }>();
  for (const r of rows) {
    if (r.tipus_d_estudi !== 'Grau') continue;
    if (!/^pau/i.test(r.via_d_acc_s ?? '')) continue;
    const uni = UNIVERSITIES[r.sigles_universitat_responsable];
    if (!uni) continue;
    const score = parseFloat(r.nota_de_tall);
    if (!Number.isFinite(score) || score <= 0) continue;
    const year = parseInt(r.any, 10);
    if (!Number.isFinite(year)) continue;

    const key = `${uni.id}|${norm(r.nom_de_l_oferta)}`;
    if (curatedKeys.has(key)) continue; // keep the curated (weighted) version
    const prev = byKey.get(key);
    if (!prev || year > prev.year || (year === prev.year && score > prev.score)) {
      byKey.set(key, { row: r, year, score });
    }
  }

  const usedUnis = new Set<string>();
  const degrees: unknown[] = [];
  const cutoffs: unknown[] = [];
  const retrievedAt = new Date().toISOString();
  let weighted = 0;

  for (const { row, year, score } of [...byKey.values()].sort((a, b) =>
    a.row.nom_de_l_oferta.localeCompare(b.row.nom_de_l_oferta),
  )) {
    const uni = UNIVERSITIES[row.sigles_universitat_responsable];
    usedUnis.add(uni.id);
    const id = `cat-${row.codi_oferta}`;
    const key = `${uni.id}|${norm(row.nom_de_l_oferta)}`;
    const weightings = SUBJECT_PONDERACIONS.flatMap(({ subject, weights }) => {
      const coef = weights.get(key);
      return coef ? [{ subject, coefficient: coef }] : [];
    });
    if (weightings.length > 0) weighted += 1;
    degrees.push({
      id,
      university_id: uni.id,
      name: { ca: row.nom_de_l_oferta },
      admission_score_max: 14,
      weightings,
    });
    cutoffs.push({
      degree_id: id,
      academic_year: year,
      assignment: 'first',
      score: Math.round(score * 1000) / 1000,
      source: { authority: AUTHORITY, type: 'official', retrieved_at: retrievedAt, url: SOURCE_PAGE },
    });
  }

  // Universities: emit the full public set (curated STEM degrees also reference
  // these ids, so always include them regardless of open-data coverage).
  void usedUnis;
  const universities = Object.values(UNIVERSITIES).map((u) => ({
    id: u.id,
    region: 'catalunya',
    name: { ca: u.ca, es: u.es },
  }));

  const banner = (title: string): string =>
    `# ${title}\n# Auto-generated by scripts/fetch-catalog from Dades Obertes Catalunya\n` +
    `# (${DATASET}). Source: ${AUTHORITY}. Retrieved: ${retrievedAt}.\n` +
    `# Do not edit by hand — re-run the fetch script to refresh.\n`;

  fs.writeFileSync(
    path.join(contentDir, 'universities.yaml'),
    banner('Catalan public universities (open data + curated bilingual names)') +
      stringify(universities),
  );
  fs.writeFileSync(
    path.join(contentDir, 'degrees', 'open-data.yaml'),
    banner('Degrees (Grau) at Catalan public universities') + stringify(degrees),
  );
  fs.writeFileSync(
    path.join(contentDir, 'cutoffs', 'open-data.yaml'),
    banner('Real notes de tall (official, historical — not required scores, §4)') +
      stringify(cutoffs),
  );

  process.stdout.write(
    `✅ Wrote ${universities.length} universities, ${degrees.length} degrees, ` +
      `${cutoffs.length} cut-offs, ${weighted} with a Matemàtiques II weighting.\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
