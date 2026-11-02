/**
 * ragService.js
 * VIDORA RAG Pipeline:
 *  - ChromaDB Cloud / Remote connection (Tenant, API Key, Database Name, Collection)
 *  - Google Gemini embeddings (text-embedding-004) & chat (gemini-1.5-flash)
 *  - 500-600 word comprehensive video descriptions + timestamped key highlights
 *  - Exact timestamp Q&A (e.g. "what happens at 1.20 hour" / "at 01:20:00")
 */

import { ChromaClient, CloudClient } from "chromadb";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  chunkTimestampedTranscript,
  formatTimestamp,
  parseTimestampFromQuery,
} from "./transcriptService.js";

const DEFAULT_COLLECTION = "vidora";
const EMBEDDING_MODEL = "text-embedding-004";
const CHAT_MODEL = "gemini-1.5-flash";

export class RAGService {
  constructor(config = {}) {
    this.memoryIndex = new Map();
    this.reconfigure(config);
  }

  /**
   * Reconfigure or update credentials (Chroma tenant, key, db, and Gemini key).
   */
  reconfigure({
    chromaHost = process.env.CHROMA_HOST || "https://api.trychroma.com",
    chromaPort = process.env.CHROMA_PORT,
    chromaApiKey = process.env.CHROMA_API_KEY,
    chromaTenant = process.env.CHROMA_TENANT || "default_tenant",
    chromaDatabase = process.env.CHROMA_DATABASE || "default_database",
    chromaCollection = process.env.CHROMA_COLLECTION || DEFAULT_COLLECTION,
    googleApiKey = process.env.GOOGLE_API_KEY,
  } = {}) {
    this.chromaHost = (chromaHost || "https://api.trychroma.com").trim();
    this.chromaPort = chromaPort;
    this.chromaApiKey = (chromaApiKey || "").trim();
    this.chromaTenant = (chromaTenant || "default_tenant").trim();
    this.chromaDatabase = (chromaDatabase || "default_database").trim();
    this.collectionName = (chromaCollection || DEFAULT_COLLECTION).trim();
    this.googleApiKey = (googleApiKey || "").trim();

    this.collection = null;
    this.chroma = this.createChromaClient();

    if (this.googleApiKey && !this.googleApiKey.includes("your_google_gemini")) {
      this.genAI = new GoogleGenerativeAI(this.googleApiKey);
      this.chatModel = this.genAI.getGenerativeModel({ model: CHAT_MODEL });
      this.embeddingModel = this.genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    } else {
      this.genAI = null;
      this.chatModel = null;
      this.embeddingModel = null;
    }
  }

  /**
   * Factory for Chroma Client (Chroma Cloud / Remote instance).
   */
  createChromaClient() {
    const isCloud =
      this.chromaHost.includes("trychroma.com") ||
      this.chromaHost.includes("api.trychroma.com");

    if (isCloud && this.chromaApiKey) {
      try {
        return new CloudClient({
          apiKey: this.chromaApiKey,
          tenant: this.chromaTenant,
          database: this.chromaDatabase,
          cloudHost: this.chromaHost.replace(/:\d+$/, ""),
        });
      } catch (err) {
        console.warn("[VIDORA Chroma] CloudClient fallback:", err.message);
      }
    }

    let basePath = this.chromaHost;
    if (!basePath.startsWith("http://") && !basePath.startsWith("https://")) {
      basePath = `https://${basePath}`;
    }

    const clientOptions = {
      path: basePath,
      tenant: this.chromaTenant,
      database: this.chromaDatabase,
    };

    if (this.chromaApiKey) {
      clientOptions.auth = {
        provider: "token",
        credentials: this.chromaApiKey,
        tokenHeaderType: "X_CHROMA_TOKEN",
      };
      clientOptions.headers = {
        "x-chroma-token": this.chromaApiKey,
        Authorization: `Bearer ${this.chromaApiKey}`,
      };
    }

    return new ChromaClient(clientOptions);
  }

