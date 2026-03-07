import { db } from "@/lib/db";
import { resolveCharacterName, resolvePlotlineName } from "./name-resolver";
import type {
  ActionType,
  ExecutionResult,
  CreateCharacterPayload,
  UpdateCharacterPayload,
  BulkCreateCharactersPayload,
  CreateRelationshipPayload,
  BulkCreateRelationshipsPayload,
  CreatePlotlinePayload,
  AssignPlotlineCharactersPayload,
  BulkCreatePlotlinesPayload,
  SetCustomFieldPayload,
  BulkSetCustomFieldPayload,
  AddCustomFieldOptionPayload,
  CreateCustomFieldPayload,
  CreateTimelineEventPayload,
  CreateNpcPayload,
  UpdateBriefSectionPayload,
  GroupCharactersPayload,
  PlotlineMatrixPayload,
} from "./action-types";

type CreatedEntity = { type: string; id: string; name: string };

function ok(createdEntities: CreatedEntity[]): ExecutionResult {
  return { success: true, createdEntities };
}

function fail(errors: Array<{ field: string; message: string }>): ExecutionResult {
  return { success: false, createdEntities: [], errors };
}

// --- Helper: set a custom field value by slug + label ---

async function setCustomFieldValue(
  gameId: string,
  characterId: string,
  fieldSlug: string,
  value: string | number | boolean
): Promise<CreatedEntity | null> {
  const fieldDef = await db.customFieldDefinition.findUnique({
    where: { gameId_slug: { gameId, slug: fieldSlug } },
    include: { options: true },
  });
  if (!fieldDef) return null;

  const data: Record<string, unknown> = {
    textValue: null,
    numberValue: null,
    booleanValue: null,
    dateValue: null,
  };

  if (fieldDef.fieldType === "NUMBER" && typeof value === "number") {
    data.numberValue = value;
  } else if (fieldDef.fieldType === "BOOLEAN" && typeof value === "boolean") {
    data.booleanValue = value;
  } else if (fieldDef.fieldType === "DATE" && typeof value === "string") {
    data.dateValue = new Date(value);
  } else {
    data.textValue = String(value);
  }

  const cfValue = await db.customFieldValue.upsert({
    where: {
      definitionId_characterId: {
        definitionId: fieldDef.id,
        characterId,
      },
    },
    create: { definitionId: fieldDef.id, characterId, ...data },
    update: data,
  });

  // For SELECT / MULTI_SELECT, match by label
  if (
    (fieldDef.fieldType === "SELECT" || fieldDef.fieldType === "MULTI_SELECT") &&
    typeof value === "string"
  ) {
    const labels = value.split(",").map((l) => l.trim());
    const matchedOptions = fieldDef.options.filter((o) =>
      labels.some((l) => o.label.toLowerCase() === l.toLowerCase())
    );

    // Clear existing and set new
    await db.customFieldValueOption.deleteMany({ where: { valueId: cfValue.id } });
    if (matchedOptions.length > 0) {
      await db.customFieldValueOption.createMany({
        data: matchedOptions.map((o) => ({ valueId: cfValue.id, optionId: o.id })),
      });
    }
  }

  return { type: "custom_field_value", id: cfValue.id, name: `${fieldSlug}=${value}` };
}

// --- Helper: set custom fields for a character ---

async function setCustomFieldsForCharacter(
  gameId: string,
  characterId: string,
  customFields: Record<string, string | number | boolean>
): Promise<CreatedEntity[]> {
  const results: CreatedEntity[] = [];
  for (const [slug, value] of Object.entries(customFields)) {
    const entity = await setCustomFieldValue(gameId, characterId, slug, value);
    if (entity) results.push(entity);
  }
  return results;
}

// --- Executors ---

