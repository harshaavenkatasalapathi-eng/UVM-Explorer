# UVM Explorer MVP

A local-first SystemVerilog editor and UVM source browser. The MVP includes a Monaco-based editor, click-to-peek lookup, a full source side panel, symbol search, and separate indexes for UVM 1.2 and UVM 1800.2-2020.

> This is a source-navigation MVP. The indexer uses lightweight pattern matching for class/macro/function/task declarations; it is not a complete SystemVerilog parser or preprocessor. Macro expansion and context-aware overload resolution are planned follow-up milestones.

## 1. Prerequisites

- Git
- Python 3.10+
- Node.js 20+ and npm

## 2. Get the UVM source locally

From the project root:

```bash
mkdir -p uvm_source

git clone --depth 1 https://github.com/nitronis/UVM.git /tmp/uvm-repo

mkdir -p uvm_source/1800.2-2020 uvm_source/1.2
cp -a /tmp/uvm-repo/1800.2-2020/src uvm_source/1800.2-2020/
cp -a /tmp/uvm-repo/1.2/src uvm_source/1.2/
```

The Nitronis mirror contains both selected source trees, so one clone supplies both versions. The folder layout expected by this project is:

```text
uvm_source/
  1.2/
    src/**/*.svh
    src/**/*.sv
  1800.2-2020/
    src/**/*.svh
    src/**/*.sv
```

The linked Nitronis repository describes itself as a mirror of Accellera reference implementations and lists UVM 1.2 and IEEE 1800.2-2020. Check the repository and upstream licensing terms before redistributing source with a hosted service. See the [mirror](https://github.com/nitronis/UVM) and [Accellera downloads](https://eda.org/downloads/standards/uvm).

## 3. Start the backend

Open a terminal:

```bash
cd backend
python -m venv .venv
```

Activate the environment:

- Windows PowerShell: `.venv\\Scripts\\Activate.ps1`
- macOS/Linux: `source .venv/bin/activate`

Install dependencies and build the indexes:

```bash
pip install -r requirements.txt
python run_indexer.py
```

Start FastAPI:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check `http://localhost:8000/api/health` and `http://localhost:8000/docs`.

## 4. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## 5. Test the MVP

1. Confirm both source trees exist and the backend indexer reports files and symbols.
2. Open the website.
3. Select UVM 1800.2-2020 or UVM 1.2.
4. Click `uvm_driver` or `uvm_component_utils` in the editor. The source should appear in a peek window and in the right panel.
5. Search for a symbol such as `uvm_component`, `uvm_info`, or `uvm_analysis_port` in the left sidebar.

## 6. API endpoints

- `GET /api/health`
- `GET /api/versions`
- `GET /api/search?q=uvm_driver&version=1800.2-2020`
- `GET /api/lookup/uvm_driver?version=1800.2-2020`
- `GET /api/source?file=comps/uvm_driver.svh&version=1800.2-2020`

## Notes

- Source files are read from local disk. Clicking a symbol does not make a GitHub request.
- Re-run `python run_indexer.py` after updating either source checkout.
- The frontend currently treats `uvm_*` and `UVM_*` tokens as candidate UVM symbols. User-defined symbols are not indexed from the editor and will not resolve unless their names collide with UVM symbols.
- The right panel displays the complete source file; the peek window displays the indexed declaration area.
- Click-to-peek and the right-side source panel are implemented in this MVP. Full F12 / Go to Definition navigation into virtual source documents is a later enhancement.
