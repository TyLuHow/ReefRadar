"""
ReefRadar - Coral Reef Acoustic Health Analysis Dashboard
"""

import streamlit as st
import requests
import time
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
import numpy as np
import folium
from streamlit_folium import st_folium

# Configuration
API_URL = "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"

# Reference site coordinates (for map display)
# Updated 2026-01-31: Real MARRS sites from validated embeddings
SITE_COORDINATES = {
    # Indonesia - South Sulawesi sites
    "ind_H4": {"lat": -4.929463, "lon": 119.316792, "location": "South Sulawesi, Indonesia"},
    "ind_H5": {"lat": -4.936146, "lon": 119.317739, "location": "South Sulawesi, Indonesia"},
    "ind_N1": {"lat": -4.9310799, "lon": 119.3159127, "location": "South Sulawesi, Indonesia"},
    "ind_D2": {"lat": -4.9401, "lon": 119.318815, "location": "South Sulawesi, Indonesia"},
    "ind_D3": {"lat": -4.930635, "lon": 119.316119, "location": "South Sulawesi, Indonesia"},
    "ind_R1": {"lat": -4.922214, "lon": 119.317036, "location": "South Sulawesi, Indonesia"},
    "ind_R2": {"lat": -4.926557, "lon": 119.316267, "location": "South Sulawesi, Indonesia"},
    # Kenya - Lamu site
    "ken_H1": {"lat": -2.215614, "lon": 41.013482, "location": "Lamu, Kenya"},
}

# Status colors
STATUS_COLORS = {
    'healthy': '#2ECC71',
    'degraded': '#E74C3C',
    'restored_early': '#F39C12',
    'restored_mid': '#3498DB'
}

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


def create_reference_map(sites_data=None):
    """Create an interactive map of reference sites using Folium."""
    # Center map on Pacific region
    m = folium.Map(location=[5, 130], zoom_start=2, tiles='CartoDB positron')

    # If no sites_data from API, use local coordinates
    if sites_data is None or len(sites_data) == 0:
        sites_data = []
        # Status mapping based on site code (H=healthy, D=degraded, N=restored_early, R=restored_mid)
        status_map = {'H': 'healthy', 'D': 'degraded', 'N': 'restored_early', 'R': 'restored_mid'}
        # Country code mapping
        country_map = {'ind': 'Indonesia', 'ken': 'Kenya', 'aus': 'Australia', 'mal': 'Maldives', 'mex': 'Mexico'}
        for site_id, coords in SITE_COORDINATES.items():
            # Extract site type from site_id (e.g., ind_H4 -> H)
            parts = site_id.split('_')
            site_type = parts[1][0] if len(parts) > 1 else 'U'
            country_code = parts[0] if parts else ''
            sites_data.append({
                'site_id': site_id,
                'latitude': coords['lat'],
                'longitude': coords['lon'],
                'location': coords['location'],
                'status': status_map.get(site_type, 'unknown'),
                'country': country_map.get(country_code, country_code.upper())
            })

    # Add markers for each site
    for site in sites_data:
        site_id = site.get('site_id', 'Unknown')
        lat = site.get('latitude') or SITE_COORDINATES.get(site_id, {}).get('lat')
        lon = site.get('longitude') or SITE_COORDINATES.get(site_id, {}).get('lon')

        if lat is None or lon is None:
            continue

        status = site.get('status', 'unknown')
        location = site.get('location', SITE_COORDINATES.get(site_id, {}).get('location', 'Unknown'))

        # Determine marker color based on status
        color_map = {
            'healthy': 'green',
            'degraded': 'red',
            'restored_early': 'orange',
            'restored_mid': 'blue'
        }
        marker_color = color_map.get(status, 'gray')

        # Create popup content
        popup_html = f"""
        <div style="font-family: Arial, sans-serif; min-width: 200px;">
            <h4 style="margin: 0 0 10px 0; color: #0077B6;">{site_id}</h4>
            <p style="margin: 5px 0;"><strong>Location:</strong> {location}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong>
                <span style="color: {STATUS_COLORS.get(status, '#666')}; font-weight: bold;">
                    {status.replace('_', ' ').title()}
                </span>
            </p>
            <p style="margin: 5px 0;"><strong>Coordinates:</strong> {lat:.4f}, {lon:.4f}</p>
        </div>
        """

        folium.Marker(
            location=[lat, lon],
            popup=folium.Popup(popup_html, max_width=300),
            tooltip=f"{site_id} - {status.replace('_', ' ').title()}",
            icon=folium.Icon(color=marker_color, icon='info-sign')
        ).add_to(m)

    # Add a legend
    legend_html = '''
    <div style="position: fixed; bottom: 50px; left: 50px; z-index: 1000; background-color: white;
                padding: 10px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
        <p style="margin: 0 0 5px 0; font-weight: bold;">Reef Status</p>
        <p style="margin: 2px 0;"><span style="color: green;">&#9679;</span> Healthy</p>
        <p style="margin: 2px 0;"><span style="color: red;">&#9679;</span> Degraded</p>
        <p style="margin: 2px 0;"><span style="color: orange;">&#9679;</span> Restored (Early)</p>
        <p style="margin: 2px 0;"><span style="color: blue;">&#9679;</span> Restored (Mid)</p>
    </div>
    '''
    m.get_root().html.add_child(folium.Element(legend_html))

    return m


