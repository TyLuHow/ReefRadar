"""
ReefRadar - Coral Reef Acoustic Health Analysis Dashboard
"""

import streamlit as st
import requests
import time
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd

# Configuration
API_URL = "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"

st.set_page_config(
    page_title="ReefRadar",
    page_icon="🐠",
    layout="wide"
)

# Custom CSS
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        color: #0077B6;
        text-align: center;
        padding: 1rem;
    }
    .sub-header {
        font-size: 1.2rem;
        color: #666;
        text-align: center;
        margin-bottom: 2rem;
    }
    .status-healthy { color: #2ECC71; font-weight: bold; }
    .status-degraded { color: #E74C3C; font-weight: bold; }
    .status-restored_early { color: #F39C12; font-weight: bold; }
    .status-restored_mid { color: #3498DB; font-weight: bold; }
</style>
""", unsafe_allow_html=True)

# Header
st.markdown('<h1 class="main-header">🐠 ReefRadar</h1>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Coral Reef Acoustic Health Analysis using AI</p>', unsafe_allow_html=True)

# Tabs
tab1, tab2, tab3 = st.tabs(["🎤 Analyze Audio", "🗺️ Reference Sites", "📊 About"])

with tab1:
    st.header("Upload Reef Audio for Analysis")

    col1, col2 = st.columns([2, 1])

    with col1:
        uploaded_file = st.file_uploader(
            "Upload a WAV file of underwater reef sounds",
            type=['wav'],
            help="Audio should be at least 5 seconds long. Supported format: WAV"
        )

        if uploaded_file:
            st.audio(uploaded_file, format='audio/wav')

            if st.button("🔬 Analyze Audio", type="primary"):
                with st.spinner("Uploading audio..."):
                    # Upload file
                    try:
                        upload_response = requests.post(
                            f"{API_URL}/upload",
                            data=uploaded_file.read(),
                            headers={
                                'Content-Type': 'audio/wav',
                                'X-Filename': uploaded_file.name
                            },
                            timeout=30
                        )
                        upload_result = upload_response.json()

                        if 'error' in upload_result:
                            st.error(f"Upload failed: {upload_result['error']['message']}")
                        else:
                            upload_id = upload_result['upload_id']
                            st.success(f"Upload successful! ID: {upload_id}")

                            # Start analysis
                            with st.spinner("Starting analysis..."):
                                analyze_response = requests.post(
                                    f"{API_URL}/analyze",
                                    json={'upload_id': upload_id},
                                    timeout=30
                                )
                                analyze_result = analyze_response.json()

                                if 'error' in analyze_result:
                                    st.error(f"Analysis failed: {analyze_result['error']['message']}")
                                else:
                                    analysis_id = analyze_result['analysis_id']
                                    st.info(f"Analysis started! ID: {analysis_id}")

                                    # Poll for results
                                    progress_bar = st.progress(0, "Processing audio...")
                                    result = None

                                    for i in range(60):  # Max 60 seconds
                                        time.sleep(2)
                                        progress_bar.progress((i + 1) * 100 // 60, "Processing audio...")

                                        result_response = requests.get(
                                            f"{API_URL}/visualize/{analysis_id}",
                                            timeout=30
                                        )
                                        result = result_response.json()

                                        if result.get('status') == 'complete':
                                            progress_bar.progress(100, "Analysis complete!")
                                            break
                                        elif result.get('status') == 'failed':
                                            st.error(f"Analysis failed: {result.get('error', 'Unknown error')}")
                                            break

                                    if result and result.get('status') == 'complete':
                                        st.session_state['analysis_result'] = result
                                        st.rerun()

                    except requests.exceptions.RequestException as e:
                        st.error(f"Network error: {str(e)}")

    with col2:
        st.markdown("### How It Works")
        st.markdown("""
        1. **Upload** your underwater audio recording
        2. **Process** - Audio is converted to 32kHz and segmented
        3. **Analyze** - AI extracts acoustic features
        4. **Compare** - Features compared to reference sites
        5. **Results** - Health classification and similar sites
        """)

    # Display results if available
    if 'analysis_result' in st.session_state:
        result = st.session_state['analysis_result']

        st.markdown("---")
        st.header("Analysis Results")

        col1, col2, col3 = st.columns(3)

        classification = result.get('classification', {})
        label = classification.get('label', 'Unknown')
        confidence = classification.get('confidence', 0)

        with col1:
            st.metric("Health Classification", label.replace('_', ' ').title())
            st.progress(confidence, f"{confidence*100:.1f}% confidence")

        with col2:
            st.markdown("### Probability Distribution")
            probs = classification.get('probabilities', {})
            if probs:
                prob_df = pd.DataFrame([
                    {'Status': k.replace('_', ' ').title(), 'Probability': v}
                    for k, v in probs.items()
                ])
                fig = px.bar(prob_df, x='Status', y='Probability',
                           color='Status',
                           color_discrete_map={
                               'Healthy': '#2ECC71',
                               'Degraded': '#E74C3C',
                               'Restored Early': '#F39C12',
                               'Restored Mid': '#3498DB'
                           })
                fig.update_layout(showlegend=False, height=300)
                st.plotly_chart(fig, use_container_width=True)

        with col3:
            st.markdown("### Similar Reference Sites")
            similar_sites = result.get('similar_sites', [])
            for site in similar_sites:
                sim_pct = site.get('similarity', 0) * 100
                st.markdown(f"**{site.get('site_id')}** ({site.get('country')})")
                st.progress(site.get('similarity', 0), f"{sim_pct:.1f}% similar - {site.get('status', '').replace('_', ' ')}")

        # Visualization
        viz = result.get('visualization', {})
        if viz.get('reference_sites'):
            st.markdown("### Acoustic Space Visualization")

            ref_sites = viz.get('reference_sites', [])
            coords = viz.get('coordinates', {})

            # Create scatter plot
            viz_data = []
            for site in ref_sites:
                viz_data.append({
                    'x': site.get('x', 0),
                    'y': site.get('y', 0),
                    'Site': site.get('site_id'),
                    'Status': site.get('status', 'unknown').replace('_', ' ').title(),
                    'Type': 'Reference'
                })

            # Add user's sample
            viz_data.append({
                'x': coords.get('x', 0),
                'y': coords.get('y', 0),
                'Site': 'Your Sample',
                'Status': label.replace('_', ' ').title(),
                'Type': 'Your Sample'
            })

            df = pd.DataFrame(viz_data)

            fig = px.scatter(df, x='x', y='y', color='Status', symbol='Type',
                           hover_data=['Site'],
                           color_discrete_map={
                               'Healthy': '#2ECC71',
                               'Degraded': '#E74C3C',
                               'Restored Early': '#F39C12',
                               'Restored Mid': '#3498DB'
                           },
                           symbol_map={'Reference': 'circle', 'Your Sample': 'star'})

            fig.update_traces(marker=dict(size=12))
            fig.update_layout(
                title="Acoustic Feature Space",
                xaxis_title="Acoustic Dimension 1",
                yaxis_title="Acoustic Dimension 2",
                height=500
            )
            st.plotly_chart(fig, use_container_width=True)

        # Caveats
        st.markdown("---")
        st.caption(result.get('caveats', 'Results are based on acoustic similarity and should be validated with visual surveys.'))

        if st.button("Clear Results"):
            del st.session_state['analysis_result']
            st.rerun()

with tab2:
    st.header("Reference Sites")

    try:
        response = requests.get(f"{API_URL}/sites", timeout=10)
        sites_data = response.json()

        sites = sites_data.get('sites', [])

        # Summary metrics
        col1, col2, col3, col4 = st.columns(4)

        status_counts = {}
        for site in sites:
            status = site.get('status', 'unknown')
            status_counts[status] = status_counts.get(status, 0) + 1

        with col1:
            st.metric("Total Sites", len(sites))
        with col2:
            st.metric("Healthy", status_counts.get('healthy', 0))
        with col3:
            st.metric("Degraded", status_counts.get('degraded', 0))
        with col4:
            st.metric("Restored", status_counts.get('restored_early', 0) + status_counts.get('restored_mid', 0))

        # Sites table
        st.markdown("### All Reference Sites")
        df = pd.DataFrame(sites)
        df['status'] = df['status'].str.replace('_', ' ').str.title()
        st.dataframe(df, use_container_width=True)

        # By country
        st.markdown("### Sites by Country")
        country_status = pd.DataFrame(sites).groupby(['country', 'status']).size().unstack(fill_value=0)
        fig = px.bar(country_status, barmode='stack',
                    color_discrete_map={
                        'healthy': '#2ECC71',
                        'degraded': '#E74C3C',
                        'restored_early': '#F39C12',
                        'restored_mid': '#3498DB'
                    })
        fig.update_layout(title="Reference Sites by Country and Status")
        st.plotly_chart(fig, use_container_width=True)

    except requests.exceptions.RequestException as e:
        st.error(f"Could not load reference sites: {str(e)}")

with tab3:
    st.header("About ReefRadar")

    st.markdown("""
    ### What is ReefRadar?

    ReefRadar is an AI-powered tool for analyzing coral reef health through underwater acoustic recordings.
    Healthy reefs produce distinct soundscapes from the fish, invertebrates, and other marine life that inhabit them.
    By analyzing these sounds, we can assess reef health non-invasively.

    ### How It Works

    1. **Audio Processing**: Your recording is converted to 32kHz sample rate and split into 5-second segments
    2. **Feature Extraction**: A deep learning model (SurfPerch) extracts 1280-dimensional acoustic embeddings
    3. **Classification**: Embeddings are compared to reference sites from healthy, degraded, and restored reefs
    4. **Results**: You receive a health classification and similarity scores to reference sites

    ### Reference Data

    Our reference database includes recordings from:
    - **Australia** - Great Barrier Reef sites
    - **Indonesia** - Raja Ampat and Sulawesi
    - **Philippines** - Visayan Sea
    - **Mexico** - Caribbean reefs

    ### Limitations

    - Results are based on acoustic similarity only
    - Background noise can affect accuracy
    - Should be combined with visual surveys for definitive assessment
    - Model was trained primarily on Indo-Pacific reef sounds

    ### Technology Stack

    - **Model**: SurfPerch (bird-vocalization-classifier adapted for reef sounds)
    - **Cloud**: AWS (Lambda, SageMaker, S3, DynamoDB, API Gateway)
    - **Frontend**: Streamlit

    ### Credits

    - SurfPerch model from Google Research
    - MARRS reef sound research
    - AWS Cloud infrastructure
    """)

    st.markdown("---")
    st.caption("Built for AWS Cloud Practitioner certification demonstration")
