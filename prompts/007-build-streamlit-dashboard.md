<objective>
Build a Streamlit web dashboard for the ReefRadar API that provides:
- Audio file upload interface
- Real-time analysis progress tracking
- Visual classification results with confidence scores
- Reference site exploration
- Embedding visualization

This creates a user-friendly interface for marine biologists who may not be comfortable using APIs directly.
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Phase: 7 of 8

Dashboard Features:
1. Upload & Analyze tab - File upload, audio playback, analysis trigger
2. Results tab - Classification display, probability charts, similar sites
3. Reference Sites tab - Site explorer with filtering

Tech Stack:
- Streamlit 1.28+
- Plotly for visualizations
- Pandas for data handling
- Requests for API calls

Deployment Options:
- Hugging Face Spaces (free, recommended for demo)
- AWS App Runner
- Local development
</context>

<prerequisites>
Before starting:
1. Source AWS environment: `source ~/.reefradar-env`
2. API_URL environment variable set from Phase 6
3. Python 3.11+ installed
4. pip install streamlit plotly pandas requests
</prerequisites>

<implementation>

**Step 1: Create Streamlit Project Structure**
```bash
mkdir -p ~/reef-project/streamlit
cd ~/reef-project/streamlit
```

**Step 2: Create Main Application**

Create `~/reef-project/streamlit/app.py`:
```python
"""
ReefRadar - Coral Reef Health Analysis Dashboard
A simple interface for uploading reef audio and viewing analysis results.
"""

import streamlit as st
import requests
import json
import time
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import os

# Configuration - get from environment or secrets
API_URL = os.environ.get('API_URL') or st.secrets.get("API_URL", "")

st.set_page_config(
    page_title="ReefRadar - Coral Reef Health Analyzer",
    page_icon="🪸",
    layout="wide"
)

# Custom CSS for ocean theme
st.markdown("""
<style>
    .stApp {
        background: linear-gradient(135deg, #0c1829 0%, #1a3a5c 100%);
    }
    .main-header {
        color: #4dd0e1;
        text-align: center;
        padding: 20px;
    }
    .result-card {
        background: rgba(255,255,255,0.05);
        border-radius: 10px;
        padding: 20px;
        margin: 10px 0;
        border: 1px solid rgba(77, 208, 225, 0.3);
    }
    .healthy { color: #81c784; font-weight: bold; }
    .degraded { color: #e57373; font-weight: bold; }
    .restored { color: #ffb74d; font-weight: bold; }
    .metric-value { font-size: 2.5em; font-weight: bold; }
    .stProgress > div > div { background-color: #4dd0e1; }
</style>
""", unsafe_allow_html=True)


def main():
    st.markdown("<h1 class='main-header'>🪸 ReefRadar</h1>", unsafe_allow_html=True)
    st.markdown("""
    <p style='text-align: center; color: #80cbc4; font-size: 1.2em;'>
    Analyze coral reef health from underwater acoustic recordings using AI
    </p>
    """, unsafe_allow_html=True)

    # Check API configuration
    if not API_URL:
        st.error("⚠️ API URL not configured. Set the API_URL environment variable or add it to .streamlit/secrets.toml")
        st.code("export API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com")
        return

    # Sidebar
    with st.sidebar:
        st.header("About ReefRadar")
        st.markdown("""
        This tool uses **SurfPerch**, a neural network trained by
        Google DeepMind and UCL researchers, to analyze coral reef soundscapes.

        **How it works:**
        1. 📤 Upload a WAV file of reef audio
        2. 🔊 Audio is processed into 1.88s segments
        3. 🧠 SurfPerch extracts acoustic features
        4. 📊 AI classifies reef health status

        **Supported formats:** WAV, MP3, FLAC (max 50MB)
        """)

        st.divider()

        st.header("Reference Sites")
        st.markdown("""
        Analysis compares your audio against reference recordings from:
        - 🇮🇩 Indonesia
        - 🇦🇺 Australia
        - 🇰🇪 Kenya
        - 🇲🇽 Mexico
        - 🇲🇻 Maldives
        """)

        st.divider()
        st.caption(f"API: {API_URL[:50]}...")

    # Main tabs
    tab1, tab2, tab3 = st.tabs(["📤 Upload & Analyze", "📊 Results", "🗺️ Reference Sites"])

    with tab1:
        upload_and_analyze_tab()

    with tab2:
        results_tab()

    with tab3:
        reference_sites_tab()


def upload_and_analyze_tab():
    """Handle file upload and analysis."""
    st.header("Upload Reef Audio")

    uploaded_file = st.file_uploader(
        "Choose an audio file",
        type=['wav', 'mp3', 'flac'],
        help="Upload underwater reef recordings. Best results with 1+ minute of audio at 16kHz."
    )

    if uploaded_file is not None:
        # Audio preview
        st.audio(uploaded_file, format='audio/wav')

        # File info
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Filename", uploaded_file.name[:20] + "..." if len(uploaded_file.name) > 20 else uploaded_file.name)
        with col2:
            size_kb = uploaded_file.size / 1024
            size_str = f"{size_kb:.1f} KB" if size_kb < 1024 else f"{size_kb/1024:.1f} MB"
            st.metric("Size", size_str)
        with col3:
            st.metric("Type", uploaded_file.type or "audio/wav")

        # Analyze button
        if st.button("🔬 Analyze Recording", type="primary", use_container_width=True):
            with st.spinner("Uploading audio file..."):
                upload_response = upload_file(uploaded_file)

                if 'error' in upload_response:
                    st.error(f"Upload failed: {upload_response['error'].get('message', 'Unknown error')}")
                    return

                upload_id = upload_response.get('upload_id')
                st.success(f"✅ Uploaded successfully! ID: `{upload_id}`")

            with st.spinner("Analyzing audio... This may take 30-60 seconds."):
                analyze_response = start_analysis(upload_id)

                if 'error' in analyze_response:
                    st.error(f"Analysis failed: {analyze_response['error'].get('message', 'Unknown error')}")
                    return

                analysis_id = analyze_response.get('analysis_id')
                st.info(f"Analysis started. ID: `{analysis_id}`")

                # Poll for results
                result = poll_for_results(analysis_id)

                if result and result.get('status') == 'complete':
                    st.session_state['latest_result'] = result
                    st.success("✅ Analysis complete! Switch to the Results tab to see details.")
                    display_quick_result(result)
                elif result and result.get('status') == 'failed':
                    st.error(f"Analysis failed: {result.get('error', 'Unknown error')}")
                else:
                    st.warning("Analysis is taking longer than expected. Try checking the Results tab in a few minutes.")


def results_tab():
    """Display analysis results."""
    st.header("Analysis Results")

    if 'latest_result' not in st.session_state:
        st.info("👆 No analysis results yet. Upload a file in the Upload tab to get started.")
        return

    result = st.session_state['latest_result']
    classification = result.get('classification', {})

    # Main metrics
    col1, col2, col3 = st.columns(3)

    with col1:
        label = classification.get('label', 'unknown')
        color_class = 'healthy' if 'healthy' in label else ('degraded' if 'degraded' in label else 'restored')
        st.markdown(f"""
        <div class='result-card'>
            <h4 style='color: #80cbc4;'>Classification</h4>
            <p class='metric-value {color_class}'>{label.replace('_', ' ').title()}</p>
        </div>
        """, unsafe_allow_html=True)

    with col2:
        confidence = classification.get('confidence', 0)
        st.markdown(f"""
        <div class='result-card'>
            <h4 style='color: #80cbc4;'>Confidence</h4>
            <p class='metric-value' style='color: #4dd0e1;'>{confidence:.0%}</p>
        </div>
        """, unsafe_allow_html=True)

    with col3:
        num_segments = result.get('embedding_summary', {}).get('num_segments', 0)
        st.markdown(f"""
        <div class='result-card'>
            <h4 style='color: #80cbc4;'>Audio Segments</h4>
            <p class='metric-value' style='color: #4dd0e1;'>{num_segments}</p>
        </div>
        """, unsafe_allow_html=True)

    st.divider()

    # Probability chart
    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("Classification Probabilities")
        probs = classification.get('probabilities', {})
        if probs:
            df = pd.DataFrame({
                'Category': [k.replace('_', ' ').title() for k in probs.keys()],
                'Probability': list(probs.values())
            })

            colors = ['#81c784' if 'Healthy' in cat else '#e57373' if 'Degraded' in cat else '#ffb74d'
                     for cat in df['Category']]

            fig = go.Figure(data=[
                go.Bar(x=df['Category'], y=df['Probability'], marker_color=colors)
            ])
            fig.update_layout(
                plot_bgcolor='rgba(0,0,0,0)',
                paper_bgcolor='rgba(0,0,0,0)',
                font_color='#e0f4ff',
                yaxis_title='Probability',
                yaxis_range=[0, 1]
            )
            st.plotly_chart(fig, use_container_width=True)

    with col2:
        st.subheader("Similar Reference Sites")
        similar_sites = result.get('similar_sites', [])
        if similar_sites:
            for site in similar_sites:
                status_color = '#81c784' if site['status'] == 'healthy' else '#e57373' if site['status'] == 'degraded' else '#ffb74d'
                st.markdown(f"""
                <div style='background: rgba(255,255,255,0.05); padding: 10px; border-radius: 5px; margin: 5px 0;'>
                    <strong>{site['site_id']}</strong><br>
                    <span style='color: #80cbc4;'>{site['country']}</span><br>
                    <span style='color: {status_color};'>{site['status'].replace('_', ' ').title()}</span><br>
                    Similarity: <strong>{site['similarity']:.0%}</strong>
                </div>
                """, unsafe_allow_html=True)

    # Caveats
    st.divider()
    caveats = result.get('caveats', '')
    if caveats:
        st.caption(f"⚠️ {caveats}")


def reference_sites_tab():
    """Display reference site information."""
    st.header("Reference Sites")

    # Fetch sites from API
    try:
        response = requests.get(f"{API_URL}/sites", timeout=10)
        data = response.json()
        sites = data.get('sites', [])
    except Exception as e:
        st.error(f"Could not load sites: {e}")
        sites = []

    if not sites:
        st.warning("No reference sites available.")
        return

    df = pd.DataFrame(sites)

    # Filters
    col1, col2 = st.columns(2)
    with col1:
        countries = ['All'] + sorted(df['country'].unique().tolist())
        selected_country = st.selectbox("Filter by Country", countries)
    with col2:
        statuses = ['All'] + sorted(df['status'].unique().tolist())
        selected_status = st.selectbox("Filter by Status", statuses)

    # Apply filters
    filtered_df = df.copy()
    if selected_country != 'All':
        filtered_df = filtered_df[filtered_df['country'] == selected_country]
    if selected_status != 'All':
        filtered_df = filtered_df[filtered_df['status'] == selected_status]

    # Data table
    st.dataframe(
        filtered_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            'site_id': st.column_config.TextColumn('Site ID'),
            'country': st.column_config.TextColumn('Country'),
            'status': st.column_config.TextColumn('Status'),
        }
    )

    # Charts
    col1, col2 = st.columns(2)

    with col1:
        status_counts = df['status'].value_counts()
        fig = px.pie(
            values=status_counts.values,
            names=status_counts.index,
            title='Sites by Status',
            color_discrete_sequence=['#81c784', '#e57373', '#ffb74d', '#64b5f6']
        )
        fig.update_layout(paper_bgcolor='rgba(0,0,0,0)', font_color='#e0f4ff')
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        country_counts = df['country'].value_counts()
        fig = px.pie(
            values=country_counts.values,
            names=country_counts.index,
            title='Sites by Country',
            color_discrete_sequence=px.colors.qualitative.Set3
        )
        fig.update_layout(paper_bgcolor='rgba(0,0,0,0)', font_color='#e0f4ff')
        st.plotly_chart(fig, use_container_width=True)


def display_quick_result(result):
    """Display a quick summary of results."""
    classification = result.get('classification', {})
    label = classification.get('label', 'unknown')
    confidence = classification.get('confidence', 0)

    color = '#81c784' if 'healthy' in label else '#e57373' if 'degraded' in label else '#ffb74d'

    st.markdown(f"""
    <div class='result-card'>
        <h3 style='color: #80cbc4;'>Quick Result</h3>
        <p>Classification: <span style='color: {color}; font-weight: bold;'>{label.replace('_', ' ').title()}</span></p>
        <p>Confidence: <strong>{confidence:.0%}</strong></p>
    </div>
    """, unsafe_allow_html=True)


def upload_file(file):
    """Upload file to API."""
    try:
        response = requests.post(
            f"{API_URL}/upload",
            data=file.getvalue(),
            headers={
                'Content-Type': file.type or 'audio/wav',
                'X-Filename': file.name
            },
            timeout=60
        )
        return response.json()
    except requests.exceptions.Timeout:
        return {'error': {'message': 'Upload timed out. File may be too large.'}}
    except Exception as e:
        return {'error': {'message': str(e)}}


def start_analysis(upload_id):
    """Start analysis for uploaded file."""
    try:
        response = requests.post(
            f"{API_URL}/analyze",
            json={'upload_id': upload_id},
            timeout=30
        )
        return response.json()
    except Exception as e:
        return {'error': {'message': str(e)}}


def poll_for_results(analysis_id, timeout=180, interval=5):
    """Poll for analysis results with progress bar."""
    start_time = time.time()
    progress_bar = st.progress(0)
    status_text = st.empty()

    while time.time() - start_time < timeout:
        elapsed = time.time() - start_time
        progress = min(elapsed / timeout, 0.95)
        progress_bar.progress(progress)
        status_text.text(f"Processing... ({int(elapsed)}s elapsed)")

        try:
            response = requests.get(f"{API_URL}/visualize/{analysis_id}", timeout=10)
            result = response.json()

            if result.get('status') == 'complete':
                progress_bar.progress(1.0)
                status_text.empty()
                return result
            elif result.get('status') == 'failed':
                status_text.empty()
                return result

        except Exception:
            pass

        time.sleep(interval)

    status_text.empty()
    return None


if __name__ == "__main__":
    main()
```