def create_waveform_plot(audio_data, sample_rate=32000):
    """Create an interactive waveform visualization using Plotly."""
    # Generate time axis
    duration = len(audio_data) / sample_rate
    time_axis = np.linspace(0, duration, len(audio_data))

    # Downsample for display if too many points (keep every nth point for performance)
    max_points = 50000
    if len(audio_data) > max_points:
        step = len(audio_data) // max_points
        time_axis = time_axis[::step]
        audio_data = audio_data[::step]

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=time_axis,
        y=audio_data,
        mode='lines',
        line=dict(color='#0077B6', width=0.5),
        name='Waveform'
    ))

    fig.update_layout(
        title="Audio Waveform",
        xaxis_title="Time (seconds)",
        yaxis_title="Amplitude",
        height=250,
        margin=dict(l=50, r=20, t=40, b=40),
        hovermode='x unified'
    )

    return fig


def create_spectrogram_plot(audio_data, sample_rate=32000, n_fft=1024, hop_length=512):
    """Create a spectrogram visualization using numpy FFT."""
    # Compute Short-Time Fourier Transform
    n_frames = (len(audio_data) - n_fft) // hop_length + 1

    # Create window
    window = np.hanning(n_fft)

    # Compute spectrogram
    spectrogram = np.zeros((n_fft // 2 + 1, n_frames))

    for i in range(n_frames):
        start = i * hop_length
        frame = audio_data[start:start + n_fft] * window
        spectrum = np.abs(np.fft.rfft(frame))
        spectrogram[:, i] = spectrum

    # Convert to dB scale
    spectrogram_db = 20 * np.log10(spectrogram + 1e-10)

    # Create time and frequency axes
    time_axis = np.linspace(0, len(audio_data) / sample_rate, n_frames)
    freq_axis = np.fft.rfftfreq(n_fft, 1 / sample_rate)

    # Limit frequency range to 0-8kHz for underwater sounds
    max_freq_idx = np.searchsorted(freq_axis, 8000)
    spectrogram_db = spectrogram_db[:max_freq_idx, :]
    freq_axis = freq_axis[:max_freq_idx]

    fig = go.Figure(data=go.Heatmap(
        z=spectrogram_db,
        x=time_axis,
        y=freq_axis,
        colorscale='Viridis',
        colorbar=dict(title='dB'),
    ))

    fig.update_layout(
        title="Spectrogram (Frequency Content)",
        xaxis_title="Time (seconds)",
        yaxis_title="Frequency (Hz)",
        height=300,
        margin=dict(l=50, r=20, t=40, b=40)
    )

    return fig


def create_3d_embedding_plot(ref_sites, user_coords=None, user_label=None):
    """Create a 3D interactive scatter plot of the embedding space."""
    # Prepare data for visualization
    viz_data = []

    for site in ref_sites:
        viz_data.append({
            'x': site.get('x', 0),
            'y': site.get('y', 0),
            'z': site.get('z', 0) if 'z' in site else site.get('y', 0) * 0.5,  # Fallback if no z
            'Site': site.get('site_id'),
            'Status': site.get('status', 'unknown').replace('_', ' ').title(),
            'Type': 'Reference'
        })

    # Add user's sample if available
    if user_coords:
        viz_data.append({
            'x': user_coords.get('x', 0),
            'y': user_coords.get('y', 0),
            'z': user_coords.get('z', 0) if 'z' in user_coords else user_coords.get('y', 0) * 0.5,
            'Site': 'Your Sample',
            'Status': (user_label or 'Unknown').replace('_', ' ').title(),
            'Type': 'Your Sample'
        })

    df = pd.DataFrame(viz_data)

    # Create 3D scatter plot
    fig = go.Figure()

    # Add reference sites
    for status in df[df['Type'] == 'Reference']['Status'].unique():
        mask = (df['Status'] == status) & (df['Type'] == 'Reference')
        status_lower = status.lower().replace(' ', '_')
        color = STATUS_COLORS.get(status_lower, '#888888')

        fig.add_trace(go.Scatter3d(
            x=df[mask]['x'],
            y=df[mask]['y'],
            z=df[mask]['z'],
            mode='markers',
            marker=dict(size=8, color=color, symbol='circle'),
            name=f"{status} (Reference)",
            text=df[mask]['Site'],
            hovertemplate="<b>%{text}</b><br>Status: " + status + "<extra></extra>"
        ))

    # Add user sample with star marker
    if user_coords:
        user_mask = df['Type'] == 'Your Sample'
        user_status = df[user_mask]['Status'].iloc[0]
        status_lower = user_status.lower().replace(' ', '_')
        color = STATUS_COLORS.get(status_lower, '#888888')

        fig.add_trace(go.Scatter3d(
            x=df[user_mask]['x'],
            y=df[user_mask]['y'],
            z=df[user_mask]['z'],
            mode='markers',
            marker=dict(size=15, color=color, symbol='diamond', line=dict(width=2, color='white')),
            name=f"Your Sample ({user_status})",
            text=['Your Sample'],
            hovertemplate="<b>Your Sample</b><br>Predicted: " + user_status + "<extra></extra>"
        ))

    fig.update_layout(
        title="3D Acoustic Embedding Space",
        scene=dict(
            xaxis_title="Acoustic Dimension 1",
            yaxis_title="Acoustic Dimension 2",
            zaxis_title="Acoustic Dimension 3",
            camera=dict(
                eye=dict(x=1.5, y=1.5, z=1.0)
            )
        ),
        height=500,
        margin=dict(l=0, r=0, t=40, b=0),
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="left",
            x=0.01
        )
    )

    return fig


def create_2d_embedding_plot(ref_sites, user_coords=None, user_label=None):
    """Create a 2D scatter plot of the embedding space (fallback/comparison)."""
    viz_data = []

    for site in ref_sites:
        viz_data.append({
            'x': site.get('x', 0),
            'y': site.get('y', 0),
            'Site': site.get('site_id'),
            'Status': site.get('status', 'unknown').replace('_', ' ').title(),
            'Type': 'Reference'
        })

    if user_coords:
        viz_data.append({
            'x': user_coords.get('x', 0),
            'y': user_coords.get('y', 0),
            'Site': 'Your Sample',
            'Status': (user_label or 'Unknown').replace('_', ' ').title(),
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
        title="2D Acoustic Feature Space",
        xaxis_title="Acoustic Dimension 1",
        yaxis_title="Acoustic Dimension 2",
        height=400
    )

    return fig


def read_wav_bytes(wav_bytes):
    """Read WAV file bytes and return audio data and sample rate."""
    import struct

    # Parse WAV header
    if wav_bytes[:4] != b'RIFF':
        raise ValueError("Not a valid WAV file")

    # Find data chunk
    pos = 12
    while pos < len(wav_bytes):
        chunk_id = wav_bytes[pos:pos+4]
        chunk_size = struct.unpack('<I', wav_bytes[pos+4:pos+8])[0]

        if chunk_id == b'fmt ':
            audio_format = struct.unpack('<H', wav_bytes[pos+8:pos+10])[0]
            num_channels = struct.unpack('<H', wav_bytes[pos+10:pos+12])[0]
            sample_rate = struct.unpack('<I', wav_bytes[pos+12:pos+16])[0]
            bits_per_sample = struct.unpack('<H', wav_bytes[pos+22:pos+24])[0]
            pos += 8 + chunk_size
        elif chunk_id == b'data':
            data_start = pos + 8
            data_end = data_start + chunk_size
            audio_bytes = wav_bytes[data_start:data_end]

            # Convert bytes to numpy array
            if bits_per_sample == 16:
                audio_data = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            elif bits_per_sample == 32:
                audio_data = np.frombuffer(audio_bytes, dtype=np.int32).astype(np.float32) / 2147483648.0
            else:
                audio_data = np.frombuffer(audio_bytes, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0

            # Convert to mono if stereo
            if num_channels == 2:
                audio_data = audio_data.reshape(-1, 2).mean(axis=1)

            return audio_data, sample_rate
        else:
            pos += 8 + chunk_size

    raise ValueError("Could not find audio data in WAV file")


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

            # Read audio data for visualizations
            try:
                uploaded_file.seek(0)
                wav_bytes = uploaded_file.read()
                audio_data, sample_rate = read_wav_bytes(wav_bytes)
                uploaded_file.seek(0)  # Reset for later use

                # Display audio visualizations
                st.markdown("### Audio Visualizations")

                # Waveform
                waveform_fig = create_waveform_plot(audio_data, sample_rate)
                st.plotly_chart(waveform_fig, use_container_width=True)

                # Spectrogram
                spectrogram_fig = create_spectrogram_plot(audio_data, sample_rate)
                st.plotly_chart(spectrogram_fig, use_container_width=True)

                # Audio stats
                duration = len(audio_data) / sample_rate
                col_a, col_b, col_c = st.columns(3)
                with col_a:
                    st.metric("Duration", f"{duration:.1f}s")
                with col_b:
                    st.metric("Sample Rate", f"{sample_rate} Hz")
                with col_c:
                    st.metric("Peak Amplitude", f"{np.max(np.abs(audio_data)):.3f}")

            except Exception as e:
                st.warning(f"Could not visualize audio: {str(e)}")
                uploaded_file.seek(0)

                # Optional coordinates for region detection
            with st.expander("Recording Location (optional)", expanded=False):
                st.caption("Providing coordinates enables geographic region detection and confidence adjustment.")
                coord_col1, coord_col2 = st.columns(2)
                with coord_col1:
                    user_lat = st.number_input("Latitude", value=None, min_value=-90.0, max_value=90.0, step=0.001, format="%.6f", key="lat_input")
                with coord_col2:
                    user_lon = st.number_input("Longitude", value=None, min_value=-180.0, max_value=180.0, step=0.001, format="%.6f", key="lon_input")

            if st.button("🔬 Analyze Audio", type="primary"):
                with st.spinner("Uploading audio..."):
                    # Upload file
                    try:
                        uploaded_file.seek(0)
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

                            # Start analysis with optional coordinates
                            with st.spinner("Starting analysis..."):
                                analyze_payload = {'upload_id': upload_id}
                                if user_lat is not None:
                                    analyze_payload['latitude'] = user_lat
                                if user_lon is not None:
                                    analyze_payload['longitude'] = user_lon

                                analyze_response = requests.post(
                                    f"{API_URL}/analyze",
                                    json=analyze_payload,
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

            # Region detection info
            region = classification.get('region', {})
            if region:
                if not region.get('in_training_distribution', True):
                    st.warning(f"⚠️ Recording from **{region.get('name', 'Unknown')}** — outside model training distribution. Confidence reduced.")
                else:
                    st.info(f"Region: **{region.get('name', 'Unknown')}** (in training distribution)")

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

        # 3D and 2D Embedding Visualization
        viz = result.get('visualization', {})
        if viz.get('reference_sites'):
            st.markdown("### Acoustic Space Visualization")

            ref_sites = viz.get('reference_sites', [])
            coords = viz.get('coordinates', {})

            # Create tabs for 3D and 2D views
            viz_tab1, viz_tab2 = st.tabs(["3D View", "2D View"])

            with viz_tab1:
                fig_3d = create_3d_embedding_plot(ref_sites, coords, label)
                st.plotly_chart(fig_3d, use_container_width=True)
                st.caption("Drag to rotate, scroll to zoom. Your sample is shown as a diamond marker.")

            with viz_tab2:
                fig_2d = create_2d_embedding_plot(ref_sites, coords, label)
                st.plotly_chart(fig_2d, use_container_width=True)

        # Caveats
        st.markdown("---")
        st.caption(result.get('caveats', 'Results are based on acoustic similarity and should be validated with visual surveys.'))

        if st.button("Clear Results"):
            del st.session_state['analysis_result']
            st.rerun()

with tab2:
    st.header("Reference Sites")

    # Create and display the interactive map first
    st.markdown("### Global Distribution of Reference Sites")
    st.markdown("Click on markers to see site details. Sites are color-coded by health status.")

    try:
        # Try to load sites from API
        response = requests.get(f"{API_URL}/sites", timeout=10)
        sites_data = response.json().get('sites', [])

        # Enrich with coordinates from our local data
        for site in sites_data:
            site_id = site.get('site_id')
            if site_id in SITE_COORDINATES:
                site['latitude'] = SITE_COORDINATES[site_id]['lat']
                site['longitude'] = SITE_COORDINATES[site_id]['lon']
                site['location'] = SITE_COORDINATES[site_id]['location']
    except requests.exceptions.RequestException:
        sites_data = None

    # Create and display map
    reference_map = create_reference_map(sites_data)
    st_folium(reference_map, width=None, height=450, returned_objects=[])

    st.markdown("---")

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

        # Sites table with coordinates
        st.markdown("### All Reference Sites")
        df = pd.DataFrame(sites)

        # Add coordinates from our local data
        df['latitude'] = df['site_id'].apply(lambda x: SITE_COORDINATES.get(x, {}).get('lat', None))
        df['longitude'] = df['site_id'].apply(lambda x: SITE_COORDINATES.get(x, {}).get('lon', None))
        df['location'] = df['site_id'].apply(lambda x: SITE_COORDINATES.get(x, {}).get('location', 'Unknown'))

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

        # Show map with local data anyway
        st.info("Showing reference sites from local data.")

with tab3:
    st.header("About ReefRadar")

    st.markdown("### System Architecture")

    # Architecture diagram using graphviz
    architecture_graph = """
    digraph ReefRadar {
        rankdir=TB;
        node [shape=box, style="rounded,filled", fontname="Helvetica"];
        edge [fontname="Helvetica", fontsize=10];

        // Styling
        bgcolor="transparent";

        // User layer
        subgraph cluster_user {
            label="User Interface";
            style="dashed";
            color="#666666";
            Browser [label="Browser/Dashboard", fillcolor="#E8F4FD"];
        }

        // API layer
        subgraph cluster_api {
            label="API Layer";
            style="dashed";
            color="#FF9900";
            APIGateway [label="API Gateway\\nHTTP API", fillcolor="#FF9900", fontcolor="white"];
        }

        // Compute layer
        subgraph cluster_compute {
            label="Compute Layer (Lambda)";
            style="dashed";
            color="#FF9900";
            Router [label="Router\\n256MB, 30s", fillcolor="#FF9900", fontcolor="white"];
            Preprocessor [label="Preprocessor\\n1024MB, 180s", fillcolor="#FF9900", fontcolor="white"];
            Classifier [label="Classifier\\n512MB, 120s", fillcolor="#FF9900", fontcolor="white"];
        }

        // Storage layer
        subgraph cluster_storage {
            label="Storage Layer";
            style="dashed";
            color="#3F8624";
            S3Audio [label="S3: Audio\\nuploads, processed", fillcolor="#3F8624", fontcolor="white"];
            S3Embeddings [label="S3: Embeddings\\nmodels, reference", fillcolor="#3F8624", fontcolor="white"];
            DynamoDB [label="DynamoDB\\nmetadata", fillcolor="#3F8624", fontcolor="white"];
        }

        // ML layer
        subgraph cluster_ml {
            label="ML Layer (Lambda Container)";
            style="dashed";
            color="#9D5025";
            Inference [label="Inference Lambda\\nSurfPerch (Container)\\n3GB, 5min", fillcolor="#9D5025", fontcolor="white"];
        }

        // Connections
        Browser -> APIGateway [label="HTTPS"];
        APIGateway -> Router;
        Router -> Preprocessor [label="async"];
        Router -> DynamoDB;
        Preprocessor -> S3Audio;
        Preprocessor -> Classifier [label="async"];
        Classifier -> S3Embeddings;
        Classifier -> DynamoDB;
        Classifier -> Inference [label="sync"];
    }
    """

    st.graphviz_chart(architecture_graph)

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("""
        **AWS Services Used:**
        - **API Gateway** - HTTP API endpoint
        - **Lambda** - 4 serverless functions (incl. container)
        - **S3** - Audio and embedding storage
        - **DynamoDB** - Metadata tracking
        - **ECR** - Inference container registry
        """)
    with col2:
        st.markdown("""
        **Data Flow:**
        1. User uploads audio via API Gateway
        2. Router stores file in S3, triggers preprocessing
        3. Preprocessor converts to 32kHz, segments audio
        4. Classifier generates embeddings, compares to references
        5. Results stored in DynamoDB, returned to user
        """)

    st.markdown("---")

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

    Our reference database includes recordings from the **MARRS (Mars Assisted Reef Restoration System)** dataset:
    - **Indonesia** - South Sulawesi (2 healthy, 2 degraded, 1 restored early site)
    - **Kenya** - Lamu (1 healthy site)

    Source: UCL Figshare (DOI: 10.5522/04/29958062)

    **Current Limitations:**
    - 6 validated reference sites (3 healthy, 2 degraded, 1 restored early)
    - Geographic coverage limited to 2 regions

    ### Limitations

    - Results are based on acoustic similarity only
    - Background noise can affect accuracy
    - Should be combined with visual surveys for definitive assessment
    - Limited to 6 reference sites across 2 countries
    - Model was trained primarily on Indo-Pacific reef sounds

    ### Technology Stack

    - **Model**: SurfPerch (bird-vocalization-classifier adapted for reef sounds)
    - **Cloud**: AWS (Lambda, ECR, S3, DynamoDB, API Gateway)
    - **Frontend**: Streamlit

    ### Credits

    - SurfPerch model from Google Research
    - MARRS reef sound research
    - AWS Cloud infrastructure
    """)

    st.markdown("---")
    st.caption("Built for AWS Cloud Practitioner certification demonstration")