async function executeCharacterCreate(
  gameId: string,
  payload: CreateCharacterPayload
): Promise<ExecutionResult> {
  const entity = await db.gameEntity.create({
    data: {
      gameId,
      name: payload.name,
      type: payload.type ?? "CHARACTER",
      description: payload.description,
      faction: payload.faction,
      archetype: payload.archetype,
    },
  });

  const created: CreatedEntity[] = [
    { type: "character", id: entity.id, name: entity.name },
  ];

  if (payload.customFields) {
    const cfEntities = await setCustomFieldsForCharacter(
      gameId,
      entity.id,
      payload.customFields
    );
    created.push(...cfEntities);
  }

  return ok(created);
}

async function executeCharacterUpdate(
  gameId: string,
  payload: UpdateCharacterPayload
): Promise<ExecutionResult> {
  const resolved = await resolveCharacterName(gameId, payload.characterName);
  if (!resolved) {
    return fail([{ field: "characterName", message: `Character "${payload.characterName}" not found` }]);
  }

  const updateData: Record<string, unknown> = {};
  if (payload.name) updateData.name = payload.name;
  if (payload.description) updateData.description = payload.description;
  if (payload.faction) updateData.faction = payload.faction;
  if (payload.archetype) updateData.archetype = payload.archetype;

  await db.gameEntity.update({ where: { id: resolved.id }, data: updateData });

  const created: CreatedEntity[] = [
    { type: "character", id: resolved.id, name: payload.name ?? resolved.name },
  ];

  if (payload.customFields) {
    const cfEntities = await setCustomFieldsForCharacter(
      gameId,
      resolved.id,
      payload.customFields
    );
    created.push(...cfEntities);
  }

  return ok(created);
}

async function executeBulkCreateCharacters(
  gameId: string,
  payload: BulkCreateCharactersPayload
): Promise<ExecutionResult> {
  const created: CreatedEntity[] = [];

  for (const char of payload.characters) {
    const entity = await db.gameEntity.create({
      data: {
        gameId,
        name: char.name,
        type: char.type ?? "CHARACTER",
        description: char.description,
        faction: char.faction,
        archetype: char.archetype,
      },
    });
    created.push({ type: "character", id: entity.id, name: entity.name });

    if (char.customFields) {
      const cfEntities = await setCustomFieldsForCharacter(
        gameId,
        entity.id,
        char.customFields
      );
      created.push(...cfEntities);
    }
  }

  return ok(created);
}

const VALID_RELATIONSHIP_TYPES = ["RIVALRY", "ALLIANCE", "SECRET", "DEBT", "LOVE", "FAMILY", "MENTORSHIP", "ENMITY", "OTHER"] as const;

function resolveRelationshipType(raw?: string): (typeof VALID_RELATIONSHIP_TYPES)[number] {
  if (!raw) return "OTHER";
  const upper = raw.toUpperCase();
  if (VALID_RELATIONSHIP_TYPES.includes(upper as any)) return upper as any;
  const ALIASES: Record<string, (typeof VALID_RELATIONSHIP_TYPES)[number]> = {
    BUSINESS: "ALLIANCE",
    PROFESSIONAL: "ALLIANCE",
    PARTNER: "ALLIANCE",
    COOPERATION: "ALLIANCE",
    FRIEND: "ALLIANCE",
    FRIENDSHIP: "ALLIANCE",
    ENEMY: "ENMITY",
    HATE: "ENMITY",
    CONFLICT: "RIVALRY",
    COMPETITION: "RIVALRY",
    ROMANCE: "LOVE",
    ROMANTIC: "LOVE",
    MARRIAGE: "FAMILY",
    SIBLING: "FAMILY",
    PARENT: "FAMILY",
    CHILD: "FAMILY",
    TEACHER: "MENTORSHIP",
    STUDENT: "MENTORSHIP",
    MENTOR: "MENTORSHIP",
    PROTEGE: "MENTORSHIP",
    LOAN: "DEBT",
    FAVOR: "DEBT",
    OBLIGATION: "DEBT",
    HIDDEN: "SECRET",
    CONSPIRACY: "SECRET",
  };
  return ALIASES[upper] ?? "OTHER";
}

