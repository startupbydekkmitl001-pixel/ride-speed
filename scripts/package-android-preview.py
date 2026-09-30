#!/usr/bin/env python3
"""Validate and package a CI preview APK, never a Play/store signing artifact."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import zipfile

ABIS = ["arm64-v8a", "x86_64"]
TEMPLATE_DEBUG_KEY_SHA256 = "221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58"


def parse_badging(text, package, version, version_code):
    package_line = re.search(r"^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'", text, re.M)
    # Current AAPT2 prints minSdkVersion (AOSP d228691c8c4e); older AAPT used
    # sdkVersion. Exactly one declaration is required, regardless of label.
    minimum = re.findall(r"^(?:minSdkVersion|sdkVersion):'([0-9]+)'$", text, re.M)
    target = re.findall(r"^targetSdkVersion:'([0-9]+)'$", text, re.M)
    native = re.search(r"^native-code:\s*(.*)$", text, re.M)
    if not package_line or package_line.groups() != (package, str(version_code), version):
        raise ValueError("APK package/version does not match the initiating CI build")
    if minimum != ["24"] or target != ["36"] or "application-debuggable" in text:
        raise ValueError("Expected non-debuggable SDK 57 preview: Android API 24 minimum, target 36")
    abis = sorted(re.findall(r"'([^']+)'", native[1])) if native else []
    if abis != ABIS:
        raise ValueError("APK must contain exactly arm64-v8a and x86_64 preview ABIs")
    permissions = set(re.findall(r"^uses-permission(?:-sdk-[0-9]+)?: name='([^']+)'", text, re.M))
    if not {"android.permission.INTERNET", "android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"} <= permissions:
        raise ValueError("APK is missing network or foreground location permissions")
    if "android.permission.ACCESS_BACKGROUND_LOCATION" in permissions:
        raise ValueError("M2 preview must not request background location")
    return {"package": package, "version": version, "version_code": int(version_code), "min_sdk": 24, "target_sdk": 36, "abis": abis}


def signer_digest(text, expected):
    if not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("Expected certificate digest is not SHA-256")
    certificates = re.findall(r"^Signer #[0-9]+ certificate SHA-256 digest:\s*([a-fA-F0-9]+)\s*$", text, re.M)
    if len(certificates) != 1 or certificates[0].lower() != expected:
        raise ValueError("APK signer is not the checked Expo template debug certificate")
    return expected


def validate_zip(path, abis):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            raise ValueError("APK has duplicate ZIP paths")
        for entry in entries:
            name = entry.filename
            if name.startswith("/") or "\\" in name or ".." in PurePosixPath(name).parts:
                raise ValueError("APK has unsafe ZIP paths")
            if re.search(r"\.(?:keystore|jks|p12|pem|key)$", name, re.I):
                raise ValueError("APK contains signing material")
        if "AndroidManifest.xml" not in names or "assets/index.android.bundle" not in names or archive.getinfo("assets/index.android.bundle").file_size == 0:
            raise ValueError("Standalone APK requires a manifest and embedded JavaScript")
        dex = [name for name in names if re.fullmatch(r"classes(?:[0-9]+)?\.dex", name)]
        binding = any(b"Lorg/maplibre/reactnative/MLRNPackage;" in archive.read(name) for name in dex)
        if not binding:
            raise ValueError("APK is missing the MapLibre React Native binding")
        for abi in abis:
            for library in ["libmaplibre.so", "librnskia.so"]:
                name = f"lib/{abi}/{library}"
                if name not in names or not archive.read(name).startswith(b"\x7fELF"):
                    raise ValueError(f"APK is missing native {library} for {abi}")
    return {"bundled_javascript": True, "maplibre_binding": True, "maplibre_native_abis": list(abis), "skia_native_abis": list(abis)}


def gradle_block(source, name):
    # Ignore braces inside quoted strings and comments while finding a DSL block.
    masked = re.sub(r'''/\*.*?\*/|//[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*' ''',
                    lambda match: " " * len(match[0]), source, flags=re.S | re.X)
    match = re.search(r"\b" + re.escape(name) + r"\s*\{", masked)
    if not match:
        raise ValueError(f"Generated Gradle file lacks {name} block")
    start, depth = match.end(), 1
    for i in range(start, len(masked)):
        if masked[i] == "{":
            depth += 1
        elif masked[i] == "}":
            depth -= 1
            if depth == 0:
                return source[start:i]
    raise ValueError("Generated Gradle block is unterminated")


def validate_gradle(source, package, version, version_code):
    for name, expected in [("namespace", package), ("applicationId", package), ("versionName", version)]:
        values = re.findall(r"\b" + name + r'''\s+["']([^"']+)["']''', source)
        if values != [expected]:
            raise ValueError(f"Generated {name} differs from the preview identity")
    if re.findall(r"\bversionCode\s+(\d+)\b", source) != [str(version_code)]:
        raise ValueError("Generated Android versionCode differs from the CI identity")
    release = gradle_block(gradle_block(source, "buildTypes"), "release")
    if re.findall(r"\bsigningConfig\s+signingConfigs\.(\w+)", release) != ["debug"] or re.search(r"\bdebuggable\s*(?:=\s*)?true\b", release):
        raise ValueError("Preview must bundle Release JS using only the template debug signing configuration")
    debug = gradle_block(gradle_block(source, "signingConfigs"), "debug")
    checks = [r'''storeFile\s+file\(["']debug\.keystore["']\)''', r'''storePassword\s+["']android["']''',
              r'''keyAlias\s+["']androiddebugkey["']''', r'''keyPassword\s+["']android["']''']
    if not all(re.search(pattern, debug) for pattern in checks):
        raise ValueError("Generated preview signer is not the public Expo debug configuration")


def verify_prebuild(project, template, package, version, version_code):
    android = Path(project)
    validate_gradle((android / "app/build.gradle").read_text(encoding="utf-8"), package, version, version_code)
    with tarfile.open(template, "r:gz") as archive:
        wrapper = archive.extractfile("package/android/gradle/wrapper/gradle-wrapper.properties").read()
        key = archive.extractfile("package/android/app/debug.keystore").read()
    if hashlib.sha256(key).hexdigest() != TEMPLATE_DEBUG_KEY_SHA256 or (android / "app/debug.keystore").read_bytes() != key:
        raise ValueError("Preview key differs from the reviewed SDK 57 template")
    generated = (android / "gradle/wrapper/gradle-wrapper.properties").read_bytes()
    if generated.replace(b"\r\n", b"\n") != wrapper.replace(b"\r\n", b"\n"):
        raise ValueError("Generated Gradle wrapper was changed outside Expo Prebuild")
    return {"generated_project_checked": True, "debug_keystore_sha256": TEMPLATE_DEBUG_KEY_SHA256,
            "gradle_distribution": re.search(r"distributionUrl=(.*)", wrapper.decode())[1].replace("\\:", ":")}


def package_preview(args):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", args.version) or not re.fullmatch(r"[1-9][0-9]{0,3}\.[1-9][0-9]?\.[0-9]{1,2}", args.build_number):
        raise ValueError("Artifact version/build number must be the validated numeric CI identity")
    run, attempt, patch = map(int, args.build_number.split("."))
    if args.version_code != run * 10000 + attempt * 100 + patch:
        raise ValueError("Android versionCode differs from the initiating CI build identity")
    apk = Path(args.apk)
    identity = parse_badging(Path(args.badging).read_text(encoding="utf-8"), args.package, args.version, args.version_code)
    certificate = hashlib.sha256(Path(args.certificate).read_bytes()).hexdigest()
    signer_digest(Path(args.signature).read_text(encoding="utf-8"), certificate)
    assets = validate_zip(apk, identity["abis"])
    build = json.loads(Path(args.build_info).read_text(encoding="utf-8"))
    if not re.fullmatch(r"[0-9a-f]{40}", build.get("commit", "")) or build.get("app_variant") != "release":
        raise ValueError("Build provenance requires the initiating commit and release app configuration")
    output = Path(args.output)
    if output.exists() and any(output.iterdir()):
        raise ValueError("Artifact destination is not empty; do not publish stale preview files")
    output.mkdir(parents=True, exist_ok=True)
    name = f"RideSpeed-{args.version}-{args.build_number}-android-preview-debug-signed.apk"
    destination = output / name
    shutil.copyfile(apk, destination)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    manifest = {"schema_version": 1, "artifact_kind": "android-standalone-preview", "store_release": False,
                "signing": {"kind": "public-expo-template-debug", "certificate_sha256": certificate},
                "apk": {"file": name, "bytes": destination.stat().st_size, "sha256": digest, **identity, **assets},
                "build_number": args.build_number, "built_at": datetime.now(timezone.utc).isoformat(), "build": build,
                "acceptance": {"native_compilation": "passed-on-ci", "physical_device": "pending", "gps_performance": "pending"}}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {name}\n", encoding="utf-8")
    (output / "PREVIEW.txt").write_text(
        "Ride Speed Android preview — public debug signing certificate, NOT a Play/store release.\n"
        "Includes standalone Release JavaScript; Metro is not required. Android 7+ on arm64-v8a/x86_64.\n"
        "Install with adb install -r <APK>, or open the APK on your test device.\n"
        "A future store certificate will differ; switching may require uninstalling this preview and removes its local data.\n"
        "Physical map/GPS, offline recovery, account switching and performance acceptance remain pending.\n", encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    generated = commands.add_parser("verify-prebuild")
    generated.add_argument("--project", required=True)
    generated.add_argument("--template", required=True)
    bundle = commands.add_parser("package")
    for name in ["apk", "output", "badging", "signature", "certificate", "build-info", "build-number"]:
        bundle.add_argument(f"--{name}", required=True)
    for command in [generated, bundle]:
        command.add_argument("--package", required=True)
        command.add_argument("--version", required=True)
        command.add_argument("--version-code", type=int, required=True)
    args = parser.parse_args()
    if args.command == "verify-prebuild":
        result = verify_prebuild(args.project, args.template, args.package, args.version, args.version_code)
    else:
        result = package_preview(args)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
