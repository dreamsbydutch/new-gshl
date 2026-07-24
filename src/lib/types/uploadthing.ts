import type { FileRouter } from "uploadthing/types";

/**
 * Public client contract for the image upload endpoint.
 *
 * The server owns the endpoint implementation. Keeping this route-key-only
 * contract here prevents client components from importing an App Router API
 * module while preserving the typed endpoint name.
 */
export type ImageUploadFileRouter = {
  imageUploader: FileRouter[string];
};
