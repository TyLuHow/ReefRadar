FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies for audio processing (AL2023 uses dnf)
RUN dnf install -y ffmpeg-free libsndfile && dnf clean all

# Copy and install Python requirements
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy handler
COPY handler.py .

CMD ["handler.handler"]
