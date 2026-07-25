import { generateReactHelpers } from "@uploadthing/react";
import type { ImageUploadFileRouter } from "@gshl-types";

export const { useUploadThing: useImageUpload } =
  generateReactHelpers<ImageUploadFileRouter>();
