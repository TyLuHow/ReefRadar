<research_objective>
Research how to enable Docker CLI commands in WSL2 when Docker Desktop is installed on Windows but the `docker` command returns "command not found" in the WSL2 terminal.

The user has confirmed:
- Docker Desktop is installed on Windows
- WSL2 backend is enabled (Advanced settings shows "You are using the WSL 2 backend")
- Running `docker` in WSL2 gives "command not found"
- The Resources settings only show tabs: Advanced, File sharing, Proxies, Network
- There is NO "WSL Integration" tab visible (which older documentation mentions)

This research will help the user build and deploy a Lambda container image for their ReefRadar project.
</research_objective>

<research_questions>
Answer these specific questions:

1. **Where did the WSL Integration setting move?**
   - In Docker Desktop 4.x+, where is the WSL2 distro integration toggle?
   - Did it move to a different settings section?
   - Is it now under a different name?

2. **Is WSL integration now automatic?**
   - In newer Docker Desktop versions, is WSL2 integration enabled by default?
   - Are there conditions where it's automatic vs manual?

3. **Alternative methods to enable docker in WSL2:**
   - Can you manually add docker to PATH in WSL2?
   - Is there a symlink or alias that should exist?
   - What's the expected path to docker executable when Docker Desktop is installed?

4. **Troubleshooting steps:**
   - How to verify Docker Desktop is actually running?
   - How to check if WSL integration is enabled via CLI?
   - Common fixes when docker command is not found in WSL2
   - Does WSL2 distro need to be restarted after Docker Desktop starts?

5. **Docker Desktop version-specific changes:**
   - What changed in recent Docker Desktop versions regarding WSL2?
   - Any known issues with specific versions?
</research_questions>

<scope>
- Focus on Docker Desktop for Windows with WSL2 backend (not Docker Engine installed directly in WSL2)
- Target Docker Desktop version 4.x and later (2024-2026)
- Prioritize official Docker documentation and recent community solutions
- Include any relevant Windows/WSL2 configuration requirements
</scope>

<deliverables>
Provide:

1. **Step-by-step fix** - The most likely solution to enable docker in WSL2
2. **Verification commands** - How to confirm docker is working
3. **Alternative approaches** - If the main fix doesn't work
4. **Explanation** - Why this might have happened (version change, settings migration, etc.)

Format the response as actionable instructions the user can follow immediately.
</deliverables>

<verification>
Before completing, verify:
- At least one concrete solution is provided with exact steps
- Commands are provided to test if the fix worked
- Sources are cited where possible
</verification>
