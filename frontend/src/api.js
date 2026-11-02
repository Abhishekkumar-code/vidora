/**
 * api.js — Native Fetch Client for VIDORA
 * Pure browser-native fetch without external package dependency conflicts.
 */

const API_BASE = "/api";

export const getStoredConfig = () => {
  try {
    const raw = localStorage.getItem("vidora_config") || localStorage.getItem("cosmos_config");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setStoredConfig = (config) => {
  try {
    localStorage.setItem("vidora_config", JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
};

async function apiRequest(endpoint, { method = "GET", body, timeoutMs = 180000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}: Request failed.`);
      error.response = { data, status: response.status };
      throw error;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. For very long videos, processing may take longer.");
    }
    throw err;
  }
}

export const processVideo = (videoUrl, customConfig = null) => {
  const config = customConfig || getStoredConfig();
  return apiRequest("/process-video", {
    method: "POST",
    body: { video_url: videoUrl, config },
  });
};

export const askQuestion = (videoUrl, question, customConfig = null) => {
  const config = customConfig || getStoredConfig();
  return apiRequest("/ask", {
    method: "POST",
    body: { video_url: videoUrl, question, config },
  });
};

export const getConfig = () => apiRequest("/config");

export const saveConfig = (config) =>
  apiRequest("/config", {
    method: "POST",
    body: config,
  }).then((data) => {
    setStoredConfig(config);
    return data;
  });

export const testChromaConnection = (config) =>
  apiRequest("/config/test", {
    method: "POST",
    body: config,
  });

export const getStats = () => apiRequest("/stats");
