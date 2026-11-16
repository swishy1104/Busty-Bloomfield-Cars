//go:build !noembed

package main

import (
	"embed"
	"io/fs"
)

// Windows and Linux builds carry the game inside the executable.
//
//go:embed all:game
var gameFS embed.FS

func gameFiles() (fs.FS, error) { return fs.Sub(gameFS, "game") }