**Step 3: Create Requirements File**

Create `~/reef-project/streamlit/requirements.txt`:
```
streamlit>=1.28.0
requests>=2.31.0
pandas>=2.0.0
plotly>=5.18.0
```

**Step 4: Create Streamlit Configuration**
```bash
mkdir -p ~/reef-project/streamlit/.streamlit

cat > ~/reef-project/streamlit/.streamlit/config.toml << 'EOF'
[theme]
primaryColor = "#4dd0e1"
backgroundColor = "#0c1829"
secondaryBackgroundColor = "#1a3a5c"
textColor = "#e0f4ff"
font = "sans serif"

[server]
headless = true
port = 8501
enableCORS = false
EOF
```

**Step 5: Create Secrets File (for local development)**
```bash
source ~/.reefradar-env

cat > ~/reef-project/streamlit/.streamlit/secrets.toml << EOF
API_URL = "$API_URL"
EOF

echo "Secrets file created with API_URL"
```

**Step 6: Run Locally**
```bash
cd ~/reef-project/streamlit
pip install -r requirements.txt
streamlit run app.py
```

The dashboard will be available at http://localhost:8501
</implementation>

<output>
Files created:
- `~/reef-project/streamlit/app.py` - Main Streamlit application
- `~/reef-project/streamlit/requirements.txt` - Python dependencies
- `~/reef-project/streamlit/.streamlit/config.toml` - Streamlit theme configuration
- `~/reef-project/streamlit/.streamlit/secrets.toml` - API URL secret
</output>

