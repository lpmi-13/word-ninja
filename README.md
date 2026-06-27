# Word Slice

Word Slice is a Thai word-boundary slicing game.

Thai text moves right-to-left on a cartoony factory conveyor belt. The player slices at valid word boundaries, and isolated single-word fragments get collected into factory buckets behind the belt.

## Thai Content Corpus

The curated seed corpus lives in [content/thai-source-corpus.json](content/thai-source-corpus.json). It contains 76 normalized Thai entries with explicit gameplay tokens, English glosses, source references, and broad frequency signals.

The expanded source corpus lives in [content/thai-expanded-corpus.json](content/thai-expanded-corpus.json). It contains 500 total entries:

- 76 curated seed entries
- 424 generated variants
- 150 `easy` entries
- 220 `medium` entries
- 130 `difficult` entries

The browser-ready game data lives in [content/thai-game-data.js](content/thai-game-data.js). It is generated from the expanded corpus and includes computed internal token boundary offsets for runtime hit detection.

The corpus has three broad level bands:

- `easy`
- `medium`
- `difficult`

Each band is split into two sublevels because the Peace Corps source material gives enough topic progression to support it.

## Level Bands

### Easy

Beginner survival phrases, greetings, identity, numbers, prices, and basic food terms. These are short chunks with high-frequency words and generous slicing targets.

Gameplay stages A1 internally so the first rounds stay predictable and natural. Generated A1 variants are delayed until later pattern-practice sublevels instead of appearing in the first beginner phrases.

Sublevels:

- `easy-1`: greetings and identity
- `easy-2`: numbers, prices, and basic food

Example phrases:

- `สวัสดีครับ` -> `สวัสดี|ครับ`
- `คุณชื่ออะไรคะ` -> `คุณ|ชื่อ|อะไร|คะ`
- `ข้าวผัดกุ้ง` -> `ข้าว|ผัด|กุ้ง`
- `น้ำเย็น` -> `น้ำ|เย็น`

### Medium

Short functional phrases for ordering food, asking prices, expressing preferences, and talking about family. These chunks use more particles, classifiers, and common sentence patterns.

Sublevels:

- `medium-1`: ordering and simple food expressions
- `medium-2`: preferences, family, and quantities

Example phrases:

- `ขอข้าวผัดกุ้งครับ` -> `ขอ|ข้าว|ผัด|กุ้ง|ครับ`
- `ทั้งหมดเท่าไรคะ` -> `ทั้งหมด|เท่าไร|คะ`
- `คุณชอบกินปลาไหมคะ` -> `คุณ|ชอบ|กิน|ปลา|ไหม|คะ`
- `ครอบครัวของผมมีห้าคนครับ` -> `ครอบครัว|ของ|ผม|มี|ห้า|คน|ครับ`

### Difficult

Longer learner chunks covering wishes, places, repair phrases, communication help, health, allergies, and multi-clause food conversations. These should still be split into readable conveyor items on mobile.

Sublevels:

- `difficult-1`: wishes, places, and repair phrases
- `difficult-2`: longer service and conversation chunks

Example phrases:

- `คุณพูดภาษาอังกฤษได้ไหมคะ` -> `คุณ|พูด|ภาษา|อังกฤษ|ได้|ไหม|คะ`
- `พาผมไปโรงพยาบาลหน่อยครับ` -> `พา|ผม|ไป|โรงพยาบาล|หน่อย|ครับ`
- `ผมกินกุ้งไม่ได้ครับ` -> `ผม|กิน|กุ้ง|ไม่|ได้|ครับ`
- `พอแล้วครับผมอิ่มแล้วครับ` -> `พอ|แล้ว|ครับ|ผม|อิ่ม|แล้ว|ครับ`

## Sources

The starter corpus is adapted from public-domain learner material and organized for gameplay:

- Peace Corps Basic Introduction to Thai Language: primary source for phrases, topics, and beginner progression.
- FSI Thai Basic Course: curriculum progression reference for beginner-to-intermediate ordering.
- FrequencyWords Thai 2018 list: optional frequency sanity check only; the list itself is not copied into this repo.

See [PLAN.md](PLAN.md) for the broader redesign plan and content pipeline notes.

## Token Policy

Gameplay uses the `tokens` array in the corpus as the source of truth. The rendered text is `tokens.join("")`, and the valid slice positions are the internal token boundaries.

This is intentional: Thai browser segmentation can vary by implementation and dictionary version, so the game should not silently rely on runtime segmentation to decide whether a player sliced correctly.

## Generating More Phrases

Generated phrases come from [content/thai-generation-rules.json](content/thai-generation-rules.json) and are produced by [scripts/generate-thai-corpus.mjs](scripts/generate-thai-corpus.mjs).

To regenerate the 500-entry source corpus:

```bash
node scripts/generate-thai-corpus.mjs
```

To validate that corpus and rebuild the browser game data:

```bash
node scripts/build-thai-game-data.mjs
```

To generate more:

1. Increase `targetTotalEntries` and the per-level counts in `targetTotalByLevel`.
2. Add safe slot values under `slots`, such as more foods, drinks, places, family terms, or learner-safe names.
3. Add or raise `maxGenerated` on templates only when the slot combinations remain natural.
4. Run the generator again.

The generator skips duplicate text, validates IDs and token joins, and fails if a level does not have enough valid generated variants. That failure is intentional; it means the template set needs better rules rather than filler phrases.
