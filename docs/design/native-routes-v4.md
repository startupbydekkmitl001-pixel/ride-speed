# Native route editor v4

Implemented in `ExpoRideSpeed/src/app/(tabs)/routes.tsx`, `src/components/RouteMap.tsx` and `RouteMap.web.tsx`.

The iOS map uses react-native-maps 1.27.2 with its default Apple provider. It opens over Thailand, without requesting location. The locate control requests foreground permission only when tapped, fetches one position, and labels its pin as the last searched position. No location watcher or background tracking is started by this editor. The map supports long-press pins, labelled stop selection and fitting the saved points. [Expo SDK 57 maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/), [location](https://docs.expo.dev/versions/v57.0.0/sdk/location/).

Stops can be added and edited with explicit latitude/longitude fields, named, reordered and removed. Routes require 2–12 points. The dashed geographic line is explicitly described as stop order, not driving directions. The distance is explicitly a direct connection between points. Web and unconfigured non-iOS platforms show an honest coordinate-entry fallback instead of a fake map or blank Google map.

Local save uses the existing AppState storage. Cloud save is an explicit authenticated action, sending the named arguments in `backend/API.md` to `rs_save_route`. A cloud UUID and optimistic revision remain separate from local IDs. A missing or conflicting revision requires loading the cloud copy; the UI does not silently force an overwrite. Download adds previously unseen own routes and preserves existing local versions. Replacing an existing local copy and cloud deletion both require an in-app confirmation. Cloud results are ignored after an account change.

The closed-course switch records the user's local description. It does not approve the route for timed competition; the adjacent explanation makes that distinction. Server course/session approval remains separate.

Validation: full app TypeScript check passed; ESLint passed for all three owned files. Route-domain smoke checks passed for 1/2/12/13-stop boundaries, legal/illegal coordinates, nonmutating reorder and zero/nonzero distances. A full app lint run identified issues in other concurrently edited files and those were reported to their owner. Actual Apple Maps gestures, permission prompts and cloud RPC round-trips still require device/integration verification. The parent task owns final browser and native build verification.
