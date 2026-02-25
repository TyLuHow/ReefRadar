<objective>
Add rich, interactive visualizations to the ReefRadar Streamlit dashboard including a geographic map of reference sites, audio spectrograms, waveform displays, and a 3D embedding space visualization.

The goal is to make the analysis results more engaging and informative by providing geographic context (where are these reefs?), audio visualization (what does the sound look like?), and spatial understanding (how do samples cluster in embedding space?).
</objective>

<context>
ReefRadar is a coral reef acoustic health analysis API. The current Streamlit dashboard has basic visualizations:
- 2D scatter plot of embedding space
- Bar chart of classification probabilities
- Simple metrics display

The dashboard needs richer visualizations to be more compelling for portfolio demonstrations and to provide better insight into the analysis results.

Examine these files first:
@dashboard/app.py - Current Streamlit dashboard (lines 180-280 have visualization code)
@data/embeddings/metadata.json - Reference site data (needs lat/lon coordinates added)
@lambdas/classifier/handler.py - Classification output structure (lines 200-250)
</context>

<requirements>
1. **Geographic Map** (highest priority)
   - Add latitude/longitude coordinates to reference site metadata
   - Create an interactive world map showing all 8 reference sites
   - Color-code markers by health status (healthy=green, degraded=red, restored=orange/blue)
   - Show site details on hover/click
   - Use Folium or Plotly for map rendering (both work with Streamlit)

   Reference site approximate locations:
   - aus_H1, aus_H2, aus_D1, aus_R1: Great Barrier Reef, Australia (~-18.2, 147.5)
   - idn_H1, idn_M1: Raja Ampat, Indonesia (~-0.5, 130.5)
   - phl_D1: Visayan Sea, Philippines (~10.5, 124.0)
   - mex_R1: Caribbean Mexico (~20.5, -87.0)

2. **Audio Waveform Display**
   - Show waveform visualization of uploaded audio
   - Display amplitude over time
   - Use Plotly for interactive zoom/pan

3. **Spectrogram Visualization**
   - Generate spectrogram from audio data
   - Show frequency content over time
   - Use colormap to show intensity (e.g., viridis)
   - May need to compute in preprocessor Lambda or client-side

4. **3D Embedding Space**
   - Upgrade 2D scatter to 3D visualization
   - Show reference sites and user sample in 3D space
   - Use PCA or t-SNE to reduce 1280-dim embeddings to 3D
   - Interactive rotation/zoom with Plotly

5. **Dashboard Layout**
   - Organize visualizations logically
   - Map in Reference Sites tab
   - Waveform/spectrogram in Analyze tab (after upload, before results)
   - 3D embedding space in results section
</requirements>

<implementation>
Use these libraries (all Streamlit-compatible):
- `folium` + `streamlit-folium` for maps
- `plotly` for waveform, spectrogram, and 3D scatter (already installed)
- `numpy` for audio processing (already available)

For spectrogram generation without scipy:
- Use numpy FFT: `np.fft.rfft()` with windowing
- Or use librosa if acceptable to add dependency

Update metadata.json structure:
```json
{
  "sites": {
    "aus_H1": {
      "embedding": [...],
      "latitude": -18.2,
      "longitude": 147.5,
      "country": "Australia",
      "status": "healthy"
    }
  }
}
```

WHY these choices:
- Folium provides beautiful, interactive maps with minimal code
- Plotly 3D scatter enables intuitive exploration of embedding space
- Keeping computations client-side avoids Lambda changes for MVP
</implementation>

<output>
Modify/create these files:

1. `./dashboard/app.py` - Add all new visualizations
2. `./data/embeddings/metadata.json` - Add lat/lon to each site
3. `./dashboard/requirements.txt` - Add folium, streamlit-folium if needed

After implementation, test by running:
```bash
cd dashboard && streamlit run app.py --server.headless true
```
</output>

<verification>
Before declaring complete, verify:

1. Map displays correctly with all 8 reference sites at correct locations
2. Clicking/hovering on map markers shows site info
3. Waveform renders for uploaded audio files
4. Spectrogram shows frequency content (may be placeholder if complex)
5. 3D scatter plot is interactive and shows reference sites + user sample
6. No import errors or runtime crashes
7. All existing functionality still works

Test with the API:
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
```
</verification>

<success_criteria>
- Geographic map shows all 8 reference sites at real-world locations
- Audio waveform displays for uploaded files
- Spectrogram visualization present (even if simplified)
- 3D embedding space replaces or supplements 2D scatter
- Dashboard remains responsive and usable
- Code is clean and follows existing patterns in app.py
</success_criteria>
