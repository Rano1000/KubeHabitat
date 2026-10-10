package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestShutdownWaitsForActiveRequest(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	requestStarted := make(chan struct{})
	releaseRequest := make(chan struct{})
	defer close(releaseRequest)
	shutdownStarted := make(chan struct{})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(requestStarted)
		select {
		case <-releaseRequest:
		case <-r.Context().Done():
			return
		}
		_, _ = io.WriteString(w, "request completed")
	})}
	defer server.Close()
	server.RegisterOnShutdown(func() { close(shutdownStarted) })
	serverDone := make(chan error, 1)
	go func() { serverDone <- runServer(ctx, server, listener) }()
	client := &http.Client{Timeout: 3 * time.Second}
	defer client.CloseIdleConnections()
	responseDone := make(chan error, 1)
	go func() {
		resp, err := client.Get("http://" + listener.Addr().String())
		if err == nil {
			defer resp.Body.Close()
			var body []byte
			body, err = io.ReadAll(resp.Body)
			if err == nil && (resp.StatusCode != http.StatusOK || string(body) != "request completed") {
				err = io.ErrUnexpectedEOF
			}
		}
		responseDone <- err
	}()
	waitSignal(t, requestStarted)
	cancel()
	waitSignal(t, shutdownStarted)
	select {
	case err := <-serverDone:
		t.Fatalf("server returned before the active request completed: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	releaseRequest <- struct{}{}
	for _, done := range []<-chan error{responseDone, serverDone} {
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("request or shutdown did not finish")
		}
	}
}

func waitSignal(t *testing.T, signal <-chan struct{}) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(3 * time.Second):
		t.Fatal("server lifecycle signal timed out")
	}
}
