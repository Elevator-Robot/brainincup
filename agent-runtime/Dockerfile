FROM public.ecr.aws/docker/library/python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    LOG_LEVEL=INFO

# Copy application code
COPY app/ ./app/
COPY app/requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Expose port if needed (optional, depends on protocol configuration)
# EXPOSE 8080

# Run the agent entrypoint
CMD ["python", "-m", "app.main"]
