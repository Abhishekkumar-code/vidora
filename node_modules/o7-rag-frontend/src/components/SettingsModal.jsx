import React, { useState, useEffect } from "react";
import { getConfig, saveConfig, testChromaConnection, getStoredConfig } from "../api.js";
import styles from "./SettingsModal.module.css";

export default function SettingsModal({ isOpen, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    chromaHost: "https://api.trychroma.com",
    chromaTenant: "default_tenant",
    chromaDatabase: "default_database",
    chromaCollection: "vidora",
    chromaApiKey: "",
    googleApiKey: "",
  });

  const [showChromaKey, setShowChromaKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      setErrorMsg("");

      const stored = getStoredConfig();
      if (stored) {
        setFormData((prev) => ({ ...prev, ...stored }));
      }

      getConfig()
        .then((serverConf) => {
          setFormData((prev) => ({
            ...prev,
            chromaHost: serverConf.chromaHost || prev.chromaHost,
            chromaTenant: serverConf.chromaTenant || prev.chromaTenant,
            chromaDatabase: serverConf.chromaDatabase || prev.chromaDatabase,
            chromaCollection: serverConf.chromaCollection || prev.chromaCollection,
          }));
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setErrorMsg("");

    try {
      const res = await testChromaConnection({
        chromaHost: formData.chromaHost,
        chromaTenant: formData.chromaTenant,
        chromaDatabase: formData.chromaDatabase,
        chromaApiKey: formData.chromaApiKey,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        error:
          err.response?.data?.error ||
          err.message ||
          "Could not reach ChromaDB endpoint.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    try {
      await saveConfig(formData);
      if (onSaved) onSaved(formData);
      onClose();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.error || err.message || "Failed to save configuration."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.icon}>⚡</div>
            <div>
              <h2 className={styles.title}>VIDORA Engine Configuration</h2>
              <p className={styles.subtitle}>Set ChromaDB Vector Cloud and Gemini Credentials</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className={styles.body}>
          {/* Note */}
          <div className={styles.infoBanner}>
            <span>You can input your Chroma and Gemini keys now or update them at any time.</span>
          </div>

          {/* Chroma Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionBadge}>ChromaDB Vector Cloud</span>
              <span className={styles.sectionHint}>Remote Cloud Host (not localhost)</span>
            </div>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Chroma Tenant ID</label>
                <input
                  type="text"
                  name="chromaTenant"
                  placeholder="default_tenant"
                  value={formData.chromaTenant}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Chroma Database Name</label>
                <input
                  type="text"
                  name="chromaDatabase"
                  placeholder="default_database"
                  value={formData.chromaDatabase}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label}>Chroma API Key (Token)</label>
                <button
                  type="button"
                  className={styles.toggleVisibility}
                  onClick={() => setShowChromaKey(!showChromaKey)}
                >
                  {showChromaKey ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showChromaKey ? "text" : "password"}
                name="chromaApiKey"
                placeholder="ck-••••••••••••••••••••••••••••••••"
                value={formData.chromaApiKey}
                onChange={handleChange}
                className={styles.input}
                autoComplete="off"
              />
              <span className={styles.helpText}>
                Your Chroma Cloud API key or static authentication token
              </span>
            </div>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Chroma Host URL</label>
                <input
                  type="text"
                  name="chromaHost"
                  placeholder="https://api.trychroma.com"
                  value={formData.chromaHost}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Collection Name</label>
                <input
                  type="text"
                  name="chromaCollection"
                  placeholder="vidora"
                  value={formData.chromaCollection}
                  onChange={handleChange}
                  className={styles.input}
                  required
                />
              </div>
            </div>
          </div>

          {/* Gemini Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionBadge}>Google Gemini API Key</span>
              <span className={styles.sectionHint}>Powers Embeddings &amp; Video RAG</span>
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label className={styles.label}>Gemini API Key</label>
                <button
                  type="button"
                  className={styles.toggleVisibility}
                  onClick={() => setShowGoogleKey(!showGoogleKey)}
                >
                  {showGoogleKey ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showGoogleKey ? "text" : "password"}
                name="googleApiKey"
                placeholder="AIzaSy••••••••••••••••••••••••••••••"
                value={formData.googleApiKey}
                onChange={handleChange}
                className={styles.input}
                autoComplete="off"
              />
              <span className={styles.helpText}>
                Used to vectorize transcripts with text-embedding-004 and answer queries
              </span>
            </div>
          </div>

          {/* Test connection feedback */}
          {testResult && (
            <div
              className={`${styles.testBanner} ${
                testResult.success ? styles.testSuccess : styles.testFail
              }`}
            >
              <span className={styles.testIcon}>{testResult.success ? "✓" : "!"}</span>
              <div className={styles.testInfo}>
                <p className={styles.testTitle}>
                  {testResult.success ? "Connected to ChromaDB" : "Connection Diagnostic"}
                </p>
                <p className={styles.testMsg}>{testResult.message || testResult.error}</p>
              </div>
            </div>
          )}

          {errorMsg && <p className={styles.errorAlert}>{errorMsg}</p>}

          {/* Footer Actions */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.testBtn}
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? "Testing…" : "Test Chroma Connection"}
            </button>

            <div className={styles.btnGroup}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? "Saving…" : "Save Configuration"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
