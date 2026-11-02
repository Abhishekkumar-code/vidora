/**
 * transcriptService.js
 * YouTube video ID parsing, oEmbed metadata, and timestamped transcript extraction.
 */

import { YoutubeTranscript } from "youtube-transcript";
import axios from "axios";

/**
 * Format seconds into HH:MM:SS or MM:SS format.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTimestamp(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const sec = Math.floor(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Parse timestamp mentioned in user questions (e.g. "1.20hour", "1:20:00", "1 hour 20 minutes", "80 min").
 * @param {string} query
 * @returns {number|null} seconds from video start or null
 */
export function parseTimestampFromQuery(query) {
  if (!query) return null;
  const q = query.toLowerCase();

  // Pattern 1: HH:MM:SS (e.g. 01:20:00 or 1:20:00)
  const hmsMatch = q.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hmsMatch) {
    return parseInt(hmsMatch[1], 10) * 3600 + parseInt(hmsMatch[2], 10) * 60 + parseInt(hmsMatch[3], 10);
  }

  // Pattern 2: MM:SS (e.g. 15:30 or 80:00)
  const msMatch = q.match(/\b(\d{1,3}):(\d{2})\b/);
  if (msMatch) {
    return parseInt(msMatch[1], 10) * 60 + parseInt(msMatch[2], 10);
  }

  // Pattern 3: "1.20hour" or "1.20 hr" or "1.20h" (colloquially meaning 1h 20m)
  const dotHourMatch = q.match(/\b(\d{1,2})\.(\d{1,2})\s*(?:hours?|hrs?|h)\b/);
  if (dotHourMatch) {
    const hours = parseInt(dotHourMatch[1], 10);
    const mins = parseInt(dotHourMatch[2], 10);
    return hours * 3600 + mins * 60;
  }

  // Pattern 4: "X hours Y mins" or "X hr Y min"
  const comboMatch = q.match(/\b(\d+)\s*(?:hours?|hrs?|h)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b/);
  if (comboMatch) {
    return parseInt(comboMatch[1], 10) * 3600 + parseInt(comboMatch[2], 10) * 60;
  }

  // Pattern 5: "X hours" / "X hr"
  const hourOnly = q.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  if (hourOnly) {
    return Math.floor(parseFloat(hourOnly[1]) * 3600);
  }

  // Pattern 6: "Y minutes" / "Y mins" / "Y min"
  const minOnly = q.match(/\b(\d+)\s*(?:minutes?|mins?|min)\b/);
  if (minOnly) {
    return parseInt(minOnly[1], 10) * 60;
  }

  return null;
}

/**
 * Extract YouTube video ID from any standard URL format.
 * @param {string} url
 * @returns {string} videoId
 */
export function extractVideoId(url) {
  if (!url || typeof url !== "string") {
    throw new Error("Please provide a valid YouTube video URL.");
  }

  const cleanUrl = url.trim();

  // If already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }

  const patterns = [
    /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  throw new Error("Invalid YouTube URL. Please provide a valid video link.");
}

/**
 * Fetch video metadata (title, author, thumbnail) via YouTube oEmbed API.
 * @param {string} videoId
 */
export async function fetchVideoMetadata(videoId) {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  try {
    const response = await axios.get(oembedUrl, { timeout: 6000 });
    return {
      title: response.data.title || `YouTube Video (${videoId})`,
      author: response.data.author_name || "YouTube Creator",
      thumbnailUrl:
        response.data.thumbnail_url ||
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      title: `YouTube Video — ${videoId}`,
      author: "YouTube Creator",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

/**
 * Fetch transcript with individual segment timestamps.
 * @param {string} videoId
 */
export async function fetchTranscript(videoId) {
  let rawSegments = null;

  try {
    rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
  } catch (errEn) {
    try {
      rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (errFallback) {
      const errMsg = errFallback.message || errEn.message || "";
      if (
        errMsg.toLowerCase().includes("transcript is disabled") ||
        errMsg.toLowerCase().includes("no transcript") ||
        errMsg.toLowerCase().includes("captions")
      ) {
        throw new Error(
          "This YouTube video does not have available captions or transcripts. Please try a video with auto-generated or manual captions enabled."
        );
      }
      throw new Error(
        `Failed to fetch transcript: ${errMsg || "Video unavailable or restricted."}`
      );
    }
  }

  if (!rawSegments || rawSegments.length === 0) {
    throw new Error(
      "No captions found for this video. Please select a video with subtitles or captions."
    );
  }

  // Normalize segments: offset in seconds
  // youtube-transcript typically returns offset in ms or s; detect scale
  let isMillis = false;
  if (rawSegments.length > 1 && rawSegments[1].offset > 500) {
    isMillis = true;
  }

  const segments = rawSegments.map((seg) => {
    const rawOffset = Number(seg.offset) || 0;
    const startSec = isMillis ? rawOffset / 1000 : rawOffset;
    const rawDur = Number(seg.duration) || 0;
    const durSec = isMillis ? rawDur / 1000 : rawDur;
    const cleanText = seg.text
      .replace(/\[.*?\]/g, "")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

    return {
      text: cleanText,
      startSec,
      endSec: startSec + durSec,
      timestamp: formatTimestamp(startSec),
    };
  }).filter((s) => s.text.length > 0);

  // Calculate approximate duration
  const maxEndSec = segments.length > 0 ? segments[segments.length - 1].endSec : 0;
  const totalMinutes = Math.max(1, Math.round(maxEndSec / 60));
  const durationEstimate =
    totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
      : `${totalMinutes} min`;

  // Build full transcript with periodic timestamps for holistic context
  let fullTextWithTimestamps = "";
  let lastMarkedSec = -120; // mark every ~60-90 seconds

  for (const seg of segments) {
    if (seg.startSec - lastMarkedSec >= 75) {
      fullTextWithTimestamps += `\n[${seg.timestamp}] `;
      lastMarkedSec = seg.startSec;
    }
    fullTextWithTimestamps += `${seg.text} `;
  }

  return {
    videoId,
    segments,
    durationEstimate,
    totalSeconds: maxEndSec,
    text: fullTextWithTimestamps.trim(),
  };
}

/**
 * Split transcript into timestamp-bounded chunks for ChromaDB vector ingestion.
 * Each chunk tracks its start & end timestamp.
 * @param {Array} segments
 * @param {number} targetWordsPerChunk
 */
export function chunkTimestampedTranscript(segments, targetWordsPerChunk = 200, overlapWords = 30) {
  const chunks = [];
  if (!segments || segments.length === 0) return chunks;

  let currentChunkWords = [];
  let chunkStartSec = segments[0].startSec;
  let chunkEndSec = segments[0].endSec;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const words = seg.text.split(/\s+/).filter(Boolean);

    if (currentChunkWords.length === 0) {
      chunkStartSec = seg.startSec;
    }

    currentChunkWords.push(...words);
    chunkEndSec = seg.endSec;

    if (currentChunkWords.length >= targetWordsPerChunk || i === segments.length - 1) {
      const text = currentChunkWords.join(" ").trim();
      if (text.length > 20) {
        chunks.push({
          text,
          startSec: Math.round(chunkStartSec),
          endSec: Math.round(chunkEndSec),
          timestamp: formatTimestamp(chunkStartSec),
          timestampEnd: formatTimestamp(chunkEndSec),
        });
      }

      // Overlap by sliding back a few words
      const overlapSlice = currentChunkWords.slice(-overlapWords);
      currentChunkWords = [...overlapSlice];
      // Keep chunkStartSec around the start of the overlap segment
      chunkStartSec = seg.startSec;
    }
  }

  return chunks;
}
