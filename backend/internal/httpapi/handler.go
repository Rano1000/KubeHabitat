// Package httpapi exposes read-only status, inventory, and static browser assets.
package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/Rano1000/KubeHabitat/backend/internal/cluster"
)

const Version = "0.2.0"

// Status makes backend availability independent of Kubernetes connectivity.
type Status struct {
	Service    string `json:"service"`
	Version    string `json:"version"`
	Connection string `json:"connection"`
	DataSource string `json:"dataSource"`
	Message    string `json:"message"`
}

func NewHandler(staticDir string) (http.Handler, error) {
	return NewHandlerWithCluster(staticDir, nil)
}

func NewHandlerWithCluster(staticDir string, store *cluster.Store) (http.Handler, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		if store != nil {
			snapshot := store.Snapshot()
			writeJSON(w, http.StatusOK, Status{Service: "kubehabitat", Version: Version, Connection: snapshot.Connection, DataSource: "kubernetes", Message: "Read-only live discovery. Check visibility for resource-specific freshness and permissions."})
			return
		}
		writeJSON(w, http.StatusOK, Status{
			Service: "kubehabitat", Version: Version, Connection: "disconnected", DataSource: "demo",
			Message: "Phase 01 foundation. No Kubernetes client is configured. Resources are local demo fixtures.",
		})
	})
	mux.HandleFunc("GET /api/v1/snapshot", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "Live discovery is disabled. Start the backend with -live; demo fixtures are never returned by this endpoint."})
			return
		}
		writeJSON(w, http.StatusOK, store.Snapshot())
	})
	var files http.Handler
	if staticDir != "" {
		index, err := os.Stat(filepath.Join(staticDir, "index.html"))
		if err != nil || !index.Mode().IsRegular() {
			return nil, fmt.Errorf("static directory must contain a readable index.html: %s", staticDir)
		}
		files = http.FileServer(http.Dir(staticDir))
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "read-only endpoint"})
			return
		}
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "API route not found"})
			return
		}
		if files == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Frontend not configured; start Vite or provide -static-dir"})
			return
		}
		files.ServeHTTP(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		mux.ServeHTTP(w, r)
	}), nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
