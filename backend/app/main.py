from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = Path(__file__).resolve().parents[2]
SOURCE_ROOT = Path(os.getenv("UVM_SOURCE_ROOT", BASE_DIR / "uvm_source"))
INDEX_ROOT = Path(os.getenv("UVM_INDEX_ROOT", BASE_DIR / "backend" / "data"))
VERSION_FOLDERS = {
    "1.2": "1.2",
    "1800.2-2020": "1800.2-2020",
}

app = FastAPI(title="UVM Explorer API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _index_path(version: str) -> Path:
    safe = version.replace(".", "_").replace("-", "_")
    return INDEX_ROOT / f"{safe}.json"


def _load_index(version: str) -> dict[str, Any]:
    if version not in VERSION_FOLDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported UVM version: {version}")
    path = _index_path(version)
    if not path.exists():
        raise HTTPException(status_code=503, detail=f"Index for UVM {version} is missing. Run: python scripts/build_index.py")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "uvm-explorer", "versions": list(VERSION_FOLDERS)}


@app.get("/api/versions")
def versions():
    result = []
    for version, folder in VERSION_FOLDERS.items():
        index_exists = _index_path(version).exists()
        source_exists = (SOURCE_ROOT / folder).exists()
        result.append({"version": version, "indexed": index_exists, "source_available": source_exists})
    return result


@app.get("/api/search")
def search(q: str = Query(min_length=1), version: str = "1800.2-2020", limit: int = 30):
    index = _load_index(version)
    needle = q.lower()
    results = []
    for name, entries in index["symbols"].items():
        if needle in name.lower():
            for entry in entries:
                results.append({k: v for k, v in entry.items() if k != "source_path"})
                if len(results) >= min(limit, 100):
                    return results
    return results


@app.get("/api/lookup/{symbol}")
def lookup(symbol: str, version: str = "1800.2-2020"):
    index = _load_index(version)
    entries = index["symbols"].get(symbol)
    if not entries:
        raise HTTPException(status_code=404, detail=f"No UVM definition indexed for '{symbol}' in version {version}")

    # Prefer class/macro records before method records if duplicate names exist.
    priority = {"class": 0, "macro": 1, "method": 2}
    entry = sorted(entries, key=lambda item: priority.get(item["type"], 9))[0]
    source_dir = SOURCE_ROOT / VERSION_FOLDERS[version]
    file_path = (source_dir / entry["file"]).resolve()
    if source_dir.resolve() not in file_path.parents:
        raise HTTPException(status_code=400, detail="Invalid source path")
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Indexed source file no longer exists")

    lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
    start = max(1, entry["start_line"])
    end = min(len(lines), max(entry["end_line"], start + 35))
    definition = "\n".join(lines[start - 1:end])
    complete_source = "\n".join(lines)
    return {
        "symbol": symbol,
        "type": entry["type"],
        "version": version,
        "file": entry["file"],
        "start_line": start,
        "end_line": entry["end_line"],
        "definition": definition,
        "source": complete_source,
        "matches": [{k: v for k, v in item.items() if k != "source_path"} for item in entries],
    }


@app.get("/api/source")
def get_source(file: str, version: str = "1800.2-2020"):
    if version not in VERSION_FOLDERS:
        raise HTTPException(status_code=400, detail="Unsupported UVM version")
    source_dir = (SOURCE_ROOT / VERSION_FOLDERS[version]).resolve()
    file_path = (source_dir / file).resolve()
    if source_dir not in file_path.parents:
        raise HTTPException(status_code=400, detail="Invalid source path")
    if not file_path.is_file() or file_path.suffix.lower() not in {".sv", ".svh"}:
        raise HTTPException(status_code=404, detail="Source file not found")
    return {"file": file, "version": version, "source": file_path.read_text(encoding="utf-8", errors="replace")}
