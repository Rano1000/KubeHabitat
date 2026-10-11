package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Rano1000/KubeHabitat/backend/internal/cluster"
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
		for _, path := range []string{"/healthz", "/api/v1/status", "/api/v1/snapshot", "/api/v1/investigation", "/api/v1/logs", "/"} {
			w = httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(method, path, nil))
			if w.Code != http.StatusMethodNotAllowed {
				t.Errorf("%s %s accepted: %d", method, path, w.Code)
			}
		}
	}
}

func TestEvidenceRoutesRequireLiveAndObservedIdentity(t *testing.T) {
	for _, route := range []string{"/api/v1/investigation", "/api/v1/logs"} {
		disabled, _ := NewHandler("")
		w := httptest.NewRecorder()
		disabled.ServeHTTP(w, httptest.NewRequest("GET", route+"?resource=Pod:test", nil))
		if w.Code != 409 {
			t.Fatal("disabled discovery accepted evidence read")
		}
		handler, _ := NewHandlerWithCluster("", cluster.NewStore("test"))
		for _, query := range []string{"", "?resource=a&resource=b", "?resource=a&previous=invalid"} {
			w = httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest("GET", route+query, nil))
			if w.Code != 400 {
				t.Fatal("invalid evidence query accepted")
			}
		}
		w = httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", route+"?resource=Pod:absent", nil))
		if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("evidence cached or missing identity invented")
		}
	}
}

func TestSnapshotConditionalGetDoesNotResendUnchangedInventory(t *testing.T) {
	handler, err := NewHandlerWithCluster("", cluster.NewStore("test"))
	if err != nil {
		t.Fatal(err)
	}
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/v1/snapshot", nil))
	etag := first.Header().Get("ETag")
	if first.Code != http.StatusOK || etag == "" {
		t.Fatal("snapshot must provide an ETag")
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/snapshot", nil)
	request.Header.Set("If-None-Match", etag)
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, request)
	if second.Code != http.StatusNotModified || second.Body.Len() != 0 {
		t.Fatal("unchanged inventory must produce a body-free heartbeat")
	}
	other, _ := NewHandlerWithCluster("", cluster.NewStore("different session"))
	third := httptest.NewRecorder()
	other.ServeHTTP(third, request)
	if third.Code != http.StatusOK || third.Header().Get("ETag") == etag {
		t.Fatal("new sessions must replace the cached inventory")
	}
}

func TestLiveSnapshotNeverSubstitutesDemoData(t *testing.T) {
	for _, live := range []bool{false, true} {
		var store *cluster.Store
		if live {
			store = cluster.NewStore("test")
		}
		handler, err := NewHandlerWithCluster("", store)
		if err != nil {
			t.Fatal(err)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/snapshot", nil))
		if !live {
			if w.Code != http.StatusConflict {
				t.Fatalf("disabled snapshot returned %d", w.Code)
			}
			continue
		}
		var snapshot cluster.Snapshot
		if err := json.Unmarshal(w.Body.Bytes(), &snapshot); err != nil {
			t.Fatal(err)
		}
		if w.Code != http.StatusOK || snapshot.DataSource != "kubernetes" || snapshot.Connection != "disconnected" || len(snapshot.Resources) != 0 || len(snapshot.Visibility) != 11 || snapshot.Metrics.State != "unavailable" {
			t.Fatalf("initial snapshot invented a connected cluster: %+v", snapshot)
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