async function executeRelationshipCreate(
  gameId: string,
  payload: CreateRelationshipPayload
): Promise<ExecutionResult> {
  const fromResolved = await resolveCharacterName(gameId, payload.fromCharacter);
  if (!fromResolved) {
    return fail([{ field: "fromCharacter", message: `Character "${payload.fromCharacter}" not found` }]);
  }

  const toResolved = await resolveCharacterName(gameId, payload.toCharacter);
  if (!toResolved) {
    return fail([{ field: "toCharacter", message: `Character "${payload.toCharacter}" not found` }]);
  }

  const rel = await db.relationship.create({
    data: {
      gameId,
      fromEntityId: fromResolved.id,
      toEntityId: toResolved.id,
      type: resolveRelationshipType(payload.type),
      description: payload.description,
      intensity: payload.intensity ?? 5,
      bidirectional: payload.bidirectional ?? true,
    },
  });

  return ok([{
    type: "relationship",
    id: rel.id,
    name: `${fromResolved.name} → ${toResolved.name}`,
  }]);
}

async function executeBulkCreateRelationships(
  gameId: string,
  payload: BulkCreateRelationshipsPayload
): Promise<ExecutionResult> {
  const created: CreatedEntity[] = [];
  const errors: Array<{ field: string; message: string }> = [];

  for (let i = 0; i < payload.relationships.length; i++) {
    const rel = payload.relationships[i];
    const result = await executeRelationshipCreate(gameId, rel);
    if (result.success) {
      created.push(...result.createdEntities);
    } else if (result.errors) {
      errors.push(...result.errors.map((e) => ({ ...e, field: `relationships[${i}].${e.field}` })));
    }
  }

  if (created.length === 0 && errors.length > 0) {
    return fail(errors);
  }

  return { success: true, createdEntities: created, errors: errors.length > 0 ? errors : undefined };
}

async function executePlotlineCreate(
  gameId: string,
  payload: CreatePlotlinePayload
): Promise<ExecutionResult> {
  const VALID_PLOTLINE_TYPES = ["POLITICAL", "PERSONAL", "MYSTERY", "ACTION", "SOCIAL", "OTHER"];
  const plotType = payload.type && VALID_PLOTLINE_TYPES.includes(payload.type.toUpperCase())
    ? payload.type.toUpperCase()
    : "OTHER";

  const plotline = await db.plotline.create({
    data: {
      gameId,
      name: payload.name,
      type: plotType as any,
      description: payload.description,
    },
  });

  const created: CreatedEntity[] = [
    { type: "plotline", id: plotline.id, name: plotline.name },
  ];

  if (payload.characters && payload.characters.length > 0) {
    for (const charName of payload.characters) {
      const resolved = await resolveCharacterName(gameId, charName);
      if (resolved) {
        const pe = await db.plotlineEntity.create({
          data: { plotlineId: plotline.id, entityId: resolved.id },
        });
        created.push({
          type: "plotline_entity",
          id: pe.id,
          name: `${plotline.name} ← ${resolved.name}`,
        });
      }
    }
  }

  return ok(created);
}

async function executePlotlineAssignCharacters(
  gameId: string,
  payload: AssignPlotlineCharactersPayload
): Promise<ExecutionResult> {
  const plotline = await resolvePlotlineName(gameId, payload.plotlineName);
  if (!plotline) {
    return fail([{ field: "plotlineName", message: `Plotline "${payload.plotlineName}" not found` }]);
  }

  const created: CreatedEntity[] = [];

  for (const charName of payload.characters) {
    const resolved = await resolveCharacterName(gameId, charName);
    if (!resolved) continue;

    const existing = await db.plotlineEntity.findUnique({
      where: { plotlineId_entityId: { plotlineId: plotline.id, entityId: resolved.id } },
    });
    if (existing) continue;

    const pe = await db.plotlineEntity.create({
      data: { plotlineId: plotline.id, entityId: resolved.id },
    });
    created.push({
      type: "plotline_entity",
      id: pe.id,
      name: `${plotline.name} ← ${resolved.name}`,
    });
  }

  return ok(created);
}

