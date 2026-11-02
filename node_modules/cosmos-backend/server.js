/**
 * server.js — VIDORA Video Intelligence & Context Engine
 * 
 * Endpoints:
 *  POST /api/process-video  → Extract timestamped transcript, ingest to ChromaDB, generate 500-600 word description
 *  POST /api/ask            → RAG-based Q&A with exact timestamp understanding
 *  GET  /api/config         → Get active Chroma & Gemini configuration
 *  POST /api/config         → Save runtime configuration
 *  POST /api/config/test    → Test live ChromaDB connection
 *  GET  /api/stats          → ChromaDB collection stats
 *  GET  /health             → Health check
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  extractVideoId,
  fetchTranscript,
  fetchVideoMetadata,
} from "./services/transcriptService.js";
import { RAGService } from "./services/ragService.js";

dotenv.config();

// ─── Initialise VIDORA RAG Service ─────────────────────────────────────────────
const ragService = new RAGService({
  chromaHost: process.env.CHROMA_HOST || "https://api.trychroma.com",
  chromaPort: process.env.CHROMA_PORT,
  chromaApiKey: process.env.CHROMA_API_KEY || "",
  chromaTenant: process.env.CHROMA_TENANT || "default_tenant",
  chromaDatabase: process.env.CHROMA_DATABASE || "default_database",
  chromaCollection: process.env.CHROMA_COLLECTION || "vidora",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
});

const videoMetadataCache = new Map();

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Health & Config ──────────────────────────────────────────────────────────

app.get(["/health", "/api/health"], (_req, res) => {
  res.json({
    status: "ok",
    app: "VIDORA",
    chromaHost: ragService.chromaHost,
    tenant: ragService.chromaTenant,
    database: ragService.chromaDatabase,
    collection: ragService.collectionName,
    hasChromaKey: Boolean(ragService.chromaApiKey),
    hasGoogleKey: Boolean(
      ragService.googleApiKey &&
        !ragService.googleApiKey.includes("your_google_gemini")
    ),
    model: "gemini-1.5-flash",
    embeddings: "text-embedding-004",
  });
});

app.get("/api/config", (_req, res) => {
  const mask = (str) =>
    str && str.length > 8
      ? `${str.slice(0, 4)}...${str.slice(-4)}`
      : str
      ? "••••••••"
      : "";

  res.json({
    chromaHost: ragService.chromaHost,
    chromaTenant: ragService.chromaTenant,
    chromaDatabase: ragService.chromaDatabase,
    chromaCollection: ragService.collectionName,
    chromaApiKeyMasked: mask(ragService.chromaApiKey),
    hasChromaApiKey: Boolean(ragService.chromaApiKey),
    googleApiKeyMasked: mask(ragService.googleApiKey),
    hasGoogleApiKey: Boolean(
      ragService.googleApiKey &&
        !ragService.googleApiKey.includes("your_google_gemini")
    ),
  });
});

app.post("/api/config", (req, res) => {
  const {
    chromaHost,
    chromaTenant,
    chromaDatabase,
    chromaCollection,
    chromaApiKey,
    googleApiKey,
  } = req.body;

  ragService.reconfigure({
    chromaHost: chromaHost ?? ragService.chromaHost,
    chromaTenant: chromaTenant ?? ragService.chromaTenant,
    chromaDatabase: chromaDatabase ?? ragService.chromaDatabase,
    chromaCollection: chromaCollection ?? ragService.collectionName,
    chromaApiKey: chromaApiKey !== undefined ? chromaApiKey : ragService.chromaApiKey,
    googleApiKey: googleApiKey !== undefined ? googleApiKey : ragService.googleApiKey,
  });

  res.json({
    success: true,
    message: "VIDORA configuration updated.",
    tenant: ragService.chromaTenant,
    database: ragService.chromaDatabase,
    collection: ragService.collectionName,
    chromaHost: ragService.chromaHost,
  });
});

app.post("/api/config/test", async (req, res) => {
  try {
    const { chromaHost, chromaTenant, chromaDatabase, chromaApiKey } = req.body;

    if (chromaHost || chromaTenant || chromaDatabase || chromaApiKey !== undefined) {
      ragService.reconfigure({
        chromaHost: chromaHost ?? ragService.chromaHost,
        chromaTenant: chromaTenant ?? ragService.chromaTenant,
        chromaDatabase: chromaDatabase ?? ragService.chromaDatabase,
        chromaApiKey: chromaApiKey ?? ragService.chromaApiKey,
      });
    }

    const result = await ragService.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/stats", async (_req, res) => {
  try {
    const stats = await ragService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Process Video & Ingest ───────────────────────────────────────────────────

/**
 * POST /api/process-video
 * Body: { video_url: string, config?: object }
 */
