/** Read untrusted request bodies without buffering beyond the byte limit. */
export class RequestBodyError extends Error {
  constructor(public readonly status: 400 | 413) {
    super(
      status === 413 ? "Request body too large" : "Unreadable request body",
    );
  }
}

export async function readLimitedRequestText(
  request: Request,
  maxBytes: number,
) {
  if (Number(request.headers.get("content-length")) > maxBytes) {
    throw new RequestBodyError(413);
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new RequestBodyError(413);
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    reader.releaseLock();
  }
}
