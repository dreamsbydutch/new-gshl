"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@gshl-components/ui/button";
import { Input } from "@gshl-components/ui/input";
import { useUploadThing } from "@gshl-components/ui/uploadthing";
import { cn } from "@gshl-utils";

const MAX_FILE_SIZE = 4 * 1024 * 1024;

export function ImageUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const { startUpload, isUploading } = useUploadThing("imageUploader", {
    onUploadError(uploadError) {
      setError(uploadError.message || "The image could not be uploaded.");
    },
  });

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const chooseFile = (nextFile?: File) => {
    setError("");
    setUploadedUrl("");
    setCopied(false);

    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      setFile(null);
      setError("Choose an image file.");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("The image must be 4 MB or smaller.");
      return;
    }

    setFile(nextFile);
  };

  const upload = async () => {
    if (!file) return;
    setError("");
    setUploadedUrl("");
    setCopied(false);

    const uploadedFiles = await startUpload([file]);
    const url = uploadedFiles?.[0]?.ufsUrl;
    if (!url) {
      setError(
        "The upload finished without returning a URL. Please try again.",
      );
      return;
    }

    setUploadedUrl(url);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(uploadedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Could not copy automatically. Select the URL and copy it manually.",
      );
    }
  };

  const clear = () => {
    setFile(null);
    setUploadedUrl("");
    setError("");
    setCopied(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Image Upload</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload one image to UploadThing and copy its permanent URL.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <button
          type="button"
          className={cn(
            "relative flex min-h-64 w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            isDragging
              ? "border-slate-700 bg-slate-100"
              : "border-slate-300 bg-slate-50 hover:border-slate-500 hover:bg-slate-100",
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            chooseFile(event.dataTransfer.files[0]);
          }}
          disabled={isUploading}
        >
          {previewUrl ? (
            <>
              <Image
                src={previewUrl}
                alt="Selected image preview"
                fill
                unoptimized
                className="object-contain p-3"
              />
              <span className="absolute bottom-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs text-white">
                Click or drop to replace
              </span>
            </>
          ) : (
            <>
              <span className="mb-4 rounded-full bg-white p-4 shadow-sm">
                <ImagePlus className="h-8 w-8 text-slate-700" />
              </span>
              <span className="font-semibold text-slate-900">
                Drop an image here or click to choose
              </span>
              <span className="mt-2 text-sm text-slate-500">
                One image, up to 4 MB
              </span>
            </>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />

        {file ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-slate-700">{file.name}</span>
            <button
              type="button"
              onClick={clear}
              disabled={isUploading}
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
              aria-label="Remove selected image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          className="mt-5 w-full"
          disabled={!file || isUploading}
          onClick={() => void upload()}
        >
          {isUploading ? (
            <>
              <LoaderCircle className="animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload /> Upload image
            </>
          )}
        </Button>

        {uploadedUrl ? (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <label
              htmlFor="uploaded-image-url"
              className="mb-2 block text-sm font-semibold text-slate-900"
            >
              Uploaded image URL
            </label>
            <div className="flex gap-2">
              <Input
                id="uploaded-image-url"
                value={uploadedUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyUrl()}
                aria-label="Copy uploaded image URL"
              >
                {copied ? <Check /> : <Copy />}
                <span className="hidden sm:inline">
                  {copied ? "Copied" : "Copy"}
                </span>
              </Button>
            </div>
            <a
              href={uploadedUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm font-medium text-blue-700 underline-offset-4 hover:underline"
            >
              Open uploaded image
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