  /**
   * Test ChromaDB connection and collection availability.
   */
  async testConnection() {
    try {
      const collections = await this.chroma.listCollections();
      return {
        success: true,
        host: this.chromaHost,
        tenant: this.chromaTenant,
        database: this.chromaDatabase,
        collectionsCount: Array.isArray(collections) ? collections.length : 0,
        message: "Successfully connected to ChromaDB Cloud / Remote database.",
      };
    } catch (err) {
      return {
        success: false,
        host: this.chromaHost,
        tenant: this.chromaTenant,
        database: this.chromaDatabase,
        error: err.message || "Failed to connect to ChromaDB.",
      };
    }
  }

  /**
   * Get or create the Chroma collection.
   */
  async getCollection() {
    if (this.collection) return this.collection;

    try {
      this.collection = await this.chroma.getOrCreateCollection({
        name: this.collectionName,
        metadata: {
          description: "VIDORA — Video Intelligence Vector Database",
          tenant: this.chromaTenant,
          database: this.chromaDatabase,
          "hnsw:space": "cosine",
        },
      });
      return this.collection;
    } catch (err) {
      console.warn(`[VIDORA Chroma] Remote collection warning: ${err.message}.`);
      return null;
    }
  }

  /**
   * Ensure Gemini client is available.
   */
  ensureGemini() {
    if (!this.chatModel || !this.embeddingModel) {
      throw new Error(
        "Google Gemini API Key is required for video embedding & AI analysis. Please set your Gemini key in the VIDORA Settings or backend/.env"
      );
    }
  }

  /**
   * Embed document chunk.
   */
  async embedText(text) {
    this.ensureGemini();
    try {
      const result = await this.embeddingModel.embedContent({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
      });
      return result.embedding.values;
    } catch {
      const result = await this.embeddingModel.embedContent(text);
      return result.embedding.values;
    }
  }

  /**
   * Embed search query.
   */
  async embedQuery(text) {
    this.ensureGemini();
    try {
      const result = await this.embeddingModel.embedContent({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
      });
      return result.embedding.values;
    } catch {
      const result = await this.embeddingModel.embedContent(text);
      return result.embedding.values;
    }
  }

