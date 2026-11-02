import React, { useState } from "react";
import styles from "./VideoInput.module.css";

const SAMPLES = [
  {
    label: "3Blue1Brown · Neural Networks",
    url: "https://www.youtube.com/watch?v=aircAruvnKk",
  },
  {
    label: "Veritasium · Quantum Computers",
    url: "https://www.youtube.com/watch?v=g_IaVepNDT4",
  },
  {
    label: "Lex Fridman · Karpathy AI",
    url: "https://www.youtube.com/watch?v=cdiD-9MMpb0",
  },
];

export default function VideoInput({ onProcess, isLoading }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const isYouTubeUrl = (val) => {
    return (
      val.includes("youtube.com/watch") ||
      val.includes("youtu.be/") ||
      val.includes("youtube.com/shorts/") ||
      val.includes("youtube.com/embed/") ||
      /^[a-zA-Z0-9_-]{11}$/.test(val)
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) {
      setError("Please paste a valid YouTube video URL.");
      return;
    }
    if (!isYouTubeUrl(trimmed)) {
      setError("Please enter a valid YouTube video link (e.g. https://www.youtube.com/watch?v=...)");
      return;
    }

    setError("");
    onProcess(trimmed);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && isYouTubeUrl(text.trim())) {
        setUrl(text.trim());
        setError("");
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className={styles.container}>
      {/* Brand Pill */}
      <div className={styles.topBadge}>
        <span className={styles.pulsingDot} />
        <span className={styles.badgeText}>VIDORA · Timestamped Vector Intelligence</span>
      </div>

      <h1 className={styles.headline}>
        Deep Video Context.
        <br />
        <span className={styles.gradientText}>500-600 Word Insights &amp; Exact Timestamps.</span>
      </h1>

      <p className={styles.subtext}>
        Paste any YouTube URL — from 5 minutes to 2+ hours. VIDORA transcribes, indexes into ChromaDB, and lets you ask what was said at any specific minute or hour.
      </p>

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.inputBar}>
          <div className={styles.ytIcon}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
              <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none" />
            </svg>
          </div>

          <input
            id="video-url-input"
            type="url"
            placeholder="Paste YouTube video link (e.g. https://www.youtube.com/watch?v=...)"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            className={styles.input}
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading}
          />

          {url ? (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => setUrl("")}
              disabled={isLoading}
            >
              ✕
            </button>
          ) : (
            <button
              type="button"
              className={styles.pasteBtn}
              onClick={handlePaste}
            >
              Paste
            </button>
          )}

          <button
            id="analyze-btn"
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? (
              <span className={styles.spinner} />
            ) : (
              <>
                <span>Process Video</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </p>
        )}
      </form>

      {/* Quick sample chips */}
      <div className={styles.samples}>
        <span className={styles.sampleLabel}>Try sample:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            className={styles.sampleChip}
            onClick={() => {
              setUrl(s.url);
              setError("");
            }}
            disabled={isLoading}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
