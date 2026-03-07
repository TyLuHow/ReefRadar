#!/bin/bash
# Start ReefRadar Dashboard

cd "$(dirname "$0")"

echo "Starting ReefRadar Dashboard..."
echo "API URL: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"
echo ""
echo "Dashboard will be available at http://localhost:8501"
echo ""

streamlit run app.py --server.port 8501 --server.address 0.0.0.0
