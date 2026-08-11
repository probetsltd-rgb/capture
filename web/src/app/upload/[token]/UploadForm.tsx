"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { submitUpload, type UploadState } from "./actions";
import { unzipJsonFiles, ZipParseError } from "@/lib/instagram/unzip";

const initialState: UploadState = { status: "idle", message: null };

// Instagram's real export arrives as a .zip with conversations buried in
// nested folders (your_instagram_activity/messages/inbox/<person>/
// message_1.json) — asking a user to extract it and hand-pick files out of
// that tree is real friction, and the desktop-only browser API
// (webkitdirectory) that would let someone select a whole folder in one go
// isn't supported on iOS Safari and crashes Chrome on Android, i.e. exactly
// the phone a business owner is likely doing this from. So: accept the raw
// .zip, unzip it in the browser before submitting (unzip.ts — this is what
// keeps the server never needing to touch a zip at all, see that module's
// own comment), and only fall back to asking for individual files if the
// browser genuinely can't do it.
export function UploadForm({ token }: { token: string }) {
  const action = submitUpload.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const input = fileInputRef.current;
    if (!input?.files) return;

    const files = Array.from(input.files);
    const zipFiles = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
    if (zipFiles.length === 0) return; // nothing to extract — let the native submit proceed as-is

    event.preventDefault();
    setExtractError(null);
    setExtracting(true);

    try {
      const keptFiles = files.filter((f) => !f.name.toLowerCase().endsWith(".zip"));
      const extracted: File[] = [];

      for (const zipFile of zipFiles) {
        const bytes = new Uint8Array(await zipFile.arrayBuffer());
        const jsonFiles = await unzipJsonFiles(bytes);
        if (jsonFiles.length === 0) {
          throw new ZipParseError(`${zipFile.name} didn't contain any .json files — is this the right export?`);
        }
        for (const { name, text } of jsonFiles) {
          extracted.push(new File([text], name, { type: "application/json" }));
        }
      }

      const dt = new DataTransfer();
      for (const f of [...keptFiles, ...extracted]) dt.items.add(f);
      input.files = dt.files;

      setExtracting(false);
      formRef.current?.requestSubmit(); // re-enters this handler; no .zip remains, so it proceeds to the real submit
    } catch (err) {
      setExtracting(false);
      setExtractError(
        err instanceof ZipParseError
          ? err.message
          : "Couldn't read that zip file. You can extract it yourself and upload the message_1.json files instead.",
      );
    }
  }

  if (state.status === "success") {
    return (
      <div className="stack">
        <p className="notice notice--ok">{state.message}</p>
        <Link href={`/report/${token}`} className="btn btn--primary">
          View my Revenue Leak Report
        </Link>
        <p className="meta">
          Analysis runs in the background — refresh the report in a moment if it looks incomplete.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} ref={formRef} className="form">
      <label className="field">
        <span className="field__label">
          Average transaction value<span className="field__hint"> · Optional</span>
        </span>
        <input
          type="number"
          name="avg_transaction_value"
          min="0"
          step="1"
          placeholder="e.g. 150000"
          className="input"
        />
        <span className="field__hint">
          Used to estimate what missed opportunities are worth. Only you see it.
        </span>
      </label>

      <label className="field">
        <span className="field__label">Conversation exports</span>
        <input
          type="file"
          name="files"
          accept=".txt,.json,.zip"
          multiple
          required
          ref={fileInputRef}
          className="input"
          style={{ height: "auto", paddingBlock: "10px" }}
        />
        <span className="field__hint">
          Instagram&apos;s .zip (we unzip it for you), or WhatsApp .txt / Instagram .json files
          individually — up to 5MB each, mixed or separate.
        </span>
      </label>

      {extractError && <p className="notice notice--error">{extractError}</p>}
      {state.status === "error" && !extractError && <p className="notice notice--error">{state.message}</p>}

      <button type="submit" disabled={pending || extracting} className="btn btn--primary btn--block">
        {extracting ? "Unzipping…" : pending ? "Uploading…" : "Upload conversations"}
      </button>
    </form>
  );
}
