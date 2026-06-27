import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DEFAULT_CORPUS_PATH = path.join(ROOT, "content", "thai-expanded-corpus.json");
const OUT_PATH = path.join(ROOT, "content", "thai-game-data.js");

const corpusPath = process.argv[2]
  ? path.resolve(ROOT, process.argv[2])
  : DEFAULT_CORPUS_PATH;

const LEVEL_RANK = {
  easy: 0,
  medium: 1,
  difficult: 2
};

const CEFR_LIKE_LEVEL = {
  easy: "A1",
  medium: "A2",
  difficult: "B1"
};

const MAX_REVIEWED_TOKEN_COUNT = {
  easy: 5,
  medium: 7,
  difficult: 8
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getBoundaryOffsets(tokens) {
  let offset = 0;
  const offsets = [];

  for (let i = 0; i < tokens.length - 1; i++) {
    offset += tokens[i].length;
    offsets.push(offset);
  }

  return offsets;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function buildVocabularyLevelMap(entries) {
  const levels = new Map();

  for (const entry of entries) {
    for (const token of entry.tokens) {
      const existing = levels.get(token);
      if (!existing || LEVEL_RANK[entry.level] < LEVEL_RANK[existing]) {
        levels.set(token, entry.level);
      }
    }
  }

  return levels;
}

function validateCorpus(corpus) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const knownSublevels = new Set(
    corpus.levels.flatMap((level) => level.sublevels.map((sublevel) => sublevel.id))
  );

  for (const entry of corpus.entries) {
    if (ids.has(entry.id)) errors.push(`duplicate id: ${entry.id}`);
    ids.add(entry.id);

    if (!(entry.level in LEVEL_RANK)) {
      errors.push(`${entry.id} has unknown level "${entry.level}"`);
      continue;
    }

    if (!knownSublevels.has(entry.sublevel)) {
      errors.push(`${entry.id} has unknown sublevel "${entry.sublevel}"`);
    }

    if (!Array.isArray(entry.tokens) || entry.tokens.length < 2) {
      errors.push(`${entry.id} must have at least two curated tokens`);
      continue;
    }

    if (entry.tokens.some((token) => typeof token !== "string" || token.length === 0)) {
      errors.push(`${entry.id} contains an empty or non-string token`);
    }

    if (entry.tokens.join("") !== entry.text) {
      errors.push(`${entry.id} text does not match tokens.join("")`);
    }

    if (/\s/.test(entry.text)) {
      errors.push(`${entry.id} contains visible whitespace in gameplay text`);
    }

    if (entry.tokens.length > MAX_REVIEWED_TOKEN_COUNT[entry.level]) {
      warnings.push(`${entry.id} has ${entry.tokens.length} tokens; runtime should window this phrase`);
    }
  }

  const vocabularyLevels = buildVocabularyLevelMap(corpus.entries);
  for (const entry of corpus.entries) {
    if (!(entry.level in LEVEL_RANK) || !Array.isArray(entry.tokens)) continue;

    for (const token of entry.tokens) {
      const tokenLevel = vocabularyLevels.get(token);
      if (LEVEL_RANK[tokenLevel] > LEVEL_RANK[entry.level]) {
        warnings.push(`${entry.id} uses ${tokenLevel} token "${token}" in ${entry.level}`);
      }
    }
  }

  return { errors, warnings, vocabularyLevels };
}

const corpus = readJson(corpusPath);
const { errors, warnings } = validateCorpus(corpus);

if (errors.length > 0) {
  throw new Error(`Thai game data build failed:\n${errors.join("\n")}`);
}

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

const entries = corpus.entries.map((entry) => {
  const boundaryOffsets = getBoundaryOffsets(entry.tokens);

  return {
    id: entry.id,
    level: entry.level,
    cefrLikeLevel: CEFR_LIKE_LEVEL[entry.level],
    sublevel: entry.sublevel,
    text: entry.text,
    tokens: entry.tokens,
    gloss: entry.gloss,
    vocabularyTags: entry.topics ?? [],
    boundaryOffsets,
    boundaryCount: boundaryOffsets.length
  };
});

const gameData = {
  version: corpus.version,
  language: corpus.language,
  counts: {
    total: entries.length,
    byLevel: countBy(entries, (entry) => entry.level),
    bySublevel: countBy(entries, (entry) => entry.sublevel)
  },
  levels: corpus.levels,
  entries
};

fs.writeFileSync(
  OUT_PATH,
  `window.THAI_GAME_DATA=${JSON.stringify(gameData)};\n`
);

console.log(JSON.stringify(gameData.counts, null, 2));
