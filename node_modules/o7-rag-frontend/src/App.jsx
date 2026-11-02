import React, { useState, useEffect } from "react";
import VideoInput from "./components/VideoInput.jsx";
import Summary from "./components/Summary.jsx";
import ChatBox from "./components/ChatBox.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import { processVideo, getConfig, getStoredConfig } from "./api.js";
import styles from "./App.module.css";

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [error, setError] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [serverConfig, setServerConfig] = useState(null);
  const [chatPrefill, setChatPrefill] = useState("");

  useEffect(() => {
    refreshConfig();
  }, []);

  const refreshConfig = () => {
    getConfig()
      .then((cfg) => setServerConfig(cfg))
      .catch(() => {});
  };

  const handleProcessVideo = async (url) => {
    setIsProcessing(true);
    setError("");
    setSummaryData(null);
    setCurrentUrl(url);

    try {
      const data = await processVideo(url);
      setSummaryData(data);

      setTimeout(() => {
        document.getElementById("summary-card")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Failed to process video. Please verify the URL or configure your Gemini / Chroma keys in Settings.";
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSummaryData(null);
    setCurrentUrl("");
    setError("");
    setChatPrefill("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAskTimestamp = (question) => {
    setChatPrefill(question);
    setTimeout(() => {
      document.getElementById("chat-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  const localConf = getStoredConfig();
  const activeTenant = localConf?.chromaTenant || serverConfig?.chromaTenant || "default_tenant";
  const activeDb = localConf?.chromaDatabase || serverConfig?.chromaDatabase || "default_database";

  return (
    <div className={styles.app}>
      {/* ── Top Navigation Bar ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo} onClick={handleReset} style={{ cursor: "pointer" }}>
            <div className={styles.logoBadge}>
              <span className={styles.badgeGlyph}>⚡</span>
            </div>
            <div className={styles.logoMeta}>
              <span className={styles.brandTitle}>VIDORA</span>
              <span className={styles.brandSub}>VIDEO INTELLIGENCE</span>
            </div>
          </div>

          <div className={styles.navRight}>
            <button
              className={styles.statusPill}
              onClick={() => setIsSettingsOpen(true)}
              title="Click to configure ChromaDB Tenant, API Key, and Database"
            >
              <span className={styles.statusDot} />
              <span className={styles.statusText}>ChromaDB · {activeDb}</span>
            </button>

            <button
              className={styles.settingsIconBtn}
              onClick={() => setIsSettingsOpen(true)}
              title="ChromaDB & Gemini Settings"
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {summaryData && (
              <button
                id="new-video-btn"
                className={styles.newVideoBtn}
                onClick={handleReset}
              >
                + New Video
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Nebula Glow Background ── */}
      <div className={styles.ambientGlow} aria-hidden="true" />

      {/* ── Main Workspace ── */}
      <main className={styles.main}>
        {/* URL Input */}
        <VideoInput onProcess={handleProcessVideo} isLoading={isProcessing} />

        {/* Error Notification */}
        {error && (
          <div className={styles.errorAlert} role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className={styles.errorTextWrap}>
              <span>{error}</span>
              {(error.includes("API Key") || error.includes("Chroma") || error.includes("Gemini")) && (
                <button
                  className={styles.settingsShortcut}
                  onClick={() => setIsSettingsOpen(true)}
                >
                  Configure Keys in Settings →
                </button>
              )}
            </div>
            <button
              className={styles.errorDismiss}
              onClick={() => setError("")}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* 500-600 Word Description & Important Points Dossier */}
        {(isProcessing || summaryData) && (
          <Summary
            data={summaryData}
            isLoading={isProcessing}
            onAskTimestamp={handleAskTimestamp}
          />
        )}

        {/* Timestamp & Semantic RAG Q&A */}
        {summaryData && (
          <ChatBox
            videoUrl={currentUrl}
            videoId={summaryData.videoId}
            prefilledQuestion={chatPrefill}
          />
        )}
      </main>

      {/* ── Settings Drawer / Modal ── */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => refreshConfig()}
      />

      {/* ── Minimalist Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerTag}>
            <span className={styles.brandAccent}>VIDORA</span>
            <span className={styles.sep}>·</span>
            <span>Video Context &amp; Vector Intelligence</span>
          </div>
          <p className={styles.footerInfo}>
            ChromaDB Vector Cloud ({activeTenant}) · Gemini 1.5 Flash · text-embedding-004
          </p>
        </div>
      </footer>
    </div>
  );
}