app.post("/api/process-video", async (req, res) => {
  const { video_url, config } = req.body;

  if (!video_url) {
    return res.status(400).json({ error: "video_url is required." });
  }

  if (config && typeof config === "object") {
    ragService.reconfigure(config);
  }

  try {
    const videoId = extractVideoId(video_url);

    console.log(`[VIDORA] Processing video ${videoId}…`);
    const [meta, transcriptData] = await Promise.all([
      fetchVideoMetadata(videoId),
      fetchTranscript(videoId),
    ]);

    const { segments, text: fullText, durationEstimate, totalSeconds } = transcriptData;
    const { title, author, thumbnailUrl } = meta;

    videoMetadataCache.set(videoId, { title, author, thumbnailUrl, durationEstimate });

    // Ingest into ChromaDB with timestamp metadata
    const alreadyStored = await ragService.videoExists(videoId);
    let chunksStored = 0;

    if (!alreadyStored) {
      console.log(`[VIDORA] Ingesting timestamped chunks to ChromaDB…`);
      chunksStored = await ragService.ingestVideo({
        videoId,
        title,
        author,
        segments,
        fullText,
      });
    } else {
      console.log(`[VIDORA] Video already indexed in ChromaDB.`);
    }

    // Generate 500-600 word comprehensive description + timestamped highlights
    console.log(`[VIDORA] Generating 500-600 word description and timestamp highlights…`);
    const dossier = await ragService.generateComprehensiveDossier({
      fullText,
      title,
      author,
      videoId,
      durationEstimate,
    });

    res.json({
      success: true,
      videoId,
      title,
      author,
      thumbnailUrl,
      durationEstimate,
      totalSeconds,
      description: dossier.description,
      importantPoints: dossier.importantPoints,
      timelineFlow: dossier.timelineFlow,
      keyTakeaways: dossier.keyTakeaways,
      chunksStored: alreadyStored ? "Already indexed" : chunksStored,
      transcriptLength: fullText.length,
      chroma: {
        tenant: ragService.chromaTenant,
        database: ragService.chromaDatabase,
        collection: ragService.collectionName,
      },
    });
  } catch (err) {
    console.error("[VIDORA] process-video error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Ask Video ────────────────────────────────────────────────────────────────

/**
 * POST /api/ask
 * Body: { video_url: string, question: string, config?: object }
 */
app.post("/api/ask", async (req, res) => {
  const { video_url, question, config } = req.body;

  if (!video_url || !question) {
    return res.status(400).json({ error: "video_url and question are required." });
  }

  if (config && typeof config === "object") {
    ragService.reconfigure(config);
  }

  try {
    const videoId = extractVideoId(video_url);
    const cachedMeta = videoMetadataCache.get(videoId);
    const title = cachedMeta ? cachedMeta.title : `YouTube Video (${videoId})`;

    console.log(`[VIDORA] Answering for ${videoId}: "${question}"`);
    const answer = await ragService.answer({ videoId, question, title });

    res.json({
      success: true,
      answer,
      videoId,
      title,
    });
  } catch (err) {
    console.error("[VIDORA] ask error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🎬  VIDORA — Video Intelligence & Context Engine         ║
║   Port         : ${PORT}                                      ║
║   Chroma Host  : ${ragService.chromaHost.padEnd(42)}║
║   Tenant       : ${ragService.chromaTenant.padEnd(42)}║
║   Database     : ${ragService.chromaDatabase.padEnd(42)}║
║   Collection   : ${ragService.collectionName.padEnd(42)}║
║   Model        : gemini-1.5-flash                          ║
║   Embeddings   : text-embedding-004                        ║
╚════════════════════════════════════════════════════════════╝
  `);
});
