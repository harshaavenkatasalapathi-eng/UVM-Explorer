from pathlib import Path
from app.indexer import build_all

BASE = Path(__file__).resolve().parent
SOURCE_ROOT = BASE.parent / "uvm_source"
INDEX_ROOT = BASE / "data"
VERSIONS = {"1.2": "1.2", "1800.2-2020": "1800.2-2020"}

if __name__ == "__main__":
    summary = build_all(SOURCE_ROOT, INDEX_ROOT, VERSIONS)
    for version, info in summary.items():
        print(f"UVM {version}: {info['file_count']} files, {info['symbol_count']} unique symbols")
