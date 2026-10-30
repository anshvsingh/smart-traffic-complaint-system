FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir --default-timeout=300 \
    --index-url https://download.pytorch.org/whl/cpu \
    torch torchvision

RUN pip install --no-cache-dir --default-timeout=300 \
    fastapi "uvicorn[standard]" python-multipart pillow

COPY models ./models
COPY src ./src

EXPOSE 8000

CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]
