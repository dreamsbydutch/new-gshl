import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";
import type { ImageUploadFileRouter } from "@gshl-types";

export const UploadButton = generateUploadButton<ImageUploadFileRouter>();
export const UploadDropzone = generateUploadDropzone<ImageUploadFileRouter>();
export const { useUploadThing, uploadFiles } =
  generateReactHelpers<ImageUploadFileRouter>();
