"""Package the local editor and its examples. Run from any directory with Python 3."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
output = root / "dist" / f"Open-Precast-Concrete-Studio-{version}.zip"
output.parent.mkdir(exist_ok=True)
files = [root / name for name in ["index.html", "LICENSE", "README.md"]]
for folder in ["src", "public", "examples", "docs"]:
    files.extend(sorted(path for path in (root / folder).rglob("*") if path.is_file()))

with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(root))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {p.relative_to(root).as_posix() for p in files}
print(f"{output.name}  SHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}")
