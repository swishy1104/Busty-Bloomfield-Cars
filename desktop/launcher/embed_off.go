//go:build noembed

package main

import (
	"io/fs"
	"os"
	"path/filepath"
)

// macOS builds (two binaries, Apple silicon and Intel) share one copy of the game in the app bundle's Resources/game.
func gameFiles() (fs.FS, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	if p, err := filepath.EvalSymlinks(exe); err == nil {
		exe = p
	}
	return os.DirFS(filepath.Join(filepath.Dir(exe), "..", "Resources", "game")), nil
}
