"use client";

import { useCallback, useRef, useState } from "react";

type UploadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; name: string; version: string }
  | { status: "error"; message: string };

type ProfileUploadProps = {
  onSuccess?: () => void;
};

export function ProfileUpload({ onSuccess }: ProfileUploadProps) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    setFileName(file.name);
    setState({ status: "idle" });
    const reader = new FileReader();
    reader.onload = (e) => setFileContent((e.target?.result as string) ?? null);
    reader.readAsText(file);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  const handleSubmit = async () => {
    if (!fileContent) return;
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: fileContent,
      });

      const data = (await res.json()) as { name?: string; version?: string; error?: string };

      if (!res.ok) {
        setState({ status: "error", message: data.error ?? "Upload failed." });
      } else {
        setState({ status: "success", name: data.name ?? "", version: data.version ?? "" });
        setFileName(null);
        setFileContent(null);
        if (inputRef.current) inputRef.current.value = "";
        onSuccess?.();
      }
    } catch {
      setState({ status: "error", message: "Network error. Is the server running?" });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700 uppercase tracking-wide">
        Upload Profile
      </h2>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".yml,.yaml"
          onChange={handleInputChange}
          className="hidden"
        />
        {fileName ? (
          <div>
            <p className="text-sm font-medium text-slate-700">{fileName}</p>
            <p className="mt-1 text-xs text-slate-400">Click to replace</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-500">Drop profile.yml here</p>
            <p className="mt-1 text-xs text-slate-400">or click to select a file</p>
          </div>
        )}
      </div>

      {state.status === "error" && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === "success" && (
        <div className="mt-3 rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-700">
          <strong>
            {state.name}@{state.version}
          </strong>{" "}
          uploaded successfully.
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!fileContent || state.status === "loading"}
        className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.status === "loading" ? "Uploading…" : "Upload Profile"}
      </button>
    </div>
  );
}
