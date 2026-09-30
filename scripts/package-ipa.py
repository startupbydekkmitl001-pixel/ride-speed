"""Validate and package an unsigned iPhone archive. Uses only Python's stdlib and Xcode tools."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import subprocess
import sys
import tempfile
import zipfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_info(info, variant, version, build_number):
    expected_id = "com.arnalxz.ridespeed" + (".dev" if variant == "development" else "")
    require(info.get("CFBundleIdentifier") == expected_id, "Unexpected bundle identifier")
    require(info.get("CFBundleShortVersionString") == version, "Version mismatch")
    require(info.get("CFBundleVersion") == build_number, "Build number mismatch")
    require(info.get("MinimumOSVersion") == "17.0", "Expected minimum iOS 17.0")
    require(info.get("CFBundleSupportedPlatforms") == ["iPhoneOS"], "Not an iPhone device application")
    executable = info.get("CFBundleExecutable", "")
    require(bool(executable) and PurePosixPath(executable).name == executable and "/" not in executable, "Invalid executable name")
    require(info.get("NSLocationWhenInUseUsageDescription"), "Missing foreground location permission")
    return executable


def validate_zip(ipa, variant, version, build_number):
    with zipfile.ZipFile(ipa) as archive:
        names = archive.namelist()
        require(archive.testzip() is None, "Corrupt IPA")
        require(len(names) == len(set(names)), "Duplicate archive paths")
        require(all(name.startswith("Payload/") and ".." not in PurePosixPath(name).parts for name in names), "IPA must contain only Payload/")
        roots = {PurePosixPath(name).parts[1] for name in names if len(PurePosixPath(name).parts) > 1}
        require(len(roots) == 1 and next(iter(roots)).endswith(".app"), "Expected one app at Payload/*.app")
        root = f"Payload/{next(iter(roots))}"
        info = plistlib.loads(archive.read(f"{root}/Info.plist"))
        executable = validate_info(info, variant, version, build_number)
        require(archive.getinfo(f"{root}/{executable}").file_size > 0, "Missing executable")
        if variant == "release":
            require(archive.getinfo(f"{root}/main.jsbundle").file_size > 0, "Release requires an embedded JavaScript bundle")
        require(not any(name.endswith("embedded.mobileprovision") for name in names), "Provisioning material must not be published")
        return info


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def package(args):
    require(sys.platform == "darwin", "Native archive verification must run on macOS with Xcode")
    apps = list((args.archive / "Products" / "Applications").glob("*.app"))
    require(len(apps) == 1, "Expected exactly one archived application")
    app = apps[0]
    info = plistlib.loads((app / "Info.plist").read_bytes())
    executable = app / validate_info(info, args.variant, args.version, args.build_number)
    architectures = command("xcrun", "lipo", "-archs", str(executable)).split()
    require(architectures == ["arm64"], f"Expected arm64, got {architectures}")
    load_commands = command("xcrun", "vtool", "-show-build", str(executable))
    require(re.search(r"platform\s+IOS\s", load_commands) is not None, "Mach-O platform must be iOS, not simulator")
    require(re.search(r"minos\s+17\.0(?:\.0)?\s", load_commands) is not None, "Mach-O deployment target mismatch")
    signature = subprocess.run(["codesign", "-dv", str(app)], capture_output=True, text=True)
    require(signature.returncode != 0 and "not signed at all" in signature.stderr, "Main app must be unsigned")
    args.output.mkdir(parents=True, exist_ok=True)
    basename = f"RideSpeed-{args.version}-{args.build_number}-{args.variant}-unsigned"
    ipa = args.output / f"{basename}.ipa"
    require(not ipa.exists(), "Refusing to replace an existing artifact")
    with tempfile.TemporaryDirectory(prefix="ridespeed-payload-") as temporary:
        payload = Path(temporary) / "Payload"
        payload.mkdir()
        command("ditto", str(app), str(payload / app.name))
        command("ditto", "-c", "-k", "--keepParent", "--norsrc", str(payload), str(ipa))
    validate_zip(ipa, args.variant, args.version, args.build_number)
    digest = hashlib.file_digest(ipa.open("rb"), "sha256").hexdigest()
    (args.output / f"{basename}.sha256").write_text(f"{digest}  {ipa.name}\n")
    app_root = Path(__file__).resolve().parents[1] / "ExpoRideSpeed"
    pkg = json.loads((app_root / "package.json").read_text())
    metadata = {
        "artifact": ipa.name, "sha256": digest, "variant": args.variant,
        "bundleIdentifier": info["CFBundleIdentifier"], "version": args.version,
        "buildNumber": args.build_number, "minimumOSVersion": info["MinimumOSVersion"],
        "architectures": architectures, "platform": "iPhoneOS", "signed": False,
        "xcode": command("xcodebuild", "-version"), "node": command("node", "--version"),
        "cocoaPods": command("pod", "--version"), "dependencies": pkg["dependencies"],
        "commit": os.environ.get("GITHUB_SHA", "local"),
        "workflowRun": os.environ.get("GITHUB_RUN_ID", "local"),
        "workflowAttempt": os.environ.get("GITHUB_RUN_ATTEMPT", "local"),
        "deviceInstallationTested": False,
    }
    (args.output / f"{basename}.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--variant", choices=["release", "development"], required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--build-number", required=True)
    package(parser.parse_args())
