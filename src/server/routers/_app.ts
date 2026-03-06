import { router } from "../trpc";
import { gameRouter } from "./game";
import { characterRouter } from "./character";
import { relationshipRouter } from "./relationship";
import { plotlineRouter } from "./plotline";
import { briefRouter } from "./brief";
import { chatRouter } from "./chat";

export const appRouter = router({
  game: gameRouter,
  character: characterRouter,
  relationship: relationshipRouter,
  plotline: plotlineRouter,
  brief: briefRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
