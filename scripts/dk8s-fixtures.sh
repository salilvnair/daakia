#!/usr/bin/env bash
#
# dk8s test fixtures: up, down, and what is running.
#
# ── Why scaling and not deleting ──
#
# The fixture pods are a couple of dozen deliberately broken workloads —
# crashloop, OOM, hung, leaky, tmpfs, no-shell, a Spring Boot pod with a PVC —
# and most of them were created ad hoc rather than from a manifest in this
# repo. Deleting them frees the same memory as scaling them to zero and loses
# the scenario; `--replicas=0` frees it and keeps every Deployment, its
# ConfigMaps, its PVC and its history exactly where they were.
#
# So `down` scales to zero and `up` scales back. Nothing here deletes anything.
#
# ── Why it lives in scripts/ ──
#
# `scripts` is already in .vscodeignore, so none of this reaches the packaged
# extension. It is developer tooling for a machine that also runs the cluster.
#
# Usage:
#   ./scripts/dk8s-fixtures.sh down            # stop everything
#   ./scripts/dk8s-fixtures.sh down zp-sidecar # stop everything except this
#   ./scripts/dk8s-fixtures.sh up              # start everything again
#   ./scripts/dk8s-fixtures.sh up zp-config    # start just this one
#   ./scripts/dk8s-fixtures.sh status
#   ./scripts/dk8s-fixtures.sh snapshot        # write manifests to disk
set -euo pipefail

# Every context/namespace pair the fixtures live in. Missing ones are skipped,
# so this is safe on a machine that only has one of the two clusters.
CONTEXTS=("docker-desktop" "kind-dk8s-lab")
NAMESPACES=("dk8s-test" "zp-platform" "payments")

SNAPSHOT_DIR="src/test/fixtures/k8s/snapshot"

have_ns() { kubectl --context "$1" get ns "$2" >/dev/null 2>&1; }

# Scale every Deployment in every fixture namespace, optionally sparing some.
#
# The spare list is matched on the Deployment name, not the pod name, because
# a pod name carries a ReplicaSet hash that changes on every rollout — telling
# the script to keep `zp-sidecar-85b5d56498-cn27n` would work once.
scale_all() {
  local replicas="$1"; shift
  local spare=("$@")
  local touched=0

  for ctx in "${CONTEXTS[@]}"; do
    kubectl config get-contexts -o name 2>/dev/null | grep -qx "$ctx" || continue
    for ns in "${NAMESPACES[@]}"; do
      have_ns "$ctx" "$ns" || continue
      while read -r d; do
        [ -z "$d" ] && continue
        for s in ${spare[@]+"${spare[@]}"}; do
          [ "$d" = "$s" ] && continue 2
        done
        kubectl --context "$ctx" scale deploy -n "$ns" "$d" --replicas="$replicas" >/dev/null 2>&1 \
          && { printf '  %-22s %s/%s\n' "$d" "$ctx" "$ns"; touched=$((touched + 1)); }
      done < <(kubectl --context "$ctx" get deploy -n "$ns" --no-headers -o custom-columns=:metadata.name 2>/dev/null)
    done
  done
  echo "  ── $touched deployment(s) set to $replicas replica(s)"
}

# Only the deployments named, wherever they are. `up zp-config` should not
# need to know which cluster zp-config is in.
scale_named() {
  local replicas="$1"; shift
  for ctx in "${CONTEXTS[@]}"; do
    kubectl config get-contexts -o name 2>/dev/null | grep -qx "$ctx" || continue
    for ns in "${NAMESPACES[@]}"; do
      have_ns "$ctx" "$ns" || continue
      for d in "$@"; do
        kubectl --context "$ctx" scale deploy -n "$ns" "$d" --replicas="$replicas" >/dev/null 2>&1 \
          && printf '  %-22s %s/%s\n' "$d" "$ctx" "$ns"
      done
    done
  done
}

case "${1:-status}" in
  down)
    shift || true
    if [ "$#" -gt 0 ]; then
      echo "Stopping everything except: $*"
      scale_all 0 "$@"
    else
      echo "Stopping every fixture"
      scale_all 0
    fi
    ;;

  up)
    shift || true
    if [ "$#" -gt 0 ]; then
      echo "Starting: $*"
      scale_named 1 "$@"
    else
      echo "Starting every fixture"
      scale_all 1
    fi
    ;;

  status)
    for ctx in "${CONTEXTS[@]}"; do
      kubectl config get-contexts -o name 2>/dev/null | grep -qx "$ctx" || continue
      echo "── $ctx"
      for ns in "${NAMESPACES[@]}"; do
        have_ns "$ctx" "$ns" || continue
        running=$(kubectl --context "$ctx" get pods -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
        total=$(kubectl --context "$ctx" get deploy -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
        printf '   %-14s %s pod(s) running, %s deployment(s) defined\n' "$ns" "$running" "$total"
      done
    done
    ;;

  snapshot)
    # A copy on disk, because most fixtures have no manifest in this repo and
    # a `down` that ever became a `delete` would take them with it.
    mkdir -p "$SNAPSHOT_DIR"
    for ctx in "${CONTEXTS[@]}"; do
      kubectl config get-contexts -o name 2>/dev/null | grep -qx "$ctx" || continue
      for ns in "${NAMESPACES[@]}"; do
        have_ns "$ctx" "$ns" || continue
        out="$SNAPSHOT_DIR/${ctx}__${ns}.yaml"
        kubectl --context "$ctx" get deploy,statefulset,daemonset,cronjob,pvc,configmap,secret,service \
          -n "$ns" -o yaml > "$out" 2>/dev/null
        printf '  %s (%s lines)\n' "$out" "$(wc -l < "$out" | tr -d ' ')"
      done
    done
    ;;

  *)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
