---
"@aliou/nvim-pi": minor
---

Add `load_extension` config option to control whether the bundled extension is passed via `--extension` when pi-nvim opens Pi. Defaults to `"auto"`, which skips `--extension` if nvim-pi is already installed globally (detected via `pi list`). Set to `true` to always pass `--extension`, or `false` to never pass it.
