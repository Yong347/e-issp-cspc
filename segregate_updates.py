import os

OUTPUT_FILE = 'system_architecture.txt'

# Essential source extensions
VALID_EXTENSIONS = ('.jsx', '.js', '.py', '.json')

# 1. Folders to ignore anywhere they appear
GLOBAL_IGNORE_DIRS = {
    # Package & Virtual Environments
    'node_modules', 'venv', '.venv', 'env', '__pycache__',
    # Version control & IDEs
    '.git', '.github', '.vscode', '.idea',
    # Testing & Coverage
    '.pytest_cache', 'coverage', '.nyc_output', '__tests__', 'tests',
    # Build outputs & Bundlers (moved to global: you rarely want these anywhere)
    'dist', 'build', 'out', '.next', '.nuxt', '.turbo', '.cache',
    # Static assets & storage
    'static', 'public', 'assets', 'media', 'uploads', 'storage'
}

# 2. Files that clutter the output and are NOT architectural code
IGNORE_EXACT_FILES = {
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'poetry.lock',
    'Pipfile.lock',
    'bundle.py',
    OUTPUT_FILE
}

# 3. File substrings/suffixes to skip (tests, minified files, mocks)
IGNORE_NAME_CONTAINS = (
    '.min.',       # Minified scripts (e.g., app.min.js)
    '.bundle.',    # Bundled code
    '.test.',      # Unit tests (e.g., auth.test.js)
    '.spec.',      # Spec files (e.g., app.spec.jsx)
    '_test.py',    # Python tests
    'test_',       # Python tests
    '.mock.',      # Mock data
)

# 4. Skip files larger than this (JSON dumps, huge fixtures, etc.)
MAX_FILE_SIZE_KB = 150  # 150 KB limit


def should_skip_file(filename, file_path):
    """Determine if a file should be excluded from the bundle."""
    # Check exact file matches
    if filename in IGNORE_EXACT_FILES:
        return True

    # Check extension
    if not filename.endswith(VALID_EXTENSIONS):
        return True

    # Check noise patterns (tests, minified assets)
    if any(pattern in filename for pattern in IGNORE_NAME_CONTAINS):
        return True

    # Check file size to avoid dumping huge data files
    try:
        if os.path.getsize(file_path) > (MAX_FILE_SIZE_KB * 1024):
            return True
    except OSError:
        return True

    return False


with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
    for root, dirs, files in os.walk('.'):
        # Prune ignored directories in-place (prevents traversing into them)
        dirs[:] = [d for d in dirs if d not in GLOBAL_IGNORE_DIRS and not d.startswith('.')]

        for file in files:
            file_path = os.path.join(root, file)

            if should_skip_file(file, file_path):
                continue

            # Normalized path for cleaner output headers
            clean_display_path = file_path.replace('\\', '/')

            outfile.write(f"\n\n=========================================\n")
            outfile.write(f"CORE SYSTEM FILE: {clean_display_path}\n")
            outfile.write(f"=========================================\n\n")

            try:
                with open(file_path, 'r', encoding='utf-8') as infile:
                    outfile.write(infile.read())
            except Exception as e:
                outfile.write(f"[Could not read file: {e}]\n")

print(f"Success! Cleaned architecture blueprint saved to {OUTPUT_FILE}")