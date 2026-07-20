# bundle.py
import os

OUTPUT_FILE = 'system_architecture.txt'

# Only look at essential extensions
VALID_EXTENSIONS = ('.jsx', '.js', '.py', '.json')

# 1. COMPLETELY IGNORE these folders anywhere they appear
GLOBAL_IGNORE_DIRS = {
    'node_modules', 'venv', '.venv', '.git', '__pycache__', '.pytest_cache'
}

# 2. ONLY IGNORE these folders if they are in the root directory (depth 1)
# This prevents accidentally skipping nested source folders like 'app/storage'
ROOT_ONLY_IGNORE_DIRS = {
    'dist', 'build', 'storage', 'vendor', 'public', 'assets', 'vendor_packages', 'uploads'
}

with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
    for root, dirs, files in os.walk('.'):
        # Normalize the path representation
        normalized_root = root.replace('\\', '/')
        path_parts = [p for p in normalized_root.split('/') if p]

        # Skip walking if any globally ignored directory is in the current path
        if any(ignored in path_parts for ignored in GLOBAL_IGNORE_DIRS):
            continue

        # Prune directory trees in-place
        if root == '.':
            # At the root, apply both global and root-only ignore lists
            dirs[:] = [d for d in dirs if d not in ROOT_ONLY_IGNORE_DIRS and d not in GLOBAL_IGNORE_DIRS]
        else:
            # Inside subdirectories, only prune globally ignored folders
            dirs[:] = [d for d in dirs if d not in GLOBAL_IGNORE_DIRS]

        for file in files:
            # Check extension match and exclude this bundler script itself
            if not file.endswith(VALID_EXTENSIONS) or file == 'bundle.py':
                continue

            file_path = os.path.join(root, file)

            # Write distinct separators
            outfile.write(f"\n\n=========================================\n")
            outfile.write(f"CORE SYSTEM FILE: {file_path}\n")
            outfile.write(f"=========================================\n\n")

            try:
                with open(file_path, 'r', encoding='utf-8') as infile:
                    outfile.write(infile.read())
            except Exception as e:
                outfile.write(f"[Could not read file: {e}]\n")

print(f"Success! Core architecture blueprint saved to {OUTPUT_FILE}")