  /**
   * Check if a video has already been ingested.
   */
  async videoExists(videoId) {
    if (this.memoryIndex.has(videoId)) return true;
    try {
      const col = await this.getCollection();
      if (!col) return false;
      const results = await col.get({
        where: { videoId },
        limit: 1,
      });
      return results && results.ids && results.ids.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Ingest timestamped video chunks and vector embeddings into ChromaDB.
   */
  async ingestVideo({ videoId, title, author, segments, fullText }) {
    this.ensureGemini();

    const chunks = chunkTimestampedTranscript(segments, 180, 25);
    console.log(`[VIDORA] Ingesting ${chunks.length} timestamped chunks for video ${videoId}…`);

    const col = await this.getCollection();
    const storedRecords = [];
    const BATCH_SIZE = 8;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const embeddings = await Promise.all(
        batch.map((c) =>
          this.embedText(`[${c.timestamp} - ${c.timestampEnd}] ${c.text}`)
        )
      );

      const ids = batch.map((_, j) => `${videoId}_c_${i + j}`);
      const documents = batch.map(
        (c) => `[${c.timestamp}] ${c.text}`
      );
      const metadatas = batch.map((c, j) => ({
        videoId,
        title: title || "Video",
        author: author || "Creator",
        startSec: c.startSec,
        endSec: c.endSec,
        timestamp: c.timestamp,
        timestampEnd: c.timestampEnd,
        chunkIndex: i + j,
      }));

      // Store in ChromaDB
      if (col) {
        try {
          await col.add({
            ids,
            embeddings,
            documents,
            metadatas,
          });
        } catch (chromaErr) {
          console.warn("[VIDORA Chroma add notice]:", chromaErr.message);
        }
      }

      for (let k = 0; k < batch.length; k++) {
        storedRecords.push({
          id: ids[k],
          text: documents[k],
          startSec: batch[k].startSec,
          endSec: batch[k].endSec,
          timestamp: batch[k].timestamp,
          timestampEnd: batch[k].timestampEnd,
          embedding: embeddings[k],
          metadata: metadatas[k],
        });
      }

      if (i + BATCH_SIZE < chunks.length) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    this.memoryIndex.set(videoId, {
      title,
      author,
      fullText,
      segments,
      chunks: storedRecords,
    });

    console.log(`[VIDORA] Successfully stored ${chunks.length} timestamped chunks.`);
    return chunks.length;
  }

  /**
   * Retrieve relevant chunks from ChromaDB and timestamp indices.
   */
  async retrieve(videoId, question, topK = 6) {
    const targetTimestampSec = parseTimestampFromQuery(question);
    const timeRelevantChunks = [];

    // 1. If user asked about a specific time (e.g. "what happened at 1.20hour"):
    const cached = this.memoryIndex.get(videoId);
    if (targetTimestampSec !== null && cached && cached.chunks) {
      // Find chunks covering or nearest to targetTimestampSec (+/- 120 seconds)
      const nearby = cached.chunks
        .map((c) => ({
          ...c,
          dist: Math.min(
            Math.abs(c.startSec - targetTimestampSec),
            Math.abs(c.endSec - targetTimestampSec)
          ),
        }))
        .filter((c) => c.dist <= 240) // within 4 minutes window
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4);

      for (const n of nearby) {
        timeRelevantChunks.push(
          `[TARGET TIMESTAMP MATCH: ~${formatTimestamp(targetTimestampSec)}]\n${n.text}`
        );
      }
    }

    // 2. Perform vector semantic search
    let semanticDocs = [];
    try {
      const queryEmbedding = await this.embedQuery(question);
      const col = await this.getCollection();
      if (col) {
        const results = await col.query({
          queryEmbeddings: [queryEmbedding],
          nResults: topK,
          where: { videoId },
        });
        const docs = results.documents?.[0] ?? [];
        semanticDocs = docs.filter(Boolean);
      } else if (cached && cached.chunks) {
        // Fallback: cosine similarity in memory
        const cosineSim = (a, b) => {
          let dot = 0, nA = 0, nB = 0;
          for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            nA += a[i] * a[i];
            nB += b[i] * b[i];
          }
          return dot / (Math.sqrt(nA) * Math.sqrt(nB) || 1);
        };

        const scored = cached.chunks.map((item) => ({
          text: item.text,
          score: cosineSim(queryEmbedding, item.embedding),
        }));
        scored.sort((a, b) => b.score - a.score);
        semanticDocs = scored.slice(0, topK).map((s) => s.text);
      }
    } catch (err) {
      console.warn("[VIDORA retrieval error]:", err.message);
    }

    return [...timeRelevantChunks, ...semanticDocs];
  }

