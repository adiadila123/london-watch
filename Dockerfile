FROM python:3.11-slim

WORKDIR /app

COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PORT=5050
ENV AUTO_SEED=true
ENV AUTO_SEED_COUNT=60
ENV ENABLE_LIVE_SIMULATOR=true
ENV SIMULATOR_INTERVAL_SEC=20

EXPOSE 5050

CMD ["sh", "-c", "gunicorn --chdir server app:app --bind 0.0.0.0:${PORT:-5050}"]
