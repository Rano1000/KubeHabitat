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

	"github.com/Rano1000/KubeHabitat/backend/internal/cluster"
	"github.com/Rano1000/KubeHabitat/backend/internal/httpapi"
	"k8s.io/client-go/kubernetes"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:8080", "HTTP listen address")
	staticDir := flag.String("static-dir", "", "Optional compiled frontend directory")
	live := flag.Bool("live", false, "Enable read-only Kubernetes discovery")
	kubeconfig := flag.String("kubeconfig", "", "Optional backend-only kubeconfig path")
	kubecontext := flag.String("context", "", "Optional kubeconfig context")
	inCluster := flag.Bool("in-cluster", false, "Use the pod service account for authentication")
	clusterName := flag.String("cluster-name", "my-cluster", "Display label, never an API server address")
	allowLogs := flag.Bool("allow-logs", false, "Enable on-demand container log reads; requires get on pods/log")
	flag.Parse()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var store *cluster.Store
	if *live {
		config, err := cluster.Config(*kubeconfig, *kubecontext, *inCluster)
		if err != nil {
			log.Fatal("Kubernetes configuration could not be loaded; check backend kubeconfig/context")
		}
		client, err := kubernetes.NewForConfig(config)
		if err != nil {
			log.Fatal("Kubernetes client could not be initialized")
		}
		store = cluster.NewStore(*clusterName)
		if err := store.Start(ctx, client); err != nil {
			log.Fatal(err)
		}
		store.StartMetrics(ctx, client.CoreV1().RESTClient())
		store.ConfigureInvestigation(client, *allowLogs)
	} else if *kubeconfig != "" || *kubecontext != "" || *inCluster || *allowLogs {
		log.Fatal("Kubernetes options require -live")
	}
	handler, err := httpapi.NewHandlerWithCluster(*staticDir, store)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr: *listen, Handler: handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}
	listener, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("KubeHabitat listening on %s; live discovery enabled: %t", *listen, *live)
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
