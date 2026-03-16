import assert from "node:assert";
import { generateCsv, parseCsv } from "./csv";

function extractPlotlineColumns(
  headers: string[]
): { header: string; plotlineId: string }[] {
  const result: { header: string; plotlineId: string }[] = [];
  for (const h of headers) {
    const bracketMatch = h.match(/\[plotline:([^\]]+)\]/);
    if (bracketMatch) {
      result.push({ header: h, plotlineId: bracketMatch[1] });
      continue;
    }
    const directMatch = h.match(/^plotline:(.+)$/);
    if (directMatch) {
      result.push({ header: h, plotlineId: directMatch[1] });
    }
  }
  return result;
}

console.log("--- CSV Matrix Tests ---\n");

// 1. Export generates correct CSV with plotline columns
{
  const headers = [
    "id",
    "name",
    "description",
    "type",
    "Dark Conspiracy [plotline:abc123]",
    "Love Triangle [plotline:def456]",
  ];
  const rows = [
    ["id1", "Lord Mortenval", "An ancient vampire", "CHARACTER", "1", "0"],
    ["id2", "Guard Captain", "Loyal to the crown", "NPC", "0", "1"],
  ];

  const csv = generateCsv(headers, rows);
  const parsed = parseCsv(csv);

  assert.strictEqual(parsed.length, 2, "Should parse 2 data rows");
  assert.strictEqual(parsed[0]["id"], "id1");
  assert.strictEqual(parsed[0]["name"], "Lord Mortenval");
  assert.strictEqual(parsed[0]["type"], "CHARACTER");
  assert.strictEqual(parsed[1]["name"], "Guard Captain");
  assert.strictEqual(parsed[1]["type"], "NPC");

  console.log("PASS: export/import roundtrip preserves basic fields");
}

// 2. Plotline header extraction (bracket format)
{
  const headers = Object.keys(parseCsv(
    generateCsv(
      ["id", "name", "Dark Conspiracy [plotline:abc123]", "Love Triangle [plotline:def456]"],
      [["1", "Test", "1", "0"]]
    )
  )[0]);

  const cols = extractPlotlineColumns(headers);
  assert.strictEqual(cols.length, 2, "Should extract 2 plotline columns");
  assert.strictEqual(cols[0].plotlineId, "abc123");
  assert.strictEqual(cols[1].plotlineId, "def456");

  console.log("PASS: bracket-format plotline header extraction");
}

// 3. Plotline header extraction (direct format: plotline:id)
{
  const headers = Object.keys(parseCsv(
    generateCsv(
      ["id", "name", "plotline:abc123", "plotline:def456"],
      [["1", "Test", "1", "0"]]
    )
  )[0]);

  const cols = extractPlotlineColumns(headers);
  assert.strictEqual(cols.length, 2, "Should extract 2 plotline columns");
  assert.strictEqual(cols[0].plotlineId, "abc123");
  assert.strictEqual(cols[1].plotlineId, "def456");

  console.log("PASS: direct-format plotline header extraction");
}

// 4. Plotline values parsed correctly (1/0/true/false/yes)
{
  const csv = generateCsv(
    ["id", "plotline:p1", "plotline:p2", "plotline:p3", "plotline:p4"],
    [["id1", "1", "0", "true", "false"]],
  );
  const parsed = parseCsv(csv);
  const row = parsed[0];

  const isTruthy = (val: string | undefined) => {
    const v = val?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  };

  assert.strictEqual(isTruthy(row["plotline:p1"]), true, "1 should be truthy");
  assert.strictEqual(isTruthy(row["plotline:p2"]), false, "0 should be falsy");
  assert.strictEqual(isTruthy(row["plotline:p3"]), true, "true should be truthy");
  assert.strictEqual(isTruthy(row["plotline:p4"]), false, "false should be falsy");

  console.log("PASS: plotline value truthy/falsy parsing");
}

// 5. Description with commas and quotes survives roundtrip
{
  const csv = generateCsv(
    ["id", "name", "description", "type"],
    [["id1", "Test", 'Has "quotes" and, commas', "CHARACTER"]],
  );
  const parsed = parseCsv(csv);
  assert.strictEqual(
    parsed[0]["description"],
    'Has "quotes" and, commas',
    "Description with special chars should survive roundtrip"
  );

  console.log("PASS: description with quotes and commas roundtrip");
}

// 6. Empty description parses as empty string
{
  const csv = generateCsv(
    ["id", "name", "description", "type"],
    [["id1", "Test", "", "NPC"]],
  );
  const parsed = parseCsv(csv);
  assert.strictEqual(parsed[0]["description"], "", "Empty description should parse as empty string");

  console.log("PASS: empty description roundtrip");
}

// 7. Non-plotline columns are ignored by extraction
{
  const headers = ["id", "name", "description", "type", "faction", "plotline:abc"];
  const cols = extractPlotlineColumns(headers);
  assert.strictEqual(cols.length, 1, "Only plotline: columns should be extracted");
  assert.strictEqual(cols[0].plotlineId, "abc");

  console.log("PASS: non-plotline columns ignored in extraction");
}

// 8. Valid type enum check
{
  const VALID_ENTITY_TYPES = ["CHARACTER", "NPC"] as const;
  assert.ok(VALID_ENTITY_TYPES.includes("CHARACTER" as any));
  assert.ok(VALID_ENTITY_TYPES.includes("NPC" as any));
  assert.ok(!VALID_ENTITY_TYPES.includes("INVALID" as any));

  console.log("PASS: entity type enum validation");
}

// 9. Headers with special characters in plotline name
{
  const csv = generateCsv(
    ["id", 'Romantic "subplot" [plotline:rom1]'],
    [["id1", "1"]],
  );
  const parsed = parseCsv(csv);
  const headers = Object.keys(parsed[0]);
  const cols = extractPlotlineColumns(headers);
  assert.strictEqual(cols.length, 1);
  assert.strictEqual(cols[0].plotlineId, "rom1");

  console.log("PASS: plotline header with special chars in name");
}

console.log("\n--- All tests passed ---");
