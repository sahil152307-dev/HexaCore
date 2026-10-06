# ⚡ AlertBuzzer AI • Real-time Road Hazard & Risk Intelligence Dashboard

> **Cyberpunk / Enterprise AI Safety Telemetry Suite for Hackathons**  
> Powered by **AWS Rekognition**, **AWS Polly (Raveena Voice)**, **FastAPI**, **React**, **Tailwind CSS**, and **Leaflet Geospatial Maps**.

---

## 🚀 Quick Start Guide

### 1. Start the FastAPI Backend
```bash
# Activate your virtual environment
.venv\Scripts\activate

# Navigate to backend directory
cd backend

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Launch FastAPI Server on port 8000
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
Backend will be live at `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.

---

### 2. Start the React Frontend Dashboard
In a separate terminal window:
```bash
# Navigate to frontend directory
cd frontend

# Launch Vite Dev Server
npm run dev
```
Open `http://localhost:5173` in your browser to view the **AlertBuzzer AI** dashboard.

### Deploy with Vercel (frontend) and Render (backend)

1. Push this repository to GitHub after checking that no `.env` file, AWS key, admin password, or session secret is staged. The root `.gitignore` excludes local `.env` files; commit only the `.env.example` templates with placeholder values.
2. On Render, create a Python web service from this repository with root directory `backend`, build command `pip install -r requirements.txt`, and start command `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Add Render environment variables from `backend/.env.example`, replacing both admin placeholders with unique secrets. Set `ADMIN_COOKIE_SECURE=true` and `CORS_ALLOWED_ORIGINS` to the exact deployed Vercel origin (for example, `https://your-app.vercel.app`). Secure cookies use `SameSite=None` for the cross-origin Vercel-to-Render admin session. Add AWS credentials/region/bucket only in Render's environment settings, never GitHub.
4. On Vercel, import the same GitHub repository with root directory `frontend`, framework preset Vite, build command `npm run build`, and output directory `dist`. Add `VITE_API_BASE_URL` with the Render service's HTTPS URL, without a trailing slash, then deploy.
5. After deploy, verify the Vercel site reports the backend connected, submit a test campus report, and sign in to review it.

The default SQLite database and uploaded report photos live on the Render service filesystem. Ephemeral instances may lose them on restart/redeploy. If using a Render persistent disk mounted at `/var/data`, set `DATABASE_URL=sqlite:////var/data/hazard_logs.db` and `UPLOAD_DIRECTORY=/var/data/uploads`; otherwise move to managed persistent storage before relying on production data. Do not use real campus/student photos for a public demo without appropriate consent and access controls.

---

## 🌟 Key Architecture & Features

1. **Cyberpunk Tactical HUD UI/UX:**
   - Dark Slate-950 palette with glowing neon cyan (`#06b6d4`), amber (`#f59e0b`), and crimson rose (`#f43f5e`) threat indicators.
   - Dynamic scanline laser overlays, target reticles, and corner bracket styling.

2. **Optical Ingestion Zone & Webcam Capture:**
   - Drag & drop road hazard images (JPEG or PNG, up to 4 MB).
   - Live optical camera capture via WebRTC (`navigator.mediaDevices.getUserMedia`).
   - Selected images can be expanded or minimized in the analysis portal.

3. **Telemetry & Threat Analytics Panel:**
   - **Dynamic Risk Gauge:** Circular radial speedometer showing a rule-based hazard severity index (0–100), not a probability. Ambiguous road images are marked unconfirmed and sent for manual inspection instead of being presented as low risk.
   - **AWS Polly Raveena Voice Alert Player:** Interactive 32-bar Tron Waveform visualizer, auto-play support, live transcript teleprompter, and manual "Replay Raveena Voice Alert 🔊" button.
   - **AWS Rekognition Tag Cloud:** Segregates detected critical hazards from surrounding environmental features with confidence tags.

4. **Live Geospatial Hazard Map:**
   - Dark-styled Leaflet map using CartoDB Dark Matter tiles.
   - Places live hazard pins with pulsing danger radius circles and location coordinate readouts.

