# Phase 2 Build and Design Preview Implementation Plan

> **For agentic workers:** Use the existing research and this plan to implement the build task, then review its complete output. Screen implementation requires the user's screenshot approval.

**Goal:** Prepare reproducible unsigned Release/development IPA builds and a concrete Thai speedometer design for review.

**Architecture:** Keep the existing Expo prototype as the build smoke-test payload. Generate iOS through Expo prebuild, compile without signing on standard public GitHub macOS runners, package a real device app, and let each tester sign locally. The approved design will precede implementation of the native recorder and new screens.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, GitHub Actions, Xcode 26.4+, Node 22.13+.

**Spec:** [Research and phase boundary](../../../RESEARCH.md), [architecture](../../ARCHITECTURE.md), [build research](../../research/build-and-sideloading.md), [test plan](../../TEST_PLAN.md). Original user brief requests build pipeline first and screenshots before screen implementation.

## Global constraints

- iOS 17 minimum; initial device is iPhone 14 Plus running iOS 26.
- Windows development, free Apple IDs via Sideloadly, free services only.
- Public source hosting is selected. Private ride data and signing secrets are excluded.
- Do not hand-edit generated native directories. Follow ExpoRideSpeed/AGENTS.md.
- Do not implement a new product screen before screenshot approval.
- This step must not claim native recording, measured accuracy or installed IPA success.

## Review focus

- Release app accidentally depends on Metro: inspect bundled JS in the packaged app.
- Simulator output mislabeled as installable IPA: validate device platform and arm64 executable.
- Development-client code leaks into Release: verify configuration-specific native dependency exclusion.
- Rerunning a workflow replaces an earlier build or changes bundle identity: record fixed identifiers and monotonically increasing build numbers.
- Public artifact exposes routes or signing material: package only the app, checksums and sanitized build metadata.

## Task 1: Cloud build and local configuration

**Own files:** .github/workflows/ios-unsigned.yml; scripts for build/package verification; ExpoRideSpeed/app config, package.json/package-lock.json, localized permission files; docs/BUILD_WINDOWS.md.

**Interface:** Workflow dispatch produces both an unsigned Release IPA and a development IPA. Version tags produce a GitHub Release with downloadable Release IPA, checksum, short Thai changelog and an explicit signing-required label.

- [ ] Fetch matching versioned Expo configuration/build/dev-client docs and confirm installed packages.
- [ ] Add SDK-compatible development client and build configuration using expo install.
- [ ] Set fixed app identifiers, deployment target and version/build-number rules in config.
- [ ] Implement clean prebuild, unsigned device xcodebuild, app validation and Payload packaging.
- [ ] Keep ordinary workflow jobs read-only; grant release-write permission only to the publishing job.
- [ ] Run existing tests, lint, typecheck, Expo config resolution and appropriate workflow/script checks.
- [ ] Document exact Windows cloud-build/install/Metro steps and distinguish existing foreground prototype from future native recorder.

## Task 2: Screen design for approval

**Own files:** docs/design/phase2-speedometer-v1.md and generated preview images.

**Interface:** A preview shows Thai dark/light riding screens, quality failures and permission states using the proposed research tokens. It contains fictional sample data explicitly labeled as a mockup outside the app frame.

- [ ] Define hierarchy, typography, colors, touch targets and state behavior in the design document.
- [ ] Generate dark/light speedometer screenshots with a huge speed value, quality label, vehicle profile, sustained maximum/reset and session action.
- [ ] Generate no-fix/weak-fix/permission and large-text previews for review.
- [ ] Inspect images, flag Thai wording for native-speaker review and preserve the generation prompts.
- [ ] Present the previews and request design approval as the final step before implementing screens.

## Task 3: GitHub connection and build verification

**Own files:** Git remote configuration; README/status and results log.

- [ ] Identify available GitHub account/repository access without exposing credentials.
- [ ] Inspect the exact files intended for public publication and ignore local output/private evidence.
- [ ] Publish to the selected public repository when account access permits, then run the workflow.
- [ ] Inspect real build logs and resulting IPA contents; fix build failures before claiming success.
- [ ] If authentication or repository access is unavailable, leave the complete local workflow and give the precise remaining user action.
- [ ] Update the feature checklist with prepared, built and device-tested states separately.

## Execution record

- Phase 2 preparation accepted after user asked what comes next.
- Initial GitHub connector identifies an account but returns no accessible repositories; local Git has no remote and no commits.
- No app screens are approved yet. Build configuration and mockups can proceed independently.
- Task 1 prepared and reviewed: 12 existing tests and 6 IPA fixtures pass; lint/typecheck/configuration and script checks pass. Full development dependencies restored after verifying production omission.
- Review correction: inspect resolved application build settings instead of every project/dependency deployment-target declaration.
- Draft 1 previews generated and saved; user requested a revision. Design direction is pending and no screen implementation began.
- Public repository created at https://github.com/startupbydekkmitl001-pixel/ride-speed; local origin configured. Cloud compilation and device installation remain unverified.
- First cloud proof: commit 48ce49a, run 36725855154, Release and development 0.1.0 (2.1.0) built successfully. Both artifacts downloaded under ignored build/downloads and SHA-256 verified. Native app screens and on-device behavior remain unverified.
