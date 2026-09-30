"""Check Expo-generated native settings before spending time on compilation."""
import json
from pathlib import Path
import sys

ios = Path(sys.argv[1])
variant = sys.argv[2]
props = json.loads((ios / "Podfile.properties.json").read_text())
assert props.get("ios.deploymentTarget") == "17.0", props
settings = json.loads(Path(sys.argv[3]).read_text())
applications = [entry["buildSettings"] for entry in settings if entry["buildSettings"].get("WRAPPER_EXTENSION") == "app"]
assert len(applications) == 1, "Expected one application target"
# Project defaults and dependency targets can legitimately keep an older floor.
# Check the resolved application setting that Xcode will actually build.
assert applications[0].get("IPHONEOS_DEPLOYMENT_TARGET") == "17.0", applications[0].get("IPHONEOS_DEPLOYMENT_TARGET")
expected_id = "com.arnalxz.ridespeed" + (".dev" if variant == "development" else "")
assert applications[0].get("PRODUCT_BUNDLE_IDENTIFIER") == expected_id
pods = (ios / "Podfile.lock").read_text()
development_pods = ("expo-dev-client", "expo-dev-launcher", "expo-dev-menu")
if variant == "release":
    assert not any(name in pods for name in development_pods), "Dev-client linked into Release"
else:
    assert all(name in pods for name in development_pods), "Development client is incomplete"
for language in ("en", "th"):
    assert list(ios.glob(f"*/Supporting/{language}.lproj/InfoPlist.strings")), language
print(f"Generated {variant} project: iOS 17.0, expected native dependencies, en/th permissions.")
