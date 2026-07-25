import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth } from "@gshl-auth";

const createFileRoute = createUploadthing();

export const imageFileRouter = {
  imageUploader: createFileRoute({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const session = await auth();

      if (session?.user.role !== "commissioner") {
        throw new Error("Forbidden");
      }

      return { userId: session.user.id };
    })
    .onUploadComplete(({ metadata, file }) => ({
      uploadedBy: metadata.userId,
      url: file.ufsUrl,
    })),
} satisfies FileRouter;