  /**
   * Generate 500-600 word comprehensive description + timestamped important points.
   */
  async generateComprehensiveDossier({ fullText, title, author, videoId, durationEstimate }) {
    this.ensureGemini();

    // Sample across the video (beginning, middle, and end) to cover even 2+ hour videos
    let transcriptSample = fullText;
    if (fullText.length > 30000) {
      const part1 = fullText.slice(0, 12000);
      const mid = Math.floor(fullText.length / 2);
      const part2 = fullText.slice(mid - 6000, mid + 6000);
      const part3 = fullText.slice(-10000);
      transcriptSample = `${part1}\n\n[...]\n\n${part2}\n\n[...]\n\n${part3}`;
    }

    const prompt = `You are VIDORA, an advanced AI video intelligence engine.
Analyze the provided YouTube video transcript and produce a detailed, high-accuracy analysis dossier in valid JSON format.

Video Title: "${title || "YouTube Video"}"
Creator: "${author || "Unknown"}"
Duration: ${durationEstimate || "Full Video"}

Transcript excerpts with timestamps:
${transcriptSample}

Requirements:
1. "description": A thorough, highly detailed 500 to 600 word comprehensive description of the video.
   - Explain the core thesis, background context, chronological narrative arc, major arguments, demonstrations, and overarching conclusions.
   - Ensure it is between 500 and 600 words of substantive, high-value prose.
2. "importantPoints": An array of 6 to 10 key important points and pivotal moments covered in the video. For each point:
   - "point": Specific topic or key takeaway title
   - "timestamp": The approximate timestamp when this is discussed (e.g. "[00:14:20]" or "[01:20:00]")
   - "details": 2-3 sentences explaining what was said, the evidence or narrative presented, and its significance.
3. "timelineFlow": A chronological breakdown of the video's phases (e.g. Intro, Part 1, Part 2, Climax, Conclusion) with timestamps and summary.
4. "keyTakeaways": An array of 5 actionable takeaways or insights.

Return ONLY a raw JSON object with keys: "description", "importantPoints", "timelineFlow", "keyTakeaways". No markdown wrapping or extra comments.`;

    const response = await this.chatModel.generateContent(prompt);
    const rawText = response.response.text().trim();

    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        description: rawText.slice(0, 3500),
        importantPoints: [
          {
            point: "Key Video Content & Narrative",
            timestamp: "[00:00:00]",
            details: "Comprehensive overview of the video's primary subject matter and discussions.",
          },
        ],
        timelineFlow: [
          { phase: "Full Discussion", timestamp: "[00:00:00]", summary: "Video topics and analysis." },
        ],
        keyTakeaways: [
          "In-depth analysis provided across all sections.",
          "Indexed into ChromaDB with timestamp precision.",
        ],
      };
    }
  }

  /**
   * RAG-based answer generation with timestamp awareness (e.g. "what happens at 1.20 hour").
   */
  async answer({ videoId, question, title }) {
    this.ensureGemini();

    const targetSec = parseTimestampFromQuery(question);
    const chunks = await this.retrieve(videoId, question, 8);

    if (chunks.length === 0) {
      return "I could not locate transcript context for this video. Please make sure the video has been processed and transcribed.";
    }

    const context = chunks.join("\n\n---\n\n");
    const timestampGuidance = targetSec !== null
      ? `NOTE: The user is specifically asking about timestamp ~${formatTimestamp(targetSec)}. Prioritize the excerpts around this timestamp and clearly tell the user what was happening and what the speaker said at that moment.`
      : "";

    const systemPrompt = `You are VIDORA, a precise and intelligent AI video companion.
You are answering questions about the video "${title || "YouTube Video"}".

${timestampGuidance}

Relevant transcript excerpts with timestamps:
${context}

User Question: "${question}"

Instructions:
- Provide an accurate, helpful, and insightful answer based strictly on the transcript excerpts above.
- If the user asks what happens at a specific time (e.g. 1.20 hour / 1:20:00), identify the exact timestamp and describe what was said and shown.
- If the user asks for important topics or a summary, format with clear bold headings, bullet points, and timestamp citations (e.g. [01:20:15]).
- If a detail wasn't mentioned in the video, say "This detail was not covered in the video transcript."
- Format your response using clean GitHub Markdown.`;

    const result = await this.chatModel.generateContent(systemPrompt);
    return result.response.text().trim();
  }

  /**
   * Get Chroma collection stats.
   */
  async getStats() {
    try {
      const col = await this.getCollection();
      const count = col ? await col.count() : 0;
      return {
        app: "VIDORA",
        collection: this.collectionName,
        tenant: this.chromaTenant,
        database: this.chromaDatabase,
        host: this.chromaHost,
        totalChunks: count,
        embeddingModel: EMBEDDING_MODEL,
        chatModel: CHAT_MODEL,
      };
    } catch (err) {
      return {
        app: "VIDORA",
        collection: this.collectionName,
        tenant: this.chromaTenant,
        database: this.chromaDatabase,
        host: this.chromaHost,
        totalChunks: 0,
        status: "offline",
        error: err.message,
      };
    }
  }
}
