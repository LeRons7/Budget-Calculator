package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type HealthResponse struct {
	Status string `json:"status"`
}
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type UserResponse struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}
type RegisterResponse struct {
	Token string       `json:"token"`
	User  UserResponse `json:"user"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal("cannot create pool", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal("cannot ping progress", err)
	}
	log.Println("Connected to postgres")

	mux := http.NewServeMux()

	fs := http.FileServer(http.Dir("./frontend"))
	mux.HandleFunc("GET /api/health", HealthHandler)
	mux.HandleFunc("POST /api/auth/register", RegisterHandler)
	mux.Handle("/", fs)

	log.Println("server created on :" + port)

	log.Fatal(http.ListenAndServe(":"+port, mux))
}
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{Status: "ok"})
}
func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	reg := RegisterRequest{}

	if err := json.NewDecoder(r.Body).Decode(&reg); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if reg.Email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if !strings.Contains(reg.Email, "@") {
		writeError(w, http.StatusBadRequest, "invalid email")
		return
	}
	if len(reg.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(reg.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot hash password")
		return
	}
	response := map[string]string{
		"email":         reg.Email,
		"password_hash": string(hash),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
