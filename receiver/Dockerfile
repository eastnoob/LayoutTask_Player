FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends rclone ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY app ./app

ENV PYTHONUNBUFFERED=1
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000
CMD ["python", "-m", "app.server"]
