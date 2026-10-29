import { MAX_FILE, Problem } from "./catalog";
import { type Env, type Deps, id } from "./security";
export async function upload(req: Request, e: Env, order: any, d: Deps) {
  const raw = req.headers.get("x-file-name") || "";
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    throw new Problem(400, "invalid_filename");
  }
  if (
    !name ||
    name.length > 150 ||
    /[\\/\x00-\x1f\x7f]/.test(name) ||
    name.includes("..")
  )
    throw new Problem(400, "invalid_filename");
  name = name.normalize("NFKC").replace(/[^\p{L}\p{N} ._()-]/gu, "_");
  const ext = name.split(".").pop()?.toLowerCase();
  const mime = req.headers.get("content-type")?.split(";")[0] || "";
  const types: Record<string, string[]> = {
    xer: ["text/plain", "application/octet-stream"],
    csv: ["text/csv", "text/plain"],
    pdf: ["application/pdf"],
  };
  if (!ext || !types[ext]?.includes(mime))
    throw new Problem(415, "file_type_disabled");
  const category = req.headers.get("x-file-category") || "";
  if (
    ![
      "xer",
      "baseline",
      "progress",
      "boq",
      "drawings",
      "scope",
      "resources",
      "materials",
    ].includes(category)
  )
    throw new Problem(400, "invalid_document_category");
  if (category === "xer" && ext !== "xer")
    throw new Problem(415, "xer_document_required");
  const length = req.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_FILE))
    throw new Problem(413, "file_too_large");
  if (!req.body) throw new Problem(400, "empty_file");
  const fileId = id(),
    key = `temp/${order.id}/${fileId}`,
    now = d.now();
  try {
    await e.DB.prepare(
      "INSERT INTO order_files(id,order_id,r2_key,name,mime,category,bytes,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?,'UPLOADING',?,?)",
    )
      .bind(
        fileId,
        order.id,
        key,
        name,
        mime,
        category,
        MAX_FILE,
        now,
        order.expires_at,
      )
      .run();
  } catch {
    throw new Problem(409, "upload_quota_or_order_locked");
  }
  let bytes = 0;
  const reader = req.body.getReader();
  let head = new Uint8Array();
  // Header inspection is bounded; high-risk Office, XML, CAD and archives are disabled.
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (d.now() >= order.expires_at || d.now() - now >= 120)
          throw new Problem(410, "upload_expired");
        let timer: ReturnType<typeof setTimeout>;
        const r = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Problem(408, "upload_timeout")),
              15000,
            );
          }),
        ]).finally(() => clearTimeout(timer));
        if (r.done) {
          if (!bytes) throw new Problem(400, "empty_file");
          controller.close();
          return;
        }
        bytes += r.value.length;
        if (bytes > MAX_FILE) throw new Problem(413, "file_too_large");
        if (head.length < 1024) {
          const combined = new Uint8Array(
            Math.min(1024, head.length + r.value.length),
          );
          combined.set(head);
          combined.set(
            r.value.subarray(0, combined.length - head.length),
            head.length,
          );
          head = combined;
          const text = new TextDecoder().decode(head);
          if (
            ext !== "pdf" &&
            /<\s*(?:!doctype|html|script|svg)|\x00|^MZ/i.test(text)
          )
            throw new Problem(415, "unsafe_content");
        }
        controller.enqueue(r.value);
      } catch (err) {
        await reader.cancel().catch(() => {});
        controller.error(err);
      }
    },
    cancel() {
      return reader.cancel();
    },
  });
  try {
    const content = await new Response(stream).arrayBuffer();
    const text = new TextDecoder().decode(head);
    if (ext === "pdf" && !text.startsWith("%PDF-"))
      throw new Problem(415, "signature_mismatch");
    if (ext === "xer" && !text.startsWith("ERMHDR"))
      throw new Problem(415, "signature_mismatch");
    if (
      ext === "csv" &&
      !text.includes(",") &&
      !text.includes(";") &&
      !text.includes("\t")
    )
      throw new Problem(415, "signature_mismatch");
    await e.UPLOADS.put(key, content, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    const result = await e.DB.prepare(
      "UPDATE order_files SET bytes=?,state='READY' WHERE id=? AND state='UPLOADING' AND expires_at>? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='DRAFT')",
    )
      .bind(bytes, fileId, d.now(), order.id)
      .run();
    if (!result.meta.changes) throw new Problem(410, "upload_expired");
    return { id: fileId, name, bytes, category, expiresAt: order.expires_at };
  } catch (err) {
    await e.DB.prepare("UPDATE order_files SET state='FAILED' WHERE id=?")
      .bind(fileId)
      .run();
    await e.UPLOADS.delete(key)
      .then(() =>
        e.DB.prepare("UPDATE order_files SET deleted_at=? WHERE id=?")
          .bind(d.now(), fileId)
          .run(),
      )
      .catch(() => {});
    throw err instanceof Problem ? err : new Problem(400, "upload_failed");
  }
}
export async function removeFile(e: Env, file: any, now: number) {
  await e.UPLOADS.delete(file.r2_key);
  await e.DB.prepare(
    "UPDATE order_files SET state='DELETED',name='deleted-document',deleted_at=? WHERE id=?",
  )
    .bind(now, file.id)
    .run();
}
