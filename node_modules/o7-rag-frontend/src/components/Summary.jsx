import React, { useState } from "react";
import styles from "./Summary.module.css";

export default function Summary({ data, isLoading, onAskTimestamp }) {
  const [activeTab, setActiveTab] = useState("description");
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className={styles.card}>
        <div className={styles.loadingHeader}>
          <div className={styles.skeletonThumbnail} />
          <div className={styles.skeletonMeta}>
            <div className={styles.skeletonBadge} />
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonSub} />
          </div>
        </div>
        <div className={styles.skeletonLines}>
          {[100, 95, 90, 98, 85, 70].map((w, i) => (
            <div
              key={i}
              className={styles.skeletonLine}
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
        <div className={styles.loadingNote}>
          <span className={styles.spinnerSm} />
          <span>Vectorizing transcript with Gemini text-embedding-004 &amp; synthesizing 500-600 word deep description…</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    title,
    author,
    thumbnailUrl,
    videoId,
    durationEstimate,
    description,
    importantPoints,
    timelineFlow,
    keyTakeaways,
    chunksStored,
    transcriptLength,
    chroma,
  } = data;

  const wordCount = description ? description.split(/\s+/).filter(Boolean).length : 0;

  const handleCopy = () => {
    let textToCopy = "";
    if (activeTab === "description") {
      textToCopy = `VIDORA Comprehensive Description for "${title}":\n\n${description}`;
    } else if (activeTab === "points") {
      textToCopy = `Important Points & Timestamps for "${title}":\n\n${
        Array.isArray(importantPoints)
          ? importantPoints.map((p) => `• ${p.timestamp || ""} ${p.point}: ${p.details}`).join("\n\n")
          : importantPoints
      }`;
    } else if (activeTab === "takeaways") {
      textToCopy = `Key Takeaways from "${title}":\n\n${
        Array.isArray(keyTakeaways) ? keyTakeaways.map((t) => `• ${t}`).join("\n") : keyTakeaways
      }`;
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={styles.card} id="summary-card">
      {/* Video Header Card */}
      <div className={styles.header}>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={title}
            className={styles.thumbnail}
            loading="lazy"
          />
        )}
        <div className={styles.headerInfo}>
          <div className={styles.tagRow}>
            <span className={styles.ytTag}>YouTube</span>
            {durationEstimate && (
              <span className={styles.metaTag}>Duration: {durationEstimate}</span>
            )}
            <span className={styles.chromaTag}>
              ChromaDB · {chroma?.database || "default"} · {chunksStored} vectors
            </span>
            <span className={styles.metaTag}>
              {Math.round((transcriptLength || 0) / 1000)}k chars
            </span>
          </div>

          <h2 className={styles.title}>{title}</h2>
          <p className={styles.author}>{author || "YouTube Channel"}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabBar}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${activeTab === "description" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("description")}
          >
            <span>500-600 Word Description</span>
            <span className={styles.tabBadge}>{wordCount} words</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "points" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("points")}
          >
            <span>Important Points &amp; Timestamps</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "timeline" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("timeline")}
          >
            <span>Timeline Flow</span>
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "takeaways" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("takeaways")}
          >
            <span>Key Takeaways</span>
          </button>
        </div>

        <button className={styles.copyBtn} onClick={handleCopy}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {/* Tab Panes */}
      <div className={styles.contentPane}>
        {activeTab === "description" && (
          <div className={styles.descriptionSection}>
            {description.split("\n\n").map((para, i) => (
              <p key={i} className={styles.prose}>
                {para}
              </p>
            ))}
          </div>
        )}

        {activeTab === "points" && (
          <div className={styles.pointsList}>
            {Array.isArray(importantPoints) ? (
              importantPoints.map((item, idx) => (
                <div key={idx} className={styles.pointCard}>
                  <div className={styles.pointMeta}>
                    <button
                      className={styles.timestampBtn}
                      title="Ask what happens at this timestamp"
                      onClick={() =>
                        onAskTimestamp &&
                        onAskTimestamp(`What happens at ${item.timestamp}? What did the speaker say?`)
                      }
                    >
                      <span className={styles.playIcon}>▶</span>
                      <span>{item.timestamp || "[00:00:00]"}</span>
                    </button>
                  </div>
                  <div className={styles.pointBody}>
                    <h4 className={styles.pointTitle}>{item.point}</h4>
                    <p className={styles.pointDetails}>{item.details}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.prose}>{String(importantPoints)}</p>
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className={styles.timelineList}>
            {Array.isArray(timelineFlow) ? (
              timelineFlow.map((step, idx) => (
                <div key={idx} className={styles.timelineItem}>
                  <div className={styles.timelineStamp}>{step.timestamp || `Part ${idx + 1}`}</div>
                  <div className={styles.timelineContent}>
                    <h4 className={styles.timelinePhase}>{step.phase}</h4>
                    <p className={styles.timelineSummary}>{step.summary}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.prose}>Detailed timeline is synthesized in the main description.</p>
            )}
          </div>
        )}

        {activeTab === "takeaways" && (
          <div className={styles.takeawaysList}>
            {Array.isArray(keyTakeaways) ? (
              keyTakeaways.map((bullet, idx) => (
                <div key={idx} className={styles.takeawayItem}>
                  <span className={styles.takeawayIcon}>✦</span>
                  <p className={styles.takeawayText}>{bullet}</p>
                </div>
              ))
            ) : (
              <p className={styles.prose}>{String(keyTakeaways)}</p>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.statusDot} />
          <span>Vectorized in ChromaDB · Tenant: {chroma?.tenant || "default_tenant"}</span>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.ytLink}
        >
          Watch on YouTube ↗
        </a>
      </div>
    </div>
  );
}
