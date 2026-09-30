"""Artifact/config fixtures do not pretend to compile native Android on Windows."""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import warnings
import zipfile

spec = importlib.util.spec_from_file_location("android_preview", Path(__file__).with_name("package-android-preview.py"))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)

CERT = "ab" * 32
BADGING = """package: name='com.arnalxz.ridespeed' versionCode='230200' versionName='0.1.0'
sdkVersion:'24'
targetSdkVersion:'36'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.ACCESS_FINE_LOCATION'
uses-permission: name='android.permission.ACCESS_COARSE_LOCATION'
native-code: 'arm64-v8a' 'x86_64'
"""
SIGNATURE = f"Signer #1 certificate DN: CN=Android Debug\nSigner #1 certificate SHA-256 digest: {CERT}\n"


class AndroidPreviewTests(unittest.TestCase):
    def apk(self, omit=None, extra=None):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "fixture.apk"
        files = {
            "AndroidManifest.xml": b"fixture: binary manifest is validated by real aapt2 in CI",
            "assets/index.android.bundle": b"fixture Hermes bundle",
            "classes.dex": b"dex\n039\x00Lorg/maplibre/reactnative/MLRNPackage;",
            "lib/arm64-v8a/libmaplibre.so": b"\x7fELFfixture arm64",
            "lib/x86_64/libmaplibre.so": b"\x7fELFfixture emulator",
            "lib/arm64-v8a/librnskia.so": b"\x7fELFfixture Skia arm64",
            "lib/x86_64/librnskia.so": b"\x7fELFfixture Skia emulator",
        }
        with zipfile.ZipFile(path, "w") as archive:
            for name, value in files.items():
                if name != omit:
                    archive.writestr(name, value)
            for name, value in extra or []:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)  # Deliberately malformed duplicate fixture.
                    archive.writestr(name, value)
        return path

    def test_manifest_identity_and_permissions_require_the_real_release_variant(self):
        value = preview.parse_badging(BADGING, "com.arnalxz.ridespeed", "0.1.0", 230200)
        self.assertEqual(value["min_sdk"], 24)
        self.assertEqual(value["target_sdk"], 36)
        self.assertEqual(value["abis"], ["arm64-v8a", "x86_64"])
        for changed in [BADGING.replace("ridespeed'", "ridespeed.dev'"), BADGING.replace("230200", "230201"),
                        BADGING.replace("targetSdkVersion:'36'", "targetSdkVersion:'35'"), BADGING + "application-debuggable\n",
                        BADGING.replace("android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_BACKGROUND_LOCATION")]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                preview.parse_badging(changed, "com.arnalxz.ridespeed", "0.1.0", 230200)

    def test_only_the_template_debug_certificate_can_be_packaged(self):
        self.assertEqual(preview.signer_digest(SIGNATURE, CERT), CERT)
        for changed in [SIGNATURE.replace(CERT, "cd" * 32), SIGNATURE + SIGNATURE.replace("#1", "#2"), ""]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                preview.signer_digest(changed, CERT)

    def test_standalone_apk_contains_js_and_native_maplibre_for_both_target_abis(self):
        value = preview.validate_zip(self.apk(), ["arm64-v8a", "x86_64"])
        self.assertTrue(value["bundled_javascript"])
        self.assertTrue(value["maplibre_binding"])
        for omitted in ["assets/index.android.bundle", "classes.dex", "lib/x86_64/libmaplibre.so"]:
            with self.subTest(omitted=omitted), self.assertRaises(ValueError):
                preview.validate_zip(self.apk(omit=omitted), ["arm64-v8a", "x86_64"])

    def test_zip_rejects_duplicate_paths_and_accidental_signing_material(self):
        for entries in [[("assets/index.android.bundle", b"duplicate")], [("../outside", b"bad")], [("debug.keystore", b"must not publish")]]:
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                preview.validate_zip(self.apk(extra=entries), ["arm64-v8a", "x86_64"])

    def test_missing_native_skia_prevents_publishing_a_preview(self):
        with self.assertRaises(ValueError):
            preview.validate_zip(self.apk(omit="lib/x86_64/librnskia.so"), ["arm64-v8a", "x86_64"])

    def fixture_arguments(self):
        apk = self.apk()
        directory = apk.parent
        cert = b"fixture certificate; real signatures are verified by apksigner in CI"
        certificate = directory / "public-certificate.der"
        certificate.write_bytes(cert)
        badging = directory / "badging.log"
        badging.write_text(BADGING, encoding="utf-8")
        signature = directory / "signature.log"
        signature.write_text(SIGNATURE.replace(CERT, hashlib.sha256(cert).hexdigest()), encoding="utf-8")
        build = directory / "build.json"
        build.write_text(json.dumps({"commit": "a" * 40, "app_variant": "release"}), encoding="utf-8")
        return SimpleNamespace(apk=apk, output=directory / "artifacts", certificate=certificate, badging=badging,
                               signature=signature, build_info=build, package="com.arnalxz.ridespeed", version="0.1.0",
                               version_code=230200, build_number="23.2.0")

    def test_unsafe_artifact_names_and_mismatched_build_codes_fail_before_writing(self):
        args = self.fixture_arguments()
        for name, value in [("version", "../../outside"), ("build_number", "../../outside"), ("build_number", "23.2.1")]:
            with self.subTest(name=name, value=value):
                changed = SimpleNamespace(**vars(args))
                setattr(changed, name, value)
                with self.assertRaises(ValueError):
                    preview.package_preview(changed)
                self.assertFalse(Path(args.output).exists())

    def test_packaged_manifest_and_checksum_identify_debug_preview_without_device_claims(self):
        args = self.fixture_arguments()
        result = preview.package_preview(args)
        self.assertFalse(result["store_release"])
        self.assertEqual(result["signing"]["kind"], "public-expo-template-debug")
        self.assertEqual(result["acceptance"]["physical_device"], "pending")
        packaged = Path(args.output) / result["apk"]["file"]
        self.assertEqual(result["apk"]["sha256"], hashlib.sha256(packaged.read_bytes()).hexdigest())
        self.assertIn(result["apk"]["sha256"], (Path(args.output) / "SHA256SUMS.txt").read_text())
        self.assertIn("NOT a Play/store release", (Path(args.output) / "PREVIEW.txt").read_text())
        with self.assertRaises(ValueError):
            preview.package_preview(args)  # Reused output cannot silently publish stale artifacts.

    def test_generated_identity_and_preview_signing_are_checked_before_gradle(self):
        source = '''android {
          namespace "com.arnalxz.ridespeed"
          defaultConfig { applicationId "com.arnalxz.ridespeed"; versionCode 230200; versionName "0.1.0" }
          signingConfigs { debug { storeFile file('debug.keystore'); storePassword 'android'; keyAlias 'androiddebugkey'; keyPassword 'android' } }
          buildTypes { debug { signingConfig signingConfigs.debug }; release { signingConfig signingConfigs.debug } }
        }'''
        preview.validate_gradle(source, "com.arnalxz.ridespeed", "0.1.0", 230200)
        for changed in [source.replace("230200", "230201"), source.replace('versionName "0.1.0"', 'versionName "1.0.0"'),
                        source.replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.upload"), source.replace("keyAlias 'androiddebugkey'", "keyAlias 'store'")]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                preview.validate_gradle(changed, "com.arnalxz.ridespeed", "0.1.0", 230200)


if __name__ == "__main__":
    unittest.main()
