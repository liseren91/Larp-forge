import { router } from "../trpc";
import { gameRouter } from "./game";
import { characterRouter } from "./character";
import { relationshipRouter } from "./relationship";
import { plotlineRouter } from "./plotline";
import { briefRouter } from "./brief";
import { chatRouter } from "./chat";
import { fileRouter } from "./file";
import { auditRouter } from "./audit";
import { storyImportRouter } from "./story-import";
import { customFieldsRouter } from "./custom-fields";
import { subRolesRouter } from "./sub-roles";
import { plotlineMatrixRouter } from "./plotline-matrix";
import { briefPipelineRouter } from "./brief-pipeline";

export const appRouter = router({
  game: gameRouter,
  character: characterRouter,
  relationship: relationshipRouter,
  plotline: plotlineRouter,
  brief: briefRouter,
  chat: chatRouter,
  file: fileRouter,
  audit: auditRouter,
  storyImport: storyImportRouter,
  customFields: customFieldsRouter,
  subRoles: subRolesRouter,
  plotlineMatrix: plotlineMatrixRouter,
  briefPipeline: briefPipelineRouter,
});

export type AppRouter = typeof appRouter;
