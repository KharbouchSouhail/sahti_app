"""Service de transcription Sehhati (STT).

- `STT_MODE=mock` (défaut) : renvoie une transcription de démonstration, sans modèle.
- `STT_MODE=faster-whisper` : transcription réelle via faster-whisper (CPU/GPU).

L'attribution des locuteurs est « best effort » : sans modèle de diarization,
les segments sont marqués UNKNOWN (jamais devinés). Le médecin peut corriger
les locuteurs depuis l'écran de relecture (PATCH /transcript).

Endpoints :
  GET  /health      → état du service
  POST /transcribe  → multipart: audio (fichier), language (optionnel)
"""

import os
import tempfile
import time
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

STT_MODE = os.environ.get("STT_MODE", "mock")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")

app = FastAPI(title="Sehhati AI service", version="1.0.0")

_model = None


def demo_segments():
    texts = [
        ("PATIENT", "Bonjour docteur, j'ai mal à la gorge depuis trois jours et j'ai un peu de fièvre."),
        ("DOCTOR", "Bonjour, je vous écoute. Pas de toux sèche ?"),
        ("PATIENT", "Non, pas de toux. J'ai pris de l'Ibuprofène hier soir, ça n'a rien changé."),
        ("DOCTOR", "D'accord. À l'examen, la température est à 38,2 degrés et les amygdales sont rouges avec un exsudat."),
        ("DOCTOR", "Le diagnostic est une angine aiguë probablement bactérienne."),
        ("DOCTOR", "Je vous prescris de l'Amoxicilline 1 g, un comprimé deux fois par jour pendant six jours."),
        ("DOCTOR", "Prenez aussi du Paracétamol 1 g, un comprimé trois fois par jour si fièvre, pendant cinq jours."),
        ("DOCTOR", "En recommandations, buvez beaucoup d'eau, reposez-vous et consultez si la fièvre persiste après trois jours."),
        ("DOCTOR", "Revoyez-moi dans une semaine si ça ne s'améliore pas."),
    ]
    segments = []
    start = 0.0
    for index, (speaker, text) in enumerate(texts, start=1):
        duration = max(4.0, len(text) / 14.0)
        segments.append(
            {
                "id": f"s{index}",
                "start": round(start, 2),
                "end": round(start + duration, 2),
                "speaker": speaker,
                "text": text,
                "confidence": 0.93,
            }
        )
        start += duration
    return segments


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
    return _model


@app.get("/health")
def health():
    return {"status": "ok", "mode": STT_MODE, "model": WHISPER_MODEL if STT_MODE != "mock" else None}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: Optional[str] = Form(None)):
    started = time.time()
    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        if STT_MODE == "mock":
            segments = demo_segments()
            return {
                "language": "fr",
                "text": " ".join(segment["text"] for segment in segments),
                "segments": segments,
                "processingMs": int((time.time() - started) * 1000),
            }

        model = get_model()
        whisper_segments, info = model.transcribe(
            tmp_path,
            language=language or None,
            vad_filter=True,
            beam_size=5,
        )
        segments = []
        for index, segment in enumerate(whisper_segments, start=1):
            text = segment.text.strip()
            if not text:
                continue
            segments.append(
                {
                    "id": f"s{index}",
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    # Pas de diarization : locuteur inconnu, jamais deviné.
                    "speaker": "UNKNOWN",
                    "text": text,
                    "confidence": round(getattr(segment, "avg_logprob", 0.0), 3),
                }
            )
        return {
            "language": info.language,
            "text": " ".join(segment["text"] for segment in segments),
            "segments": segments,
            "processingMs": int((time.time() - started) * 1000),
        }
    except Exception as error:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(error)})
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