async function executeBulkCreatePlotlines(
  gameId: string,
  payload: BulkCreatePlotlinesPayload
): Promise<ExecutionResult> {
  const created: CreatedEntity[] = [];

  for (const pl of payload.plotlines) {
    const result = await executePlotlineCreate(gameId, pl);
    created.push(...result.createdEntities);
  }

  return ok(created);
}

async function executeCustomFieldSet(
  gameId: string,
  payload: SetCustomFieldPayload
): Promise<ExecutionResult> {
  const resolved = await resolveCharacterName(gameId, payload.characterName);
  if (!resolved) {
    return fail([{ field: "characterName", message: `Character "${payload.characterName}" not found` }]);
  }

  const entity = await setCustomFieldValue(gameId, resolved.id, payload.fieldSlug, payload.value);
  if (!entity) {
    return fail([{ field: "fieldSlug", message: `Custom field "${payload.fieldSlug}" not found` }]);
  }

  return ok([entity]);
}

async function executeCustomFieldBulkSet(
  gameId: string,
  payload: BulkSetCustomFieldPayload
): Promise<ExecutionResult> {
  const created: CreatedEntity[] = [];
  const errors: Array<{ field: string; message: string }> = [];

  for (const assignment of payload.assignments) {
    const result = await executeCustomFieldSet(gameId, {
      characterName: assignment.characterName,
      fieldSlug: payload.fieldSlug,
      value: assignment.value,
    });
    if (result.success) {
      created.push(...result.createdEntities);
    } else if (result.errors) {
      errors.push(...result.errors);
    }
  }

  if (created.length === 0 && errors.length > 0) return fail(errors);
  return { success: true, createdEntities: created, errors: errors.length > 0 ? errors : undefined };
}

async function executeCustomFieldAddOption(
  gameId: string,
  payload: AddCustomFieldOptionPayload
): Promise<ExecutionResult> {
  const fieldDef = await db.customFieldDefinition.findUnique({
    where: { gameId_slug: { gameId, slug: payload.fieldSlug } },
    include: { options: true },
  });
  if (!fieldDef) {
    return fail([{ field: "fieldSlug", message: `Custom field "${payload.fieldSlug}" not found` }]);
  }

  const maxSort = fieldDef.options.reduce((m, o) => Math.max(m, o.sortOrder), -1);

  const option = await db.customFieldOption.create({
    data: {
      definitionId: fieldDef.id,
      label: payload.label,
      color: payload.color,
      sortOrder: maxSort + 1,
    },
  });

  return ok([{
    type: "custom_field_option",
    id: option.id,
    name: `${fieldDef.name}: ${option.label}`,
  }]);
}

async function executeCustomFieldCreate(
  gameId: string,
  payload: CreateCustomFieldPayload
): Promise<ExecutionResult> {
  if (!payload.name || !payload.slug) {
    return fail([{ field: "name", message: "name and slug are required" }]);
  }

  const existing = await db.customFieldDefinition.findUnique({
    where: { gameId_slug: { gameId, slug: payload.slug } },
  });
  if (existing) {
    return fail([{ field: "slug", message: `Custom field with slug "${payload.slug}" already exists` }]);
  }

  const VALID_FIELD_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "SELECT", "MULTI_SELECT", "DATE", "BOOLEAN", "URL"];
  const fieldType = payload.fieldType && VALID_FIELD_TYPES.includes(payload.fieldType)
    ? payload.fieldType
    : (payload.options && payload.options.length > 0 ? "SELECT" : "TEXT");

  const maxSort = await db.customFieldDefinition.aggregate({
    where: { gameId },
    _max: { sortOrder: true },
  });

  const fieldDef = await db.customFieldDefinition.create({
    data: {
      gameId,
      name: payload.name,
      slug: payload.slug,
      fieldType,
      description: payload.description,
      isRequired: payload.isRequired ?? false,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      options: payload.options
        ? {
            create: payload.options.map((o, i) => ({
              label: o.label,
              color: o.color,
              sortOrder: i,
            })),
          }
        : undefined,
    },
    include: { options: true },
  });

  const created: CreatedEntity[] = [
    { type: "custom_field_definition", id: fieldDef.id, name: fieldDef.name },
  ];
  for (const opt of fieldDef.options) {
    created.push({
      type: "custom_field_option",
      id: opt.id,
      name: `${fieldDef.name}: ${opt.label}`,
    });
  }

  return ok(created);
}

