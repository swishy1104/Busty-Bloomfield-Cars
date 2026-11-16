// Bloomfield Drift desktop launcher.
// The game is a browser app; this program embeds every game file, serves them on 127.0.0.1 and opens the page in the
// Chromium browser already on the machine (Edge, Chrome or Brave) in "app" mode, which gives a plain game window without
// tabs or an address bar. It quits by itself about a minute after the window closes (the page sends a heartbeat).
// Built by ../build.sh for Windows, macOS and Linux; no network is needed to play (three.js is bundled).
package main

import (
	"bytes"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"time"
)

var version = "dev"

// A fixed port keeps the page's origin the same from one launch to the next, so the browser keeps the game's saved
// settings, best times and ghost laps (web storage is per origin).
const port = 27831

const heartbeat = `<script>(function(){var p=function(){fetch('/__alive',{cache:'no-store'}).catch(function(){})};p();setInterval(p,3000)})()</script>`

var lastPing atomic.Int64

func main() {
	logFile, _ := os.OpenFile(filepath.Join(os.TempDir(), "bloomfield-drift.log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if logFile != nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}
	log.Printf("Bloomfield Drift %s on %s/%s", version, runtime.GOOS, runtime.GOARCH)
	// Windows reads MIME types from the registry, where .js is sometimes text/plain: pin the ones the game uses
	for ext, typ := range map[string]string{".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".mp3": "audio/mpeg"} {
		mime.AddExtensionType(ext, typ)
	}
	game, err := gameFiles()
	if err != nil {
		log.Fatal(err)
	}
	index, err := fs.ReadFile(game, "index.html")
	if err != nil {
		log.Fatal(err)
	}
	index = bytes.Replace(index, []byte("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"), []byte("three.min.js"), 1)
	if i := bytes.LastIndex(index, []byte("</body>")); i >= 0 {
		index = append(index[:i:i], append([]byte(heartbeat), index[i:]...)...)
	} else { // the page has no closing tags: the scripts simply end the file
		index = append(index, []byte("\n"+heartbeat+"\n")...)
	}

	files := http.FileServer(http.FS(game))
	mux := http.NewServeMux()
	mux.HandleFunc("/__alive", func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().UnixNano())
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.Write(index)
			return
		}
		files.ServeHTTP(w, r)
	})

	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil { // a copy is already running: open its window instead
		log.Printf("port busy (%v): opening the running copy", err)
		openBrowser(url)
		return
	}
	go func() { log.Fatal(http.Serve(ln, mux)) }()
	log.Printf("serving %s", url)
	openBrowser(url)

	// quit once the page stops its heartbeat; the long timeout survives a minimised window, whose timers slow to one a minute
	start := time.Now()
	for {
		time.Sleep(2 * time.Second)
		lp := lastPing.Load()
		if lp == 0 {
			if time.Since(start) > 2*time.Minute {
				log.Print("no page connected: quitting")
				return
			}
			continue
		}
		if time.Since(time.Unix(0, lp)) > 75*time.Second {
			log.Print("window closed: quitting")
			return
		}
	}
}

// openBrowser opens the game in a Chromium browser's app mode, or in the default browser if none is installed.
func openBrowser(url string) {
	flags := []string{"--app=" + url, "--window-size=1600,900", "--no-first-run", "--no-default-browser-check"}
	for _, p := range chromiumPaths() {
		if _, err := os.Stat(p); err != nil {
			continue
		}
		if err := exec.Command(p, flags...).Start(); err == nil {
			log.Printf("opened with %s", p)
			return
		}
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	log.Printf("no Chromium browser found: default browser (%v)", cmd.Start())
}

func chromiumPaths() []string {
	var out []string
	switch runtime.GOOS {
	case "windows":
		for _, base := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LocalAppData")} {
			if base == "" {
				continue
			}
			out = append(out,
				filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
				filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"),
				filepath.Join(base, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"))
		}
	case "darwin":
		home, _ := os.UserHomeDir()
		for _, base := range []string{"/Applications", filepath.Join(home, "Applications")} {
			out = append(out,
				filepath.Join(base, "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
				filepath.Join(base, "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
				filepath.Join(base, "Brave Browser.app", "Contents", "MacOS", "Brave Browser"),
				filepath.Join(base, "Chromium.app", "Contents", "MacOS", "Chromium"))
		}
	default:
		for _, name := range []string{"google-chrome", "google-chrome-stable", "microsoft-edge", "brave-browser", "chromium", "chromium-browser"} {
			if p, err := exec.LookPath(name); err == nil {
				out = append(out, p)
			}
		}
	}
	return out
}
