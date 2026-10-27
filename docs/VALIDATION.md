# Validation record

Prototype validation performed on 27 October 2026.

## Verified locally

- 37 automated tests passed on Python 3.12, including complete HTTP investigations for all three fault families.
- TypeScript checking and a Vite production build passed.
- Tests cover all three fault families in practice and assessment, correct and incorrect repairs, two-temperature verification, evidence validation, answer hiding, persistent session recovery, capability-key checks and server-enforced assessment restrictions.
- Ollama integration was verified with mocked successful, malformed and unavailable responses. The tests confirm that the context excludes the answer key.

## Not verified in this environment

- Live Ollama model inference: the user's local Ollama installation is separate from this executor.
- Browser interaction and visual layout: the managed preview environment could not resolve this executor's Python virtual environment, so a browser test could not start. No claim of completed browser QA is made.
- Windows launcher execution: the provided batch script was reviewed, but this executor runs Linux.
- GitHub Actions execution is only verifiable after publication and a completed workflow run.

No benchmark, learner study or validated skills certification is claimed.
