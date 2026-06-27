import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, "content", "thai-source-corpus.json");
const RULES_PATH = path.join(ROOT, "content", "thai-generation-rules.json");
const OUT_PATH = path.join(ROOT, "content", "thai-expanded-corpus.json");

const sourceCorpus = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const rules = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function collectTemplateSlots(template) {
  const seen = new Set();
  const slots = [];
  for (const part of template.parts) {
    if (typeof part === "object" && part.slot && !seen.has(part.slot)) {
      seen.add(part.slot);
      slots.push(part.slot);
    }
  }
  return slots;
}

function cartesian(slotNames, slotValues, index = 0, current = {}) {
  if (index >= slotNames.length) return [current];

  const slotName = slotNames[index];
  const values = slotValues[slotName];
  if (!values) {
    throw new Error(`Unknown slot "${slotName}"`);
  }

  const output = [];
  for (const value of values) {
    output.push(...cartesian(slotNames, slotValues, index + 1, {
      ...current,
      [slotName]: value
    }));
  }
  return output;
}

function partTokens(part, assignments) {
  if (typeof part === "string") return [part];

  const value = assignments[part.slot];
  if (!value) {
    throw new Error(`Missing assignment for slot "${part.slot}"`);
  }

  if (!part.field || part.field === "tokens") return value.tokens;

  const fieldValue = value[part.field];
  if (!fieldValue) {
    throw new Error(`Slot "${part.slot}" has no field "${part.field}"`);
  }

  return asArray(fieldValue);
}

function renderGloss(template, assignments) {
  return template.gloss.replace(/\{([^}]+)\}/g, (_, expression) => {
    if (expression.startsWith("classifierOf.")) {
      const slotName = expression.slice("classifierOf.".length);
      return assignments[slotName]?.classifier ?? "";
    }

    const [slotName, fieldName] = expression.split(".");
    const value = assignments[slotName];
    if (!value) return "";
    return value[fieldName] ?? "";
  });
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function validateEntries(entries, knownSublevels) {
  const ids = new Set();
  const errors = [];

  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`duplicate id: ${entry.id}`);
    ids.add(entry.id);

    if (!knownSublevels.has(entry.sublevel)) {
      errors.push(`${entry.id} uses unknown sublevel ${entry.sublevel}`);
    }

    if (entry.tokens.join("") !== entry.text) {
      errors.push(`${entry.id} text does not match tokens.join("")`);
    }

    if (entry.tokens.length < 2) {
      errors.push(`${entry.id} has fewer than 2 tokens`);
    }
  }

  return errors;
}

const knownSublevels = new Set(
  sourceCorpus.levels.flatMap((level) => level.sublevels.map((sublevel) => sublevel.id))
);

const sourceTexts = new Set(sourceCorpus.entries.map((entry) => entry.text));
const generatedTexts = new Set(sourceTexts);
const candidatesByLevel = {};

for (const template of rules.templates) {
  const slotNames = collectTemplateSlots(template);
  const assignmentsList = cartesian(slotNames, rules.slots);
  const templateCandidates = [];

  for (const assignments of assignmentsList) {
    const tokens = template.parts.flatMap((part) => partTokens(part, assignments));
    const text = tokens.join("");
    if (generatedTexts.has(text)) continue;

    generatedTexts.add(text);
    templateCandidates.push({
      level: template.level,
      sublevel: template.sublevel,
      sourceRefs: template.sourceRefs,
      topics: template.topics,
      text,
      tokens,
      gloss: renderGloss(template, assignments),
      frequencySignal: "template",
      origin: "generated",
      templateId: template.id,
      slotIds: Object.fromEntries(
        Object.entries(assignments).map(([slotName, value]) => [slotName, value.id])
      )
    });

    if (templateCandidates.length >= template.maxGenerated) break;
  }

  candidatesByLevel[template.level] ??= [];
  candidatesByLevel[template.level].push(...templateCandidates);
}

const sourceCountsByLevel = countBy(sourceCorpus.entries, (entry) => entry.level);
const generatedLevelCounters = {};
const selectedGenerated = [];

for (const [level, targetTotal] of Object.entries(rules.targetTotalByLevel)) {
  const needed = targetTotal - (sourceCountsByLevel[level] ?? 0);
  if (needed < 0) {
    throw new Error(`Target for ${level} is below source corpus count`);
  }

  const candidates = candidatesByLevel[level] ?? [];
  if (candidates.length < needed) {
    throw new Error(`Not enough generated ${level} entries: need ${needed}, have ${candidates.length}`);
  }

  for (const candidate of candidates.slice(0, needed)) {
    generatedLevelCounters[level] = (generatedLevelCounters[level] ?? 0) + 1;
    selectedGenerated.push({
      id: `th-gen-${level}-${String(generatedLevelCounters[level]).padStart(3, "0")}`,
      ...candidate
    });
  }
}

const curatedEntries = sourceCorpus.entries.map((entry) => ({
  ...entry,
  origin: "curated"
}));

const entries = [...curatedEntries, ...selectedGenerated];
const validationErrors = validateEntries(entries, knownSublevels);
if (validationErrors.length > 0) {
  throw new Error(`Generated corpus failed validation:\n${validationErrors.join("\n")}`);
}

const expandedCorpus = {
  version: 1,
  language: sourceCorpus.language,
  description: "Expanded Thai word-boundary slicing corpus combining curated learner phrases with deterministic template-generated variants.",
  sourceCorpus: "content/thai-source-corpus.json",
  generationRules: "content/thai-generation-rules.json",
  generationPolicy: "Generated entries come from typed templates and learner-safe slots. Use curated tokens as gameplay boundaries; do not infer correctness from browser segmentation.",
  counts: {
    total: entries.length,
    curated: curatedEntries.length,
    generated: selectedGenerated.length,
    byLevel: countBy(entries, (entry) => entry.level),
    bySublevel: countBy(entries, (entry) => entry.sublevel),
    byOrigin: countBy(entries, (entry) => entry.origin)
  },
  sources: sourceCorpus.sources,
  levels: sourceCorpus.levels,
  entries
};

if (expandedCorpus.counts.total !== rules.targetTotalEntries) {
  throw new Error(`Expected ${rules.targetTotalEntries} total entries, got ${expandedCorpus.counts.total}`);
}

fs.writeFileSync(OUT_PATH, `${JSON.stringify(expandedCorpus, null, 2)}\n`);

console.log(JSON.stringify(expandedCorpus.counts, null, 2));
