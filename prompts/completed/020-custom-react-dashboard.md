<objective>
Build a custom React/Next.js web dashboard to replace the current Streamlit dashboard. This will provide better UX, more design control, and easier deployment to S3+CloudFront.

The new dashboard should replicate all current functionality while improving the user experience with a modern, polished interface.
</objective>

<context>
Read CLAUDE.md for project conventions.

Current Streamlit dashboard:
@dashboard/app.py - Current implementation with 3 tabs (Analyze, Reference Sites, About)

API endpoint: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod

Available API routes:
- GET /health - Health check
- GET /sites - List reference sites with coordinates
- POST /upload - Upload WAV file (returns upload_id)
- POST /analyze - Start analysis (returns analysis_id)
- GET /visualize/{id} - Get results (poll until complete)

Current features to replicate:
1. File upload with drag-and-drop
2. Async analysis with progress indicator
3. Results display with classification and confidence
4. 2D embedding visualization (scatter plot)
5. Reference sites list with country/status info
6. About page with architecture diagram
</context>

<requirements>
1. **Project Setup**:
   - Create Next.js 14+ app with App Router
   - Use TypeScript for type safety
   - Tailwind CSS for styling
   - No authentication required (public API)

2. **Pages/Routes**:
   - `/` - Main analyze page with upload and results
   - `/sites` - Reference sites gallery with map (placeholder for next prompt)
   - `/about` - Project info, architecture, how it works

3. **Analyze Page Features**:
   - Drag-and-drop file upload zone
   - File validation (WAV only, max 10MB)
   - Upload progress indicator
   - Analysis status polling with visual feedback
   - Results display: classification label, confidence %, probability bars
   - 2D visualization of embedding vs reference sites (use Recharts or similar)

4. **UI Components**:
   - Responsive navbar with logo/title
   - Loading spinners and skeleton states
   - Error handling with user-friendly messages
   - Toast notifications for status updates

5. **API Integration**:
   - Create API client module with proper error handling
   - Implement polling logic for async analysis
   - Handle all API error states gracefully
</requirements>

<implementation>
Use these patterns:
- React Query or SWR for data fetching
- Zustand or React Context for minimal state management
- Framer Motion for subtle animations (optional)
- Lucide React for icons

File structure:
```
dashboard-next/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Analyze page
│   │   ├── sites/page.tsx    # Sites page
│   │   ├── about/page.tsx    # About page
│   │   └── layout.tsx        # Root layout with nav
│   ├── components/
│   │   ├── FileUpload.tsx
│   │   ├── AnalysisResults.tsx
│   │   ├── EmbeddingChart.tsx
│   │   └── Navbar.tsx
│   ├── lib/
│   │   └── api.ts            # API client
│   └── types/
│       └── index.ts          # TypeScript types
├── package.json
├── tailwind.config.js
└── next.config.js
```
</implementation>

<constraints>
- Must work as static export (next export) for S3 deployment
- No server-side features that require Node.js runtime
- Keep bundle size reasonable (<500KB initial load)
- Mobile-responsive design
</constraints>

<output>
Create the complete Next.js dashboard in:
- `./dashboard-next/` - New dashboard directory

Include:
- All source files as specified above
- package.json with dependencies
- README.md with local dev and deployment instructions
- .env.example with API_URL placeholder
</output>

<verification>
Before completing:
1. Verify all TypeScript compiles without errors
2. Check that static export works: `npm run build`
3. Confirm API client handles all endpoints
4. Test file upload flow logic (mock if needed)
</verification>

<success_criteria>
- Next.js app created with all pages
- File upload and analysis flow implemented
- Results visualization working
- Static export compatible
- Clean, modern UI with Tailwind
- README includes deployment steps for S3+CloudFront
</success_criteria>
