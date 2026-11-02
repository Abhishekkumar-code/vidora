import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { askQuestion } from "../api.js";
import styles from "./ChatBox.module.css";

const QUICK_PROMPTS = [
  "What happens at 1.20 hour in this video and what did the speaker say?",
  "What are the most important points and arguments discussed?",
  "Summarize what occurs in the first 20 minutes",
  "Explain the core technical concepts mentioned in simple terms",
];

function Message({ role, text, isTyping }) {
  const [copied, setCopied] = useState(false);

  const copyText = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={`${styles.message} ${styles[role]}`}>
      <div className={styles.avatar}>
        {role === "user" ? (
          <span className={styles.userGlyph}>👤</span>
        ) : (
          <span className={styles.aiGlyph}>⚡</span>
        )}
      </div>

      <div className={styles.bubble}>
        {isTyping ? (
          <div className={styles.typingIndicator}>
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className={styles.markdownContent}>
            {role === "ai" ? (
              <ReactMarkdown>{text}</ReactMarkdown>
            ) : (
              <p>{text}</p>
            )}
          </div>
        )}

        {!isTyping && text && (
          <button className={styles.msgCopy} onClick={copyText} title="Copy message">
            {copied ? "✓" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChatBox({ videoUrl, videoId, prefilledQuestion }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Handle external prefilled questions (e.g. clicking timestamps in summary)
  useEffect(() => {
    if (prefilledQuestion) {
      handleSend(prefilledQuestion);
    }
  }, [prefilledQuestion]);

  const handleSend = async (questionText) => {
    const q = (questionText || input).trim();
    if (!q || isLoading) return;

    setInput("");
    const userMsg = { role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Typing placeholder
    setMessages((prev) => [
      ...prev,
      { role: "ai", text: "", isTyping: true, id: "typing" },
    ]);

    try {
      const res = await askQuestion(videoUrl, q);
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== "typing")
          .concat({ role: "ai", text: res.answer })
      );
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.message ||
        "Could not generate an answer. Please verify your connection or API key.";
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== "typing")
          .concat({
            role: "ai",
            text: `⚠️ **Notice**: ${errorMsg}`,
          })
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container} id="chat-section">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>⚡</div>
          <div>
            <h3 className={styles.headerTitle}>Ask VIDORA (Timestamp &amp; Semantic RAG)</h3>
            <p className={styles.headerSub}>Ask what happened at any hour or minute (e.g. 1.20hour)</p>
          </div>
        </div>

        <div className={styles.headerRight}>
          {messages.length > 0 && (
            <button
              className={styles.clearBtn}
              onClick={() => setMessages([])}
              title="Clear chat"
            >
              Clear
            </button>
          )}
          <span className={styles.statusPill}>
            <span className={styles.statusDot} />
            Chroma Ready
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>💬</div>
            <h4 className={styles.emptyTitle}>Ask Anything About This Video</h4>
            <p className={styles.emptySub}>
              Query exact moments, speaker quotes, or overarching themes across the entire runtime.
            </p>

            <div className={styles.promptsGrid}>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className={styles.promptBtn}
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                >
                  <span className={styles.promptArrow}>→</span>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message
            key={i}
            role={msg.role}
            text={msg.text}
            isTyping={msg.isTyping}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <textarea
            ref={inputRef}
            className={styles.textarea}
            placeholder="Ask what happened in 1.20hour, key topics, or what the speaker said..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            aria-label="Send query"
          >
            {isLoading ? (
              <span className={styles.spinner} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <div className={styles.hintRow}>
          <span>Enter to send · Shift+Enter for new line</span>
          <span>ChromaDB Vector Retrieval + Exact Timestamp Matching</span>
        </div>
      </div>
    </div>
  );
}
