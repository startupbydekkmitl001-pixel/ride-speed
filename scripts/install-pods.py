#!/usr/bin/env python3
"""Retry only identified transient Hermes downloads; keep all CocoaPods diagnostics."""
import argparse
from pathlib import Path
import re
import subprocess
import sys
import time


ATTEMPTS = 3
RETRY_DELAYS = (15, 30)
# Resolve/connect errors, incomplete transfers, timeouts, empty responses, send/receive
# resets and HTTP/2 stream failures. Certificate, HTTP and local-file errors fail closed.
TRANSIENT_CURL_CODES = {5, 6, 7, 18, 28, 52, 55, 56, 92}


def transient_hermes_download(output):
    codes = {int(code) for code in re.findall(r"curl:\s*\((\d+)\)", output)}
    hermes_aborted = re.search(r"\[Hermes\] Failed to download hermes-ios-\S+ from \S+\. Aborting\.", output)
    return bool(hermes_aborted and codes and codes <= TRANSIENT_CURL_CODES)


def install_pods(project_directory, log_directory, *, pod_command=("pod",), sleep=time.sleep, console=None):
    project_directory = Path(project_directory).resolve()
    log_directory = Path(log_directory).resolve()
    log_directory.mkdir(parents=True, exist_ok=True)
    console = sys.stdout if console is None else console
    command = [*pod_command, "install", f"--project-directory={project_directory}"]

    # RN 0.86's hermes-utils.rb downloads to Pods/hermes-engine-artifacts/
    # hermes-ios.download and renames only after curl succeeds. A retry overwrites
    # that partial temporary file. Do not delete completed tarballs, Pods, lockfiles,
    # or shared caches; in particular do not bypass upstream checksum validation.
    with (log_directory / "pods.log").open("w", encoding="utf-8") as combined:
        def emit(text, attempt_log=None):
            console.write(text)
            console.flush()
            combined.write(text)
            combined.flush()
            if attempt_log is not None:
                attempt_log.write(text)
                attempt_log.flush()

        for attempt in range(1, ATTEMPTS + 1):
            lines = []
            with (log_directory / f"pods-attempt-{attempt}.log").open("w", encoding="utf-8") as attempt_log:
                emit(f"[pod-install] Attempt {attempt}/{ATTEMPTS}\n", attempt_log)
                try:
                    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                               text=True, encoding="utf-8", errors="replace", bufsize=1)
                except OSError as error:
                    emit(f"[pod-install] Unable to start CocoaPods: {error}\n", attempt_log)
                    code = 127 if isinstance(error, FileNotFoundError) else 126
                else:
                    with process:
                        for line in process.stdout:
                            lines.append(line)
                            emit(line, attempt_log)
                        code = process.wait()
                emit(f"[pod-install] Attempt {attempt} finished with exit {code}\n", attempt_log)

            if code == 0:
                return 0
            if not (0 < code < 128) or attempt == ATTEMPTS or not transient_hermes_download("".join(lines)):
                emit(f"[pod-install] Stopping with exit {code}; diagnostics retained in {log_directory}\n")
                return code
            delay = RETRY_DELAYS[attempt - 1]
            emit(f"[pod-install] Transient Hermes download failure; retrying in {delay}s.\n")
            sleep(delay)
    raise AssertionError("Pod install exhausted attempts without an exit status")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-directory", type=Path, required=True)
    parser.add_argument("--log-directory", type=Path, required=True)
    args = parser.parse_args()
    code = install_pods(args.project_directory, args.log_directory)
    return 128 - code if code < 0 else code


if __name__ == "__main__":
    sys.exit(main())
