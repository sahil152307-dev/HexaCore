const DEFAULT_PRODUCTION_API_URL = "https://hexacore-0iab.onrender.com";

export function normalizeBackendUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid backend URL, including http:// or https://.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Backend URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Do not include credentials in the backend URL.");
  }

  return url.origin;
}

const configuredBackendUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const defaultBackendUrl = import.meta.env.PROD
  ? DEFAULT_PRODUCTION_API_URL
  : `http://${window.location.hostname}:8000`;

export const API_BASE_URL = normalizeBackendUrl(configuredBackendUrl || defaultBackendUrl);
