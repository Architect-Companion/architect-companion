"use client";

import { useCallback, useEffect, useState } from "react";
import { ProfileEditor } from "@/components/profile-editor";
import { ProfileUpload } from "@/components/profile-upload";

type ProfileMeta = {
  name: string;
  version: string;
  title?: string;
  summary?: string;
};

type EditingProfile = {
  name: string;
  version: string;
};

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingProfile | null>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/profiles");
      if (res.ok) setProfiles((await res.json()) as ProfileMeta[]);
    } catch {
      // silent — server may not be running yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  return (
    <>
      {editing !== null && (
        <ProfileEditor
          name={editing.name}
          version={editing.version}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            void fetchProfiles();
          }}
        />
      )}

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Profile Library</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload architecture profiles and manage them here.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div>
            <ProfileUpload onSuccess={fetchProfiles} />
          </div>

          <div className="lg:col-span-2">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
                Loading profiles…
              </div>
            ) : profiles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center">
                <p className="text-sm font-medium text-slate-400">No profiles yet.</p>
                <p className="mt-1 text-xs text-slate-300">
                  Upload your first profile.yml to get started.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {profiles.map((p) => (
                  <div
                    key={`${p.name}@${p.version}`}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{p.title ?? p.name}</p>
                        {p.summary && (
                          <p className="mt-1 text-sm text-slate-500 line-clamp-2">{p.summary}</p>
                        )}
                        <p className="mt-2 text-xs text-slate-400">{p.name}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                          v{p.version}
                        </span>
                        <button
                          onClick={() => setEditing({ name: p.name, version: p.version })}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
