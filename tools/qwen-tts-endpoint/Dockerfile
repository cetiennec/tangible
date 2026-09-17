# Qwen3-TTS served behind Tangible's voice-endpoint contract.
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/data/huggingface \
    PORT=7860

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 ffmpeg git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY speakers ./speakers

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
