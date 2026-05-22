"use client";

import { useEffect, useState } from "react";
import { zipSync, strToU8 } from "fflate";

type ProjectMeta = {
  name: string;
  files: string[];
};

type DownloadState = "idle" | "loading" | "error";

function fileIcon(path: string): string {
  if (path.endsWith(".md")) return "📄";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "⚙️";
  if (path.endsWith(".cjs") || path.endsWith(".js") || path.endsWith(".ts")) return "🔧";
  if (path.endsWith(".mdc")) return "✦";
  return "📄";
}

function FileList({ files }: { files: string[] }) {
  const grouped = files.reduce<Record<string, string[]>>((acc, f) => {
    const parts = f.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    const key = dir === "" ? "(root)" : dir;
    (acc[key] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="mt-3 space-y-2">
      {Object.entries(grouped).map(([dir, dirFiles]) => (
        <div key={dir}>
          {dir !== "(root)" && (
            <p className="mb-1 text-xs font-medium text-slate-400">{dir}/</p>
          )}
          <ul className="space-y-0.5">
            {dirFiles.map((f) => {
              const name = f.split("/").at(-1) ?? f;
              return (
                <li key={f} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <span className="text-xs">{fileIcon(f)}</span>
                  {name}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectMeta }) {
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");

  const handleDownload = async () => {
    setDownloadState("loading");
    try {
      const res = await fetch(`/api/artifacts/${project.name}`);
      if (!res.ok) throw new Error("Failed to fetch artifacts.");
      const data = (await res.json()) as { files: Record<string, string> };

      const zipInput: Record<string, Uint8Array> = {};
      for (const [path, content] of Object.entries(data.files)) {
        zipInput[path] = strToU8(content);
      }

      const zipped = zipSync(zipInput);
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name}-artifacts.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setDownloadState("idle");
    } catch {
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 3000);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{project.name}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {project.files.length} {project.files.length === 1 ? "artifact" : "artifacts"}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloadState === "loading"}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            downloadState === "error"
              ? "bg-red-50 text-red-600"
              : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          }`}
        >
          {downloadState === "loading"
            ? "Preparing…"
            : downloadState === "error"
              ? "Error"
              : "Download .zip"}
        </button>
      </div>
      <FileList files={project.files} />
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/artifacts")
      .then((res) => (res.ok ? (res.json() as Promise<ProjectMeta[]>) : []))
      .then((data) => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <p className="mt-1 text-sm text-slate-500">
          Rendered architecture artifacts, grouped by project.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
          Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <p className="text-sm font-medium text-slate-400">No projects yet.</p>
          <p className="mt-1 text-xs text-slate-300">
            Run <code className="rounded bg-slate-100 px-1 py-0.5">architect-companion init</code> in
            a project to generate artifacts.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.name} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
