import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { gameAccessWhere } from "@/server/access";

async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (mimeType === "text/plain" || mimeType === "text/markdown" || ext === "txt" || ext === "md") {
    return buffer.toString("utf-8");
  }

  if (mimeType === "application/pdf" || ext === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data.text;
    } catch {
      return null;
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      return null;
    }
  }

  return null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const gameId = formData.get("gameId") as string | null;
    const category = (formData.get("category") as string) || "REFERENCE";
    const description = formData.get("description") as string | null;

    if (!file || !gameId) {
      return Response.json({ error: "Missing file or gameId" }, { status: 400 });
    }

    await db.game.findFirstOrThrow({
      where: { id: gameId, ...gameAccessWhere(session.user.id) },
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extractedText = await extractText(buffer, file.type, file.name);

    const gameFile = await db.gameFile.create({
      data: {
        name: file.name,
        mimeType: file.type || null,
        size: file.size,
        category: category as any,
        description: description || null,
        content: buffer,
        extractedText,
        gameId,
      },
    });

    return Response.json({
      id: gameFile.id,
      name: gameFile.name,
      mimeType: gameFile.mimeType,
      size: gameFile.size,
      category: gameFile.category,
      description: gameFile.description,
      extractedText: gameFile.extractedText,
      createdAt: gameFile.createdAt,
    });
  } catch (err: any) {
    console.error("File upload error:", err);
    return Response.json({ error: err.message ?? "Upload failed" }, { status: 500 });
  }
}
