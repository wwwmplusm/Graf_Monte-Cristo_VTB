"""
Legacy helper moved to hktn/experiments/data_export_playground.py.

The old hardcoded credentials were removed to keep the repository clean.
Use the experiments script instead:

    python -m hktn.experiments.data_export_playground
"""

if __name__ == "__main__":
    from hktn.experiments.data_export_playground import run_export_for_user, TARGET_USERS

    for uid in TARGET_USERS:
        run_export_for_user(uid)
