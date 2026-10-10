package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDisconnectedStatusAndReadOnlyBoundary(t *testing.T) {
	handler, err := NewHandler("")
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/status", nil))
	var status Status
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusOK || status.Connection != "disconnected" || status.DataSource != "demo" {
		t.Fatalf("foundation must not imply live connectivity: %d %+v", w.Code, status)
	}
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		for _, path := range []string{"/healthz", "/api/v1/status", "/"} {
			w = httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(method, path, nil))
			if w.Code != http.StatusMethodNotAllowed {
				t.Errorf("%s %s accepted: %d", method, path, w.Code)
			}
		}
	}
}

func TestStaticFrontendCannotMaskMissingAPI(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>Habitat</h1>"), 0600); err != nil {
		t.Fatal(err)
	}
	handler, err := NewHandler(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		path        string
		code        int
		contentType string
	}{
		{"/", http.StatusOK, "text/html; charset=utf-8"},
		{"/api/v1/missing", http.StatusNotFound, "application/json; charset=utf-8"},
		{"/missing.js", http.StatusNotFound, "text/plain; charset=utf-8"},
	} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, check.path, nil))
		if w.Code != check.code || w.Header().Get("Content-Type") != check.contentType {
			t.Errorf("%s: got %d %s", check.path, w.Code, w.Header().Get("Content-Type"))
		}
	}
	if _, err := NewHandler(t.TempDir()); err == nil {
		t.Fatal("invalid static directory accepted")
	}
}
