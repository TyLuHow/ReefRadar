# Lambda container for SurfPerch ML inference
# Uses perch-hoplite for official Google bioacoustics model support

# Use AL2023 base for newer GCC (11.x) required by numpy 2.x
FROM public.ecr.aws/lambda/python:3.12

# Install system dependencies for audio processing and build tools
RUN dnf install -y \
    libsndfile \
    gcc \
    gcc-c++ \
    && dnf clean all

# Upgrade pip first
RUN pip install --upgrade pip

# Install Python dependencies
# Note: Using tensorflow-cpu to reduce image size (~1.5GB vs ~3GB with GPU)
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy inference code
COPY inference.py ${LAMBDA_TASK_ROOT}/

# Set the handler
CMD [ "inference.handler" ]
