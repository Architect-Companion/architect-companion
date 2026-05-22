"use client";

import { useCallback, useEffect, useState } from "react";

type ProfileEditorProps = {
  name: string;
  version: string;
  onClose: () => void;
  onSuccess: () => void;
};

type SaveState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; name: string; version: string }
  | { status: "error"; message: string };

export function ProfileEditor({ name, version, onClose, onSuccess }: ProfileEditorProps) {
  const [yaml, setYaml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const fetchYaml = useCallback(async () => {
    try {
      const res = await fetch(`/api/profiles/${name}/${version}`);
      if (res.ok) setYaml(await res.text());
    } finally {
      setLoading(false);
    }
  }, [name, version]);

  useEffect(() => {
    void fetchYaml();
  }, [fetchYaml]);

  const handleSave = async () => {
    setSaveState({ status: "loading" });

    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: yaml,
      });

      const data = (await res.json()) as { name?: string; version?: string; error?: string };

      if (!res.ok) {
        setSaveState({ status: "error", message: data.error ?? "Save failed." });
      } else {
        setSaveState({ status: "success", name: data.name ?? "", version: data.version ?? "" });
        onSuccess();
      }
    } catch {
      setSaveState({ status: "error", message: "Network error. Is the server running?" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-16">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-semibold text-slate-900">{name}</p>
            <p className="text-xs text-slate-400">
              Editing v{version} — bump version in YAML to save as new version
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
              Loading…
            </div>
          ) : (
            <textarea
              value={yaml}
              onChange={(e) => {
                setYaml(e.target.value);
                setSaveState({ status: "idle" });
              }}
              spellCheck={false}
              className="h-96 w-full rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          )}

          {saveState.status === "error" && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {saveState.message}
            </div>
          )}

          {saveState.status === "success" && (
            <div className="mt-3 rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-700">
              Saved as{" "}
              <strong>
                {saveState.name}@{saveState.version}
              </strong>
              .
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || saveState.status === "loading"}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveState.status === "loading" ? "Saving…" : "Save as new version"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