async function executeNpcCreate(
  gameId: string,
  payload: CreateNpcPayload
): Promise<ExecutionResult> {
  const entity = await db.gameEntity.create({
    data: {
      gameId,
      name: payload.name,
      type: "NPC",
      description: payload.description,
      faction: payload.faction,
      archetype: payload.archetype,
    },
  });

  return ok([{ type: "npc", id: entity.id, name: entity.name }]);
}

async function executeTimelineCreateEvent(
  _gameId: string,
  payload: CreateTimelineEventPayload
): Promise<ExecutionResult> {
  // TimelineEvent model may not exist yet — return a stub
  return ok([{ type: "timeline_event", id: "stub", name: payload.title }]);
}

async function executeBriefUpdateSection(
  gameId: string,
  payload: UpdateBriefSectionPayload
): Promise<ExecutionResult> {
  const resolved = await resolveCharacterName(gameId, payload.characterName);
  if (!resolved) {
    return fail([{ field: "characterName", message: `Character "${payload.characterName}" not found` }]);
  }

  const latestBrief = await db.briefVersion.findFirst({
    where: { entityId: resolved.id },
    orderBy: { version: "desc" },
  });

  if (!latestBrief) {
    return fail([{ field: "characterName", message: `No brief exists for "${payload.characterName}"` }]);
  }

  await db.briefVersion.update({
    where: { id: latestBrief.id },
    data: { [payload.section]: payload.content },
  });

  return ok([{
    type: "brief_section",
    id: latestBrief.id,
    name: `${resolved.name}.${payload.section}`,
  }]);
}

// --- Composite executors ---