5. **API & Telemetry Inspector:**
   - Built-in modal to inspect raw AWS response JSON, curl terminal equivalents, latency pings, and architecture pipeline diagram.

6. **Campus facilities reports:**
   - Report classroom or building defects with required free-text building, department/program, room, issue details, and JPEG/PNG photo evidence (up to 4 MB); the responsible team may be left blank for an admin to assign.
   - Photos are stored under `backend/uploads` for this local prototype. Campus report history shows a photo-attached indicator; actual photo access is restricted to signed-in admins.
   - Reports are stored in the local database. The prototype does not diagnose facilities faults or automatically notify/route reports to staff.
   - The admin portal shows only Pending reports. A signed-in administrator must assign a responsible team and choose Approved or Rejected; a rejection also requires a reason. Reviewed reports leave the pending queue, while their final status remains visible in the campus reports list.

### Configure admin review access

Set a unique `ADMIN_PASSWORD` and a separate, randomly generated `ADMIN_SESSION_SECRET` in `backend/.env` (see `backend/.env.example`). For example, generate a session secret locally with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Never commit the real values. Restart the backend after changing them.

The admin API uses a signed, expiring (8-hour), HttpOnly, SameSite=Strict cookie; failed sign-ins are rate-limited in the backend process. Signing out, expiry, or changing the session secret invalidates a session. Local HTTP uses `ADMIN_COOKIE_SECURE=false`; set it to `true` behind HTTPS. `CORS_ALLOWED_ORIGINS` must list the exact frontend origin(s), comma-separated. This is prototype-grade access control; use a managed identity provider and durable audit trail before real institutional deployment.

### Hazard detection limitations

The backend uses Amazon Rekognition's general-purpose labels, with normalized names and a small set of road-hazard aliases. It requests up to 20 labels from 50% confidence and applies stricter, hazard-specific confidence thresholds. A generic Rekognition `Water` label alone is not enough to confirm a water hazard; the standard-label path requires a more specific standing-water/waterlogging label and road context. If road context is present but no supported hazard is confirmed, the API returns an uncertain result without a severity score and the UI asks the user to inspect it manually; it does not claim the road is safe. A displayed hazard score is a rule-based severity index, not a probability or calibrated safety estimate. People in the background no longer cause an otherwise relevant road image to be rejected; an image still needs road context or a supported hazard. This is not a trained pothole or road-defect detector: Rekognition may still miss damage or return false positives. Verify results during the demo, and use a model trained on labeled road imagery if dependable detection is required.

To use a deployed **Amazon Rekognition Custom Labels** road-damage model, set `REKOGNITION_CUSTOM_LABELS_MODEL_ARN` in the backend environment to its running ProjectVersion ARN. The model's class names must match the hazard aliases in `backend/hazard_detection.py` (for example `Pothole`, `Road Crack`, `Standing Water`, or `Flooded Road`). `REKOGNITION_CUSTOM_LABELS_MIN_CONFIDENCE` optionally sets its minimum inference confidence (default `50`). When the ARN is configured the API calls both `DetectLabels` (road/person context) and `DetectCustomLabels` (trained hazard classes), so each analysis incurs both Rekognition calls. Training and keeping the Custom Labels model running can incur additional AWS charges. Without the ARN, the app continues to use general-purpose labels only.

### Hackathon demo checks

- Use JPEG or PNG images up to 4 MB. This limit supports both general Rekognition and Custom Labels byte input.
- Custom Labels inference is optional. If the configured model is stopped or unavailable, analysis continues with general labels and returns a warning.
- Polly, S3 audio storage, and local history persistence are optional to the hazard result. If any of them fails, the API returns the risk result with a warning and no audio URL where appropriate.
- An uploaded image is never replaced by a mock result after a failed live analysis.
- Run `python -m unittest -v test_hazard_detection.py test_analysis_fallbacks.py test_admin_portal.py` from `backend` before the demo.
- Stop any running Rekognition Custom Labels model after use to avoid ongoing inference charges.
