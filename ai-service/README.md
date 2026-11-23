# Sehhati — service IA (transcription)

Micro-service FastAPI utilisé quand `STT_PROVIDER=ai-service`.

## Démarrage

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Ou via Docker : `docker compose --profile ai up ai-service`.

## Modes

| `STT_MODE`        | Comportement                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `mock` (défaut)   | Transcription de démonstration (angine FR), aucun modèle requis.    |
| `faster-whisper`  | Transcription réelle (`WHISPER_MODEL`, `WHISPER_DEVICE`, `WHISPER_COMPUTE`). |

Variables : `WHISPER_MODEL=large-v3`, `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE=int8`.

## Contrat

`POST /transcribe` (multipart : `audio`, `language` optionnel) renvoie :

```json
{
  "language": "fr",
  "text": "…",
  "segments": [
    { "id": "s1", "start": 0, "end": 7, "speaker": "UNKNOWN", "text": "…", "confidence": 0.93 }
  ]
}
```

## Locuteurs

Sans modèle de diarization, les segments réels sont marqués `UNKNOWN`
(best effort, jamais devinés). Le médecin corrige les locuteurs depuis
l'écran de relecture (`PATCH /api/doctor/consultations/{id}/transcript`).

## Confidentialité

L'audio ne quitte jamais l'infrastructure du cabinet : ce service tourne
en local / sur le même réseau que l'application. Aucun nom ni identifiant
patient n'est transmis au service (uniquement l'audio).
