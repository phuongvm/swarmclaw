# Electron Build Resources

App icons consumed by `electron-builder`:

- `icon.icns`: macOS (1024×1024 source, all @1x/@2x sizes baked in)
- `icon.ico`: Windows (multi-resolution: 16, 24, 32, 48, 64, 128, 256)
- `icon.png`: Linux (1024×1024) and runtime fallback for `app.dock.setIcon`

These files are generated from `public/branding/swarmclaw-org-avatar.png` by
`scripts/gen-icons.mjs` (macOS only — requires `sips` + `iconutil` from Xcode
command line tools, plus the `png-to-ico` devDependency). Regenerate with:

```
node scripts/gen-icons.mjs
```

Commit the regenerated files. The generator is deterministic for the same source.