async function executeGroupCharacters(
  gameId: string,
  payload: GroupCharactersPayload
): Promise<ExecutionResult> {
  let fieldDef = await db.customFieldDefinition.findUnique({
    where: { gameId_slug: { gameId, slug: payload.fieldSlug } },
  });

  if (!fieldDef && payload.createFieldIfMissing) {
    const maxSort = await db.customFieldDefinition.aggregate({
      where: { gameId },
      _max: { sortOrder: true },
    });

    fieldDef = await db.customFieldDefinition.create({
      data: {
        gameId,
        name: payload.createFieldIfMissing.name,
        slug: payload.fieldSlug,
        fieldType: "SELECT",
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }

  if (!fieldDef) {
    const existing = await db.customFieldDefinition.findMany({
      where: { gameId },
      select: { slug: true },
    });
    return fail([{
      field: "fieldSlug",
      message: `Field "${payload.fieldSlug}" not found. Existing: ${existing.map((e) => e.slug).join(", ") || "none"}`,
    }]);
  }

  const created: CreatedEntity[] = [];

  if (!fieldDef.id.startsWith("_")) {
    created.push({
      type: "custom_field_definition",
      id: fieldDef.id,
      name: fieldDef.name,
    });
  }

  for (const group of payload.groups) {
    const maxSort = await db.customFieldOption.aggregate({
      where: { definitionId: fieldDef.id },
      _max: { sortOrder: true },
    });

    const option = await db.customFieldOption.create({
      data: {
        definitionId: fieldDef.id,
        label: group.optionLabel,
        color: group.optionColor,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
    created.push({
      type: "custom_field_option",
      id: option.id,
      name: `${fieldDef.name}: ${group.optionLabel}`,
    });

    for (const member of group.members) {
      const resolved = await resolveCharacterName(gameId, member.characterName);
      if (!resolved) continue;

      const cfValue = await db.customFieldValue.upsert({
        where: {
          definitionId_characterId: {
            definitionId: fieldDef.id,
            characterId: resolved.id,
          },
        },
        create: { definitionId: fieldDef.id, characterId: resolved.id },
        update: {},
      });

      await db.customFieldValueOption.upsert({
        where: {
          valueId_optionId: { valueId: cfValue.id, optionId: option.id },
        },
        create: { valueId: cfValue.id, optionId: option.id },
        update: {},
      });

      created.push({
        type: "custom_field_value",
        id: cfValue.id,
        name: `${resolved.name} → ${group.optionLabel}`,
      });
    }
  }

  return ok(created);
}

async function executePlotlineMatrix(
  gameId: string,
  payload: PlotlineMatrixPayload
): Promise<ExecutionResult> {
  const created: CreatedEntity[] = [];

  for (const pl of payload.plotlines) {
    const result = await executePlotlineCreate(gameId, {
      name: pl.name,
      type: pl.type,
      description: pl.description,
      characters: pl.characters,
    });
    created.push(...result.createdEntities);
  }

  return ok(created);
}

// --- Main dispatcher ---

export async function executeAction(
  gameId: string,
  actionType: ActionType,
  payload: unknown
): Promise<ExecutionResult> {
  try {
    switch (actionType) {
      case "character.create":
        return await executeCharacterCreate(gameId, payload as CreateCharacterPayload);
      case "character.update":
        return await executeCharacterUpdate(gameId, payload as UpdateCharacterPayload);
      case "character.bulk_create":
        return await executeBulkCreateCharacters(gameId, payload as BulkCreateCharactersPayload);
      case "relationship.create":
        return await executeRelationshipCreate(gameId, payload as CreateRelationshipPayload);
      case "relationship.bulk_create":
        return await executeBulkCreateRelationships(gameId, payload as BulkCreateRelationshipsPayload);
      case "plotline.create":
        return await executePlotlineCreate(gameId, payload as CreatePlotlinePayload);
      case "plotline.assign_characters":
        return await executePlotlineAssignCharacters(gameId, payload as AssignPlotlineCharactersPayload);
      case "plotline.bulk_create":
        return await executeBulkCreatePlotlines(gameId, payload as BulkCreatePlotlinesPayload);
      case "custom_field.set":
        return await executeCustomFieldSet(gameId, payload as SetCustomFieldPayload);
      case "custom_field.bulk_set":
        return await executeCustomFieldBulkSet(gameId, payload as BulkSetCustomFieldPayload);
      case "custom_field.add_option":
        return await executeCustomFieldAddOption(gameId, payload as AddCustomFieldOptionPayload);
      case "custom_field.create":
        return await executeCustomFieldCreate(gameId, payload as CreateCustomFieldPayload);
      case "timeline.create_event":
        return await executeTimelineCreateEvent(gameId, payload as CreateTimelineEventPayload);
      case "npc.create":
        return await executeNpcCreate(gameId, payload as CreateNpcPayload);
      case "brief.update_section":
        return await executeBriefUpdateSection(gameId, payload as UpdateBriefSectionPayload);
      case "composite.group_characters":
        return await executeGroupCharacters(gameId, payload as GroupCharactersPayload);
      case "composite.plotline_matrix":
        return await executePlotlineMatrix(gameId, payload as PlotlineMatrixPayload);
      default:
        return fail([{ field: "actionType", message: `Unknown action type: ${actionType}` }]);
    }
  } catch (error: any) {
    return fail([{ field: "_internal", message: error.message ?? "Execution error" }]);
  }
}
