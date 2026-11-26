from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SOURCE_EXTENSIONS = {".sv", ".svh"}


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _macro_end(text: str, start: int) -> int:
    """Return the end offset of a possibly backslash-continued `define."""
    lines = text[start:].splitlines(keepends=True)
    consumed = 0
    for line in lines:
        consumed += len(line)
        if not line.rstrip("\r\n").rstrip().endswith("\\"):
            break
    return start + consumed


def index_version(source_dir: Path, version: str) -> dict[str, Any]:
    symbols: dict[str, list[dict[str, Any]]] = {}
    if not source_dir.exists():
        return {"version": version, "symbols": symbols, "file_count": 0}

    files = [p for p in source_dir.rglob("*") if p.is_file() and p.suffix.lower() in SOURCE_EXTENSIONS]
    for path in files:
        text = _read_text(path)
        if not text:
            continue
        rel = path.relative_to(source_dir).as_posix()
        found: list[tuple[str, str, int, int]] = []

        # Class declarations. This is a navigation index, not a full SV parser.
        for match in re.finditer(r"(?m)^[ \t]*(?:(?:virtual|local|protected|static)\s+)*class\s+([A-Za-z_$][\w$]*)", text):
            found.append((match.group(1), "class", match.start(), match.end()))

        # Macro definitions, including continuation lines.
        for match in re.finditer(r"(?m)^[ \t]*`define\s+([A-Za-z_$][\w$]*)", text):
            end = _macro_end(text, match.start())
            found.append((match.group(1), "macro", match.start(), end))

        # Function/task declarations. Include common SV qualifiers and return types.
        pattern = r"(?m)^[ \t]*(?:(?:virtual|static|protected|local|extern|pure)\s+)*(?:function|task)\s+(?:(?:automatic|static)\s+)?(?:[\w:$#<>\[\], ]+\s+)?([A-Za-z_$][\w$]*)\s*(?:\(|;|$)"
        for match in re.finditer(pattern, text):
            name = match.group(1)
            # Skip language keywords accidentally matched as a return type.
            if name not in {"function", "task"}:
                found.append((name, "method", match.start(), match.end()))

        for name, kind, start, end in found:
            start_line = _line_number(text, start)
            end_line = _line_number(text, max(start, end - 1))
            record = {
                "name": name,
                "type": kind,
                "file": rel,
                "start_line": start_line,
                "end_line": end_line,
                "source_path": str(path),
            }
            symbols.setdefault(name, []).append(record)

    # Stable order makes results predictable when names occur in multiple files.
    for entries in symbols.values():
        entries.sort(key=lambda item: (item["file"], item["start_line"]))
    return {"version": version, "symbols": symbols, "file_count": len(files)}


def build_all(source_root: Path, index_root: Path, versions: dict[str, str]) -> dict[str, Any]:
    index_root.mkdir(parents=True, exist_ok=True)
    summary = {}
    for version, folder in versions.items():
        result = index_version(source_root / folder, version)
        output = index_root / f"{version.replace('.', '_').replace('-', '_')}.json"
        output.write_text(json.dumps(result, indent=2), encoding="utf-8")
        summary[version] = {
            "file_count": result["file_count"],
            "symbol_count": len(result["symbols"]),
            "index_file": str(output),
        }
    return summary
