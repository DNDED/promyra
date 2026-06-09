package main

import "testing"

func TestHashTokenDeterministic(t *testing.T) {
	a := hashToken("hello")
	b := hashToken("hello")
	if a != b {
		t.Fatalf("expected deterministic, got %s vs %s", a, b)
	}
}

func TestHashTokenDifferentInputs(t *testing.T) {
	a := hashToken("a")
	b := hashToken("b")
	if a == b {
		t.Fatalf("expected different hashes, both = %s", a)
	}
}
