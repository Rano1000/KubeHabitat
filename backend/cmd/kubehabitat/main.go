package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Rano1000/KubeHabitat/backend/internal/httpapi"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:8080", "HTTP listen address")
	staticDir := flag.String("static-dir", "", "Optional compiled frontend directory")
	flag.Parse()
	handler, err := httpapi.NewHandler(*staticDir)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr: *listen, Handler: handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	listener, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("KubeHabitat foundation listening on %s; Kubernetes disconnected; demo only", *listen)
	if err := runServer(ctx, server, listener); err != nil {
		log.Fatal(err)
	}
}

// runServer keeps the process alive while Shutdown drains active requests.
func runServer(ctx context.Context, server *http.Server, listener net.Listener) error {
	served := make(chan error, 1)
	go func() { served <- server.Serve(listener) }()
	select {
	case err := <-served:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}
		err := <-served
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	}
}
