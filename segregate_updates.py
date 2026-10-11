import os
import sys

OUTPUT_FILE = "system_architecture.txt"

# 1. Strictly target Python, JavaScript, and React JSX files
TARGET_EXTENSIONS = (".py", ".jsx", ".js")

# 2. Directories to completely ignore (builds, dependencies, cache, uploads)
GLOBAL_IGNORE_DIRS = {
    "node_modules", "venv", ".venv", "env", "__pycache__",
    ".git", ".github", ".vscode", ".idea",
    ".pytest_cache", "coverage", ".nyc_output",
    "dist", "build", "out", ".next", ".nuxt", ".cache",
    "uploads"  # Skip image/PDF upload assets
}

# 3. Filenames and patterns to skip (tests, bundles, minified scripts, and the generator script itself)
SCRIPT_NAME = os.path.basename(__file__)
IGNORE_EXACT_FILES = {
    OUTPUT_FILE,
    SCRIPT_NAME,
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock"
}

IGNORE_NAME_CONTAINS = (
    ".min.", ".bundle.", ".map.", ".test.", ".spec.",
    "_test.py", "test_"
)

MAX_FILE_SIZE_KB = 500  # Safety threshold per file


def is_target_code_file(filename, file_path):
    """Determines whether a file is a valid .py, .jsx, or .js architectural code file."""
    if filename in IGNORE_EXACT_FILES:
        return False
    if any(pattern in filename for pattern in IGNORE_NAME_CONTAINS):
        return False
    return filename.endswith(TARGET_EXTENSIONS)


def build_filtered_directory_tree(start_path):
    """Builds a clean directory tree showing only folders and files containing target code."""
    tree_lines = [
        "=" * 70,
        "SYSTEM DIRECTORY TREE MAP (.py, .jsx, .js ONLY)",
        "=" * 70
    ]

    for root, dirs, files in os.walk(start_path):
        # Exclude ignored directories in-place
        dirs[:] = [d for d in dirs if d not in GLOBAL_IGNORE_DIRS and not d.startswith(".")]
        dirs.sort()

        # Filter only target code files
        valid_files = [
            f for f in sorted(files) 
            if is_target_code_file(f, os.path.join(root, f))
        ]

        # Skip folders that have no subdirs and no matching files
        if not valid_files and not dirs:
            continue

        rel_path = os.path.relpath(root, start_path)
        if rel_path == ".":
            tree_lines.append("📁 [PROJECT ROOT]")
            level = 0
        else:
            level = rel_path.count(os.sep) + 1
            indent = "    " * (level - 1)
            tree_lines.append(f"{indent}📁 {os.path.basename(root)}/")

        sub_indent = "    " * level
        for f in valid_files:
            tree_lines.append(f"{sub_indent}📄 {f}")

    tree_lines.append("\n" + "=" * 70 + "\n")
    return "\n".join(tree_lines)


def main():
    print(f"Scanning and extracting code architecture (.py, .jsx, .js) into '{OUTPUT_FILE}'...")

    file_count = 0
    total_lines = 0

    with open(OUTPUT_FILE, "w", encoding="utf-8", errors="replace") as outfile:
        # 1. Output the filtered tree map first
        outfile.write(build_filtered_directory_tree("."))

        # 2. Iterate through directories and dump source files
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in GLOBAL_IGNORE_DIRS and not d.startswith(".")]
            dirs.sort()
            files.sort()

            for file in files:
                file_path = os.path.join(root, file)

                if not is_target_code_file(file, file_path):
                    continue

                clean_display_path = file_path.replace("\\", "/")
                file_size_kb = os.path.getsize(file_path) / 1024

                # Skip files exceeding safety size
                if file_size_kb > MAX_FILE_SIZE_KB:
                    print(f"Skipping large file: {clean_display_path} ({file_size_kb:.1f} KB)")
                    continue

                outfile.write("\n=========================================\n")
                outfile.write(f"CORE SYSTEM FILE: {clean_display_path}\n")
                outfile.write("=========================================\n\n")

                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as infile:
                        content = infile.read()
                        outfile.write(content)
                        if not content.endswith("\n"):
                            outfile.write("\n")
                        total_lines += content.count("\n")
                    file_count += 1
                except Exception as e:
                    outfile.write(f"[Error reading file: {e}]\n")

    print(f"Done! Successfully generated '{OUTPUT_FILE}'.")
    print(f"Summary: Captured {file_count} source code files (~{total_lines} lines of code).")


if __name__ == "__main__":
    main()