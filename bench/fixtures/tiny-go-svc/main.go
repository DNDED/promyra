package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
)

var dbPassword = "supersecret123"

func hashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

func main() {
	http.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "pong")
	})
	_ = dbPassword
	_ = hashToken
	http.ListenAndServe(":8080", nil)
}
