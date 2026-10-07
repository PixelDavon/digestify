"use client";

import { useState, useEffect } from "react";
import { Sparkles, ExternalLink, BookOpen, Trash2, Loader2, AlertCircle, Copy, Check } from "lucide-react";

interface Note {
  id: string;
  url: string;
  title: string;
  summary: string[];
  tags: string[];
  createdAt: string;
}

const STORAGE_KEY = "digestify_notes";

const isNote = (value: unknown): value is Note => {
  if (typeof value !== "object" || value === null) return false;

  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    typeof note.url === "string" &&
    typeof note.title === "string" &&
    Array.isArray(note.summary) &&
    note.summary.every((point) => typeof point === "string") &&
    Array.isArray(note.tags) &&
    note.tags.every((tag) => typeof tag === "string") &&
    typeof note.createdAt === "string"
  );
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  // Load from LocalStorage on initial client mount (Prevents SSR Hydration Error)
  useEffect(() => {
    requestAnimationFrame(() => {
      setMounted(true);
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setNotes(parsed.filter(isNote));
          }
        }
      } catch (error: unknown) {
        console.error("Failed to load notes from LocalStorage", error);
      }
    });
  }, []);

  // Helper to update both React State and LocalStorage
  const saveNotes = (updatedNotes: Note[]) => {
    setNotes(updatedNotes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedNotes));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const validationError = "Please enter a valid HTTP/HTTPS URL";
    const inputUrl = urlInput.trim();

    let isValid = true;
    try {
      const url = new URL(inputUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        isValid = false;
      }
    } catch {
      isValid = false;
    }

    if (!isValid) {
      if (error !== validationError) setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Failed to process link.";
        throw new Error(message);
      }
      setError(null);

      if (!isNote(data)) {
        throw new Error("The server returned an invalid summary.");
      }

      // Prepend new note to the top of list & save
      const updatedNotes = [data, ...notes];
      saveNotes(updatedNotes);
      setUrlInput("");
    } catch (error: unknown) {
      setError(getErrorMessage(error, "An error occurred while fetching summary."));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    const updatedNotes = notes.filter((n) => n.id !== id);
    saveNotes(updatedNotes);
  };

  const handleCopy = async (note: Note) => {
    try {
      const text = [note.title, "", ...note.summary.map((point) => `- ${point}`)].join("\n");
      await navigator.clipboard.writeText(text);
      setCopiedNoteId(note.id);
      window.setTimeout(() => setCopiedNoteId(null), 2000);
    } catch (error: unknown) {
      console.error("Failed to copy summary", error);
      setError("Failed to copy summary to the clipboard.");
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-neutral-400 font-sans p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags)));
  const filteredNotes = selectedTag
    ? notes.filter((n) => n.tags.includes(selectedTag))
    : notes;

  return (
    <main className="min-h-screen bg-[#0F0F0F] text-neutral-200 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-neutral-800 pb-6">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <BookOpen className="w-6 h-6 text-indigo-400" />
            <h1 className="text-xl font-semibold tracking-tight text-white">Digestify</h1>
          </button>
          <span className="text-xs bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 px-3 py-1 rounded-full font-mono">
            ⚡ Powered by Featherless AI
          </span>
        </header>

        {/* URL Input Form */}
        <div className="space-y-3 max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex gap-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-xl focus-within:border-indigo-500 transition-all">
              <input
                type="url"
                required
                placeholder="Paste any article or document URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={loading}
                className="flex-1 bg-transparent px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !urlInput.trim()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Summarize
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Error Message Toast */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900/60 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Filter Tag Pills */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                selectedTag === null
                  ? "bg-white text-black border-white font-medium"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              All Links ({notes.length})
            </button>
            {allTags.map((tag, index) => (
              <button
                key={`tag-filter-${tag}-${index}`}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                  selectedTag === tag
                    ? "bg-indigo-600 text-white border-indigo-500 font-medium"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Empty State */}
        {notes.length === 0 && !loading && (
          <div className="text-center py-16 border border-dashed border-neutral-800 rounded-2xl space-y-3">
            <p className="text-neutral-400 text-sm">No links saved yet.</p>
            <p className="text-neutral-600 text-xs">Paste a URL above to generate your first Notion-style AI summary.</p>
          </div>
        )}

        {/* Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading && (
            <div
              aria-hidden="true"
              className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between animate-pulse"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="h-5 bg-neutral-800 rounded w-3/4" />
                  <div className="h-4 w-4 bg-neutral-800 rounded shrink-0" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-neutral-800 rounded w-full" />
                  <div className="h-3 bg-neutral-800 rounded w-11/12" />
                  <div className="h-3 bg-neutral-800 rounded w-4/5" />
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-neutral-800/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-4 w-12 bg-neutral-800 rounded" />
                  <div className="h-4 w-16 bg-neutral-800 rounded" />
                </div>
                <div className="h-3 w-20 bg-neutral-800 rounded" />
              </div>
            </div>
          )}
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              className="bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 rounded-xl p-5 flex flex-col justify-between transition-all group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium text-white text-base leading-snug line-clamp-2">
                    {note.title}
                  </h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(note)}
                      className="text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                      title={copiedNoteId === note.id ? "Copied" : "Copy summary"}
                    >
                      {copiedNoteId === note.id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <a
                      href={note.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-neutral-500 hover:text-neutral-300 transition-colors"
                      title="Open source link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="text-neutral-600 hover:text-red-400 transition-colors cursor-pointer"
                      title="Delete entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-neutral-300 list-disc list-inside">
                  {note.summary.map((point, idx) => (
                    <li key={`${note.id}-summary-${idx}`} className="leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 mt-4 border-t border-neutral-800/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {note.tags.map((tag, idx) => (
                    <span
                      key={`${note.id}-tag-${idx}`}
                      className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded border border-neutral-700/50"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-neutral-500 font-mono">{note.createdAt}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}