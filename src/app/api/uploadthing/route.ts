import { createRouteHandler } from "uploadthing/next";
import { imageFileRouter } from "@gshl-server/uploadthing";

export const { GET, POST } = createRouteHandler({
  router: imageFileRouter,
});
