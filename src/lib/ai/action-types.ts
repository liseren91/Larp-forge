export type ActionType =
  | "character.create"
  | "character.update"
  | "character.bulk_create"
  | "relationship.create"
  | "relationship.bulk_create"
  | "plotline.create"
  | "plotline.assign_characters"
  | "plotline.bulk_create"
  | "custom_field.set"
  | "custom_field.bulk_set"
  | "custom_field.add_option"
  | "custom_field.create"
  | "timeline.create_event"
  | "npc.create"
  | "brief.update_section"
  | "composite.group_characters"
  | "composite.plotline_matrix";

// --- Character payloads ---

export interface CreateCharacterPayload {
  name: string;
  description?: string;
  type?: "CHARACTER" | "NPC";
  faction?: string;
  archetype?: string;
  customFields?: Record<string, string | number | boolean>;
  subRoles?: Array<{
    definitionSlug: string;
    playerName?: string;
    notes?: string;
  }>;
}

export interface UpdateCharacterPayload {
  characterName: string;
  name?: string;
  description?: string;
  faction?: string;
  archetype?: string;
  customFields?: Record<string, string | number | boolean>;
}

export interface BulkCreateCharactersPayload {
  characters: Array<{
    name: string;
    description?: string;
    type?: "CHARACTER" | "NPC";
    faction?: string;
    archetype?: string;
    customFields?: Record<string, string | number | boolean>;
  }>;
}

// --- Relationship payloads ---

export interface CreateRelationshipPayload {
  fromCharacter: string;
  toCharacter: string;
  type?: string;
  description?: string;
  intensity?: number;
  bidirectional?: boolean;
}

export interface BulkCreateRelationshipsPayload {
  relationships: Array<{
    fromCharacter: string;
    toCharacter: string;
    type?: string;
    description?: string;
    intensity?: number;
    bidirectional?: boolean;
  }>;
}

// --- Plotline payloads ---

export interface CreatePlotlinePayload {
  name: string;
  type?: string;
  description?: string;
  characters?: string[];
}

export interface AssignPlotlineCharactersPayload {
  plotlineName: string;
  characters: string[];
}

export interface BulkCreatePlotlinesPayload {
  plotlines: Array<{
    name: string;
    type?: string;
    description?: string;
    characters?: string[];
  }>;
}

// --- Custom field payloads ---

export interface SetCustomFieldPayload {
  characterName: string;
  fieldSlug: string;
  value: string | number | boolean;
}

export interface BulkSetCustomFieldPayload {
  fieldSlug: string;
  assignments: Array<{
    characterName: string;
    value: string | number | boolean;
  }>;
}

export interface AddCustomFieldOptionPayload {
  fieldSlug: string;
  label: string;
  color?: string;
}

export interface CreateCustomFieldPayload {
  name: string;
  slug: string;
  fieldType:
    | "TEXT"
    | "TEXTAREA"
    | "NUMBER"
    | "SELECT"
    | "MULTI_SELECT"
    | "DATE"
    | "BOOLEAN"
    | "URL";
  description?: string;
  isRequired?: boolean;
  options?: Array<{ label: string; color?: string }>;
}

// --- Timeline ---

export interface CreateTimelineEventPayload {
  title: string;
  description?: string;
  date?: string;
  characters?: string[];
}

// --- NPC ---

export interface CreateNpcPayload {
  name: string;
  description?: string;
  faction?: string;
  archetype?: string;
}

// --- Brief ---

export interface UpdateBriefSectionPayload {
  characterName: string;
  section: "backstory" | "personality" | "goalsPublic" | "goalsSecret" | "relationships" | "mechanics" | "contacts";
  content: string;
}

// --- Composite payloads ---

export interface GroupCharactersPayload {
  fieldSlug: string;
  createFieldIfMissing?: {
    name: string;
    fieldType: "SELECT";
  };
  groups: Array<{
    optionLabel: string;
    optionColor?: string;
    description?: string;
    members: Array<{
      characterName: string;
      role?: string;
    }>;
  }>;
}

export interface PlotlineMatrixPayload {
  plotlines: Array<{
    name: string;
    type?: string;
    description?: string;
    characters: string[];
  }>;
}

// --- Union of all payloads by action type ---

export type ActionPayloadMap = {
  "character.create": CreateCharacterPayload;
  "character.update": UpdateCharacterPayload;
  "character.bulk_create": BulkCreateCharactersPayload;
  "relationship.create": CreateRelationshipPayload;
  "relationship.bulk_create": BulkCreateRelationshipsPayload;
  "plotline.create": CreatePlotlinePayload;
  "plotline.assign_characters": AssignPlotlineCharactersPayload;
  "plotline.bulk_create": BulkCreatePlotlinesPayload;
  "custom_field.set": SetCustomFieldPayload;
  "custom_field.bulk_set": BulkSetCustomFieldPayload;
  "custom_field.add_option": AddCustomFieldOptionPayload;
  "custom_field.create": CreateCustomFieldPayload;
  "timeline.create_event": CreateTimelineEventPayload;
  "npc.create": CreateNpcPayload;
  "brief.update_section": UpdateBriefSectionPayload;
  "composite.group_characters": GroupCharactersPayload;
  "composite.plotline_matrix": PlotlineMatrixPayload;
};

// --- Execution result ---

export interface ExecutionResult {
  success: boolean;
  createdEntities: Array<{ type: string; id: string; name: string }>;
  errors?: Array<{ field: string; message: string }>;
}

// --- Parsed action segment ---

export interface ActionSegment {
  type: "action";
  actionType: ActionType;
  actionId: string;
  payload: ActionPayloadMap[ActionType];
  raw: string;
}

export interface TextSegment {
  type: "text";
  content: string;
}

export type MessageSegment = ActionSegment | TextSegment;
