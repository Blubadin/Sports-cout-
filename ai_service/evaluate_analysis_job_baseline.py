"""Verify this phase independently of pre-existing dirty player pipeline changes."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-ref", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    import torch
    import ultralytics.utils.torch_utils as torch_utils
    torch_utils.NUM_THREADS = 1
    torch.set_num_threads(1)
    root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(root))
    sys.path.insert(0, str(root / "ai_service"))
    with tempfile.TemporaryDirectory(prefix="sportscout-contract-baseline-") as folder:
        for name in ("ground_position", "semantic_identity", "analyzer_v2"):
            source = subprocess.check_output(["git", "show", f"{args.baseline_ref}:ai_service/{name}.py"], cwd=root)
            path = Path(folder) / f"{name}.py"
            path.write_bytes(source)
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
            sys.modules[f"ai_service.{name}"] = module
        sys.path.insert(0, str(root / "ai_service/tests"))
        suite = unittest.TestSuite()
        for path in sorted((root / "ai_service/tests").glob("test_*.py")):
            if path.name != "test_player_eligibility_pipeline.py":
                suite.addTests(unittest.defaultTestLoader.loadTestsFromName(path.stem))
        started = time.monotonic()
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        evidence = {
            "scope": "Current phase changes; three pre-existing dirty player files loaded from specified Git baseline; unrelated player eligibility suite excluded",
            "baselineSHA": subprocess.check_output(["git", "rev-parse", args.baseline_ref], cwd=root, text=True).strip(),
            "testsRun": result.testsRun, "skipped": len(result.skipped),
            "failures": [test.id() for test, _ in result.failures],
            "errors": [test.id() for test, _ in result.errors],
            "elapsedSec": round(time.monotonic() - started, 3),
            "status": "PASS" if result.wasSuccessful() else "FAIL",
        }
        Path(args.output).write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        raise SystemExit(not result.wasSuccessful())


if __name__ == "__main__":
    main()