<verification>
```bash
cd ~/reef-project/streamlit

# Check all files exist
ls -la app.py requirements.txt .streamlit/

# Verify Python syntax
python -m py_compile app.py

# Test import
python -c "import streamlit; import plotly; import pandas; print('All imports OK')"

# Run the app (Ctrl+C to stop)
streamlit run app.py --server.headless true
```
</verification>

<success_criteria>
- [ ] app.py created with all three tabs implemented
- [ ] requirements.txt includes streamlit, plotly, pandas, requests
- [ ] Streamlit config uses ocean theme colors
- [ ] secrets.toml contains API_URL
- [ ] App starts without errors on localhost:8501
- [ ] Upload tab allows file selection and shows audio player
- [ ] Results tab displays classification and charts
- [ ] Reference Sites tab shows filterable site list
</success_criteria>

<deployment_options>
**Option 1: Hugging Face Spaces (Free, Recommended for Demo)**
1. Create account at huggingface.co
2. Create new Space with Streamlit SDK
3. Upload app.py and requirements.txt
4. Add API_URL as a Space secret

**Option 2: AWS App Runner**
```bash
# Create apprunner.yaml
cat > ~/reef-project/streamlit/apprunner.yaml << 'EOF'
version: 1.0
runtime: python3
build:
  commands:
    build:
      - pip install -r requirements.txt
run:
  command: streamlit run app.py --server.port 8080 --server.address 0.0.0.0
  network:
    port: 8080
EOF

# Deploy via AWS Console or CLI
```

**Option 3: Docker**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```
</deployment_options>

<next_phase>
After completing this phase, proceed to Phase 8: Testing and Validation (prompts/008-testing-validation.md)
</next_phase>
