"""Exercise the real retry runner with a child-process fixture, without CocoaPods."""
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("install_pods", Path(__file__).with_name("install-pods.py"))
pods = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pods)

FIXTURE = r'''
from pathlib import Path
import os
import sys
scenario = sys.argv[1]
project = Path(next(arg.split("=", 1)[1] for arg in sys.argv[2:] if arg.startswith("--project-directory=")))
count = project / "attempt-count"
attempt = int(count.read_text()) + 1 if count.exists() else 1
count.write_text(str(attempt))
artifacts = project / "Pods" / "hermes-engine-artifacts"
artifacts.mkdir(parents=True, exist_ok=True)
temporary = artifacts / "hermes-ios.download"
if scenario == "success" or (scenario == "recover" and attempt == 2):
    if scenario == "recover":
        assert temporary.read_text() == "partial bytes"
        assert (artifacts / "hermes-ios-good-debug.tar.gz").read_text() == "completed debug archive"
    # Model the installed RN downloader: -o truncates; mv runs only on success.
    temporary.write_text("complete release archive")
    os.replace(temporary, artifacts / "hermes-ios-fixture-release.tar.gz")
    print("Pod installation complete!")
    sys.exit(0)
if scenario == "fatal" or (scenario == "transient-then-fatal" and attempt == 2):
    print("[!] CocoaPods could not find compatible versions for pod Example", file=sys.stderr)
    sys.exit(17)
if scenario == "curl-warning-then-fatal":
    print("curl: (56) Connection reset by peer", file=sys.stderr)
    print("[!] Invalid Podfile file: syntax error", file=sys.stderr)
    sys.exit(19)
if scenario == "certificate":
    print("curl: (60) SSL certificate problem", file=sys.stderr)
else:
    print("curl: (56) Recv failure: Connection reset by peer", file=sys.stderr)
temporary.write_text("partial bytes")
print("[Hermes] Failed to download hermes-ios-fixture-release.tar.gz from https://example.invalid/release.tar.gz. Aborting.", file=sys.stderr)
sys.exit(23)
'''


class PodInstallRetryTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(prefix="pod retry ")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        project, logs = root / "ios project", root / "diagnostics"
        project.mkdir()
        fake = root / "fake pod.py"
        fake.write_text(FIXTURE, encoding="utf-8")
        return project, logs, fake

    def run_fixture(self, scenario, project, logs, fake):
        sleeps, console = [], io.StringIO()
        result = pods.install_pods(project, logs, pod_command=(sys.executable, str(fake), scenario), sleep=sleeps.append, console=console)
        return result, sleeps, console.getvalue()

    def test_transient_failure_then_success_preserves_partial_handling_and_logs(self):
        project, logs, fake = self.fixture()
        artifacts = project / "Pods" / "hermes-engine-artifacts"
        artifacts.mkdir(parents=True)
        completed = artifacts / "hermes-ios-good-debug.tar.gz"
        completed.write_text("completed debug archive")
        result, sleeps, output = self.run_fixture("recover", project, logs, fake)
        self.assertEqual(result, 0)
        self.assertEqual(sleeps, [15])
        self.assertEqual((project / "attempt-count").read_text(), "2")
        self.assertEqual(completed.read_text(), "completed debug archive")
        self.assertEqual((artifacts / "hermes-ios-fixture-release.tar.gz").read_text(), "complete release archive")
        self.assertFalse((artifacts / "hermes-ios.download").exists())
        self.assertIn("curl: (56)", (logs / "pods-attempt-1.log").read_text())
        self.assertIn("Pod installation complete!", (logs / "pods-attempt-2.log").read_text())
        self.assertIn("curl: (56)", (logs / "pods.log").read_text())
        self.assertIn("Pod installation complete!", output)

    def test_repeated_transient_error_stops_after_three_and_preserves_exit_code(self):
        project, logs, fake = self.fixture()
        result, sleeps, output = self.run_fixture("always-fail", project, logs, fake)
        self.assertEqual(result, 23)
        self.assertEqual(sleeps, [15, 30])
        self.assertEqual((project / "attempt-count").read_text(), "3")
        self.assertEqual(len(list(logs.glob("pods-attempt-*.log"))), 3)
        self.assertEqual(output.count("curl: (56)"), 3)
        self.assertIn("exit 23", (logs / "pods.log").read_text())

    def test_non_transient_errors_are_not_retried(self):
        for scenario, status in [("fatal", 17), ("curl-warning-then-fatal", 19), ("certificate", 23)]:
            with self.subTest(scenario=scenario):
                project, logs, fake = self.fixture()
                result, sleeps, _ = self.run_fixture(scenario, project, logs, fake)
                self.assertEqual(result, status)
                self.assertEqual(sleeps, [])
                self.assertEqual((project / "attempt-count").read_text(), "1")

    def test_retry_stops_on_a_new_non_transient_error(self):
        project, logs, fake = self.fixture()
        result, sleeps, _ = self.run_fixture("transient-then-fatal", project, logs, fake)
        self.assertEqual(result, 17)
        self.assertEqual(sleeps, [15])
        self.assertEqual((project / "attempt-count").read_text(), "2")

    def test_success_does_not_retry(self):
        project, logs, fake = self.fixture()
        result, sleeps, _ = self.run_fixture("success", project, logs, fake)
        self.assertEqual(result, 0)
        self.assertEqual(sleeps, [])
        self.assertEqual((project / "attempt-count").read_text(), "1")

    def test_missing_pod_command_fails_once_with_diagnostics(self):
        project, logs, _ = self.fixture()
        sleeps = []
        result = pods.install_pods(project, logs, pod_command=(str(project / "missing-pod"),), sleep=sleeps.append, console=io.StringIO())
        self.assertEqual(result, 127)
        self.assertEqual(sleeps, [])
        self.assertIn("Unable to start", (logs / "pods-attempt-1.log").read_text())


if __name__ == "__main__":
    unittest.main()